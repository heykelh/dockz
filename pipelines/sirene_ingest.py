"""Ingestion SIRENE (API Recherche d'entreprises) vers bronze puis silver.

Usage :
  python -m pipelines.sirene_ingest               collecte API + bronze + silver
  python -m pipelines.sirene_ingest --silver-only reconstruit silver depuis le dernier bronze
"""
import argparse
import json
import sys
import time

import requests

from pipelines.common.db import end_run, get_conn, start_run

API_URL = "https://recherche-entreprises.api.gouv.fr/search"
SOURCE_ID = "sirene"

DEPARTEMENTS_IDF = ["75", "77", "78", "91", "92", "93", "94", "95"]

NAF_CIBLES = {
    "52.10A": "Entreposage et stockage frigorifique",
    "52.10B": "Entreposage et stockage non frigorifique",
    "52.29A": "Messagerie, fret express",
    "52.29B": "Affrètement et organisation des transports",
    "49.41A": "Transports routiers de fret interurbains",
    "49.41B": "Transports routiers de fret de proximité",
    "47.91A": "Vente à distance sur catalogue général",
    "47.91B": "Vente à distance sur catalogue spécialisé",
    "53.20Z": "Autres activités de poste et de courrier",
}

# Entreprises de 10 salariés et plus (codes INSEE de tranche d'effectif)
TRANCHES_10_PLUS = "11,12,21,22,31,32,41,42,51,52,53"

PER_PAGE = 25
PAUSE_S = 0.2
BATCH = 1000

COORD_REGEX = "^-?[0-9]+([.][0-9]+)?$"

session = requests.Session()


def fetch_page(departement: str, naf: str, page: int) -> dict:
    params = {
        "activite_principale": naf,
        "departement": departement,
        "etat_administratif": "A",
        "tranche_effectif_salarie": TRANCHES_10_PLUS,
        "per_page": PER_PAGE,
        "page": page,
    }
    for tentative in range(6):
        try:
            r = session.get(API_URL, params=params, timeout=30)
        except (requests.ConnectionError, requests.Timeout):
            time.sleep(3 * (tentative + 1))
            continue
        if r.status_code == 429 or r.status_code >= 500:
            time.sleep(3 * (tentative + 1))
            continue
        if r.status_code == 400:
            raise RuntimeError(f"Requête refusée par l'API : {r.text[:300]}")
        r.raise_for_status()
        return r.json()
    raise RuntimeError(f"Échec répété pour {departement} {naf} page {page}")


def collect() -> list[tuple[str, dict]]:
    rows: dict[str, dict] = {}
    for dep in DEPARTEMENTS_IDF:
        for naf in NAF_CIBLES:
            page = 1
            while True:
                data = fetch_page(dep, naf, page)
                for unite in data.get("results", []):
                    unite_sans_etabs = {k: v for k, v in unite.items() if k != "matching_etablissements"}
                    for etab in unite.get("matching_etablissements") or []:
                        siret = etab.get("siret")
                        if siret:
                            rows[siret] = {"unite": unite_sans_etabs, "etablissement": etab}
                total_pages = data.get("total_pages", 1) or 1
                if page >= total_pages:
                    break
                page += 1
                time.sleep(PAUSE_S)
            print(f"{dep} {naf} : {total_pages} page(s), {len(rows)} établissements cumulés")
    return list(rows.items())


def load_bronze(conn, run_id: int, rows: list[tuple[str, dict]]) -> None:
    with conn.cursor() as cur:
        for i in range(0, len(rows), BATCH):
            lot = rows[i:i + BATCH]
            cur.executemany(
                """
                insert into bronze.sirene_etablissements (siret, payload, run_id)
                values (%s, %s::jsonb, %s)
                on conflict (siret) do update
                   set payload = excluded.payload, run_id = excluded.run_id, ingere_le = now()
                """,
                [(siret, json.dumps(p, ensure_ascii=False), run_id) for siret, p in lot],
            )
            conn.commit()
            print(f"Bronze : {min(i + BATCH, len(rows))}/{len(rows)}")


def build_silver(conn, run_id: int) -> int:
    """Typage et nettoyage.
    Exclusions : personnes physiques (nature juridique 1xxx) et établissements non diffusibles.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into silver.etablissements (
              siret, siren, raison_sociale, naf, tranche_effectif, date_creation,
              est_siege, adresse, code_postal, commune, departement, geom, maj_le
            )
            select
              b.siret,
              b.payload->'unite'->>'siren',
              coalesce(b.payload->'unite'->>'nom_raison_sociale', b.payload->'unite'->>'nom_complet'),
              b.payload->'etablissement'->>'activite_principale',
              b.payload->'etablissement'->>'tranche_effectif_salarie',
              nullif(b.payload->'etablissement'->>'date_creation', '')::date,
              (b.payload->'etablissement'->>'est_siege')::boolean,
              b.payload->'etablissement'->>'adresse',
              b.payload->'etablissement'->>'code_postal',
              b.payload->'etablissement'->>'libelle_commune',
              left(b.payload->'etablissement'->>'code_postal', 2),
              case
                when b.payload->'etablissement'->>'latitude' ~ %(re)s
                 and b.payload->'etablissement'->>'longitude' ~ %(re)s
                then st_setsrid(st_makepoint(
                       (b.payload->'etablissement'->>'longitude')::float8,
                       (b.payload->'etablissement'->>'latitude')::float8), 4326)::geography
              end,
              now()
            from bronze.sirene_etablissements b
            where b.run_id = %(run_id)s
              and coalesce(b.payload->'unite'->>'nature_juridique', '') not like '1%%'
              and b.payload::text not like '%%NON-DIFFUSIBLE%%'
            on conflict (siret) do update set
              raison_sociale = excluded.raison_sociale,
              naf = excluded.naf,
              tranche_effectif = excluded.tranche_effectif,
              date_creation = excluded.date_creation,
              est_siege = excluded.est_siege,
              adresse = excluded.adresse,
              code_postal = excluded.code_postal,
              commune = excluded.commune,
              departement = excluded.departement,
              geom = excluded.geom,
              maj_le = now()
            """,
            {"re": COORD_REGEX, "run_id": run_id},
        )
        nb = cur.rowcount
    conn.commit()
    return nb


def record_controles(conn, run_id: int) -> None:
    """Enregistre les contrôles qualité de l'exécution dans gov.controles_qualite."""
    with conn.cursor() as cur:
        cur.execute(
            "select count(*) from bronze.sirene_etablissements where run_id = %s", (run_id,)
        )
        total = cur.fetchone()[0]

        cur.execute(
            """
            select
              count(*) filter (where coalesce(payload->'unite'->>'nature_juridique', '') like '1%%'),
              count(*) filter (where payload::text like '%%NON-DIFFUSIBLE%%')
            from bronze.sirene_etablissements
            where run_id = %s
            """,
            (run_id,),
        )
        nb_pp, nb_nd = cur.fetchone()

        cur.execute("select count(*), count(*) filter (where geom is null) from silver.etablissements")
        total_silver, nb_sans_geo = cur.fetchone()

        controles = [
            ("Personnes physiques exclues", nb_pp, total),
            ("Etablissements non diffusibles exclus", nb_nd, total),
            ("Etablissements sans coordonnees", nb_sans_geo, total_silver),
        ]
        cur.executemany(
            """
            insert into gov.controles_qualite (run_id, source_id, nom_controle, nb_anomalies, nb_total)
            values (%s, %s, %s, %s, %s)
            """,
            [(run_id, SOURCE_ID, nom, nb, tot) for nom, nb, tot in controles],
        )
    conn.commit()
    for nom, nb, tot in controles:
        print(f"Contrôle : {nom} : {nb} / {tot}")


def close_run_on_failure(run_id: int, exc: Exception) -> None:
    try:
        with get_conn() as conn:
            end_run(conn, run_id, SOURCE_ID, "echec", 0, str(exc)[:500])
    except Exception as exc2:
        print(f"Impossible d'enregistrer l'échec en base : {exc2}")


def run_full() -> int:
    with get_conn() as conn:
        run_id = start_run(conn, SOURCE_ID)
    try:
        rows = collect()
        with get_conn() as conn:
            load_bronze(conn, run_id, rows)
            nb_silver = build_silver(conn, run_id)
            record_controles(conn, run_id)
            end_run(conn, run_id, SOURCE_ID, "succes", len(rows),
                    f"{len(rows)} en bronze, {nb_silver} en silver")
        print(f"OK : {len(rows)} en bronze, {nb_silver} en silver (run {run_id})")
        return 0
    except Exception as exc:
        print(f"ECHEC : {exc}")
        close_run_on_failure(run_id, exc)
        return 1


def run_silver_only() -> int:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("select max(run_id), count(*) from bronze.sirene_etablissements")
            run_id, nb_bronze = cur.fetchone()
        if run_id is None:
            print("Bronze vide : lancer d'abord la collecte complète")
            return 1
        try:
            nb_silver = build_silver(conn, run_id)
            record_controles(conn, run_id)
            end_run(conn, run_id, SOURCE_ID, "succes", nb_bronze,
                    f"{nb_bronze} en bronze, {nb_silver} en silver (silver reconstruit)")
            print(f"OK : {nb_silver} en silver depuis le bronze du run {run_id}")
            return 0
        except Exception as exc:
            conn.rollback()
            print(f"ECHEC : {exc}")
            return 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--silver-only", action="store_true")
    args = parser.parse_args()
    sys.exit(run_silver_only() if args.silver_only else run_full())
