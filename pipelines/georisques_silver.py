"""Silver Géorisques : entrepôts (rubrique 1510) + identification des exploitants via SIRENE."""
import sys
import time

import requests

from pipelines.common.db import end_run, get_conn, start_run

SOURCE_ID = "georisques_icpe"
SIRENE_URL = "https://recherche-entreprises.api.gouv.fr/search"
PAUSE_S = 0.2

session = requests.Session()


def build_entrepots(conn) -> int:
    with conn.cursor() as cur:
        cur.execute("truncate silver.entrepots_icpe")
        cur.execute(
            """
            insert into silver.entrepots_icpe (
              code_aiot, raison_sociale, siret, regime_etablissement, regime_1510,
              volume_1510, unite_1510, adresse, code_postal, code_insee, commune,
              departement, derniere_inspection, date_maj_source, geom
            )
            select
              b.code_aiot,
              b.payload->>'raisonSociale',
              nullif(b.payload->>'siret', ''),
              b.payload->>'regime',
              r.regime_1510,
              r.volume,
              r.unite,
              concat_ws(' ', b.payload->>'adresse1', b.payload->>'adresse2', b.payload->>'adresse3'),
              b.payload->>'codePostal',
              b.payload->>'codeInsee',
              b.payload->>'commune',
              left(b.payload->>'codeInsee', 2),
              (
                select max(nullif(i->>'dateInspection', '')::date)
                from jsonb_array_elements(coalesce(b.payload->'inspections', '[]'::jsonb)) i
              ),
              b.payload->>'date_maj',
              case
                when jsonb_typeof(b.payload->'longitude') = 'number'
                 and jsonb_typeof(b.payload->'latitude') = 'number'
                then st_setsrid(st_makepoint(
                       (b.payload->>'longitude')::float8,
                       (b.payload->>'latitude')::float8), 4326)::geography
              end
            from bronze.georisques_installations b
            cross join lateral (
              select
                max(case when x->>'quantiteTotale' ~ '^[0-9]+([.][0-9]+)?$'
                         then (x->>'quantiteTotale')::numeric end) as volume,
                max(x->>'unite') as unite,
                string_agg(distinct x->>'regimeAutoriseAlinea', ', ') as regime_1510
              from jsonb_array_elements(coalesce(b.payload->'rubriques', '[]'::jsonb)) x
              where x->>'numeroRubrique' = '1510'
            ) r
            where exists (
              select 1
              from jsonb_array_elements(coalesce(b.payload->'rubriques', '[]'::jsonb)) x
              where x->>'numeroRubrique' = '1510'
            )
            """
        )
        nb = cur.rowcount
    conn.commit()
    return nb


def sirets_a_identifier(conn) -> list[str]:
    with conn.cursor() as cur:
        cur.execute(
            """
            select distinct e.siret
            from silver.entrepots_icpe e
            left join silver.exploitants x on x.siret = e.siret
            where e.siret ~ '^[0-9]{14}$' and x.siret is null
            """
        )
        return [r[0] for r in cur.fetchall()]


def lookup_siret(siret: str) -> dict | None:
    for tentative in range(6):
        try:
            r = session.get(SIRENE_URL, params={"q": siret, "per_page": 1}, timeout=30)
        except (requests.ConnectionError, requests.Timeout):
            time.sleep(3 * (tentative + 1))
            continue
        if r.status_code == 429 or r.status_code >= 500:
            time.sleep(3 * (tentative + 1))
            continue
        r.raise_for_status()
        results = r.json().get("results") or []
        return results[0] if results else None
    raise RuntimeError(f"Échec répété pour le SIRET {siret}")


def identify_exploitants(conn) -> None:
    sirets = sirets_a_identifier(conn)
    print(f"{len(sirets)} SIRET à identifier dans SIRENE")
    with conn.cursor() as cur:
        for i, siret in enumerate(sirets, 1):
            unite = lookup_siret(siret)
            if unite is None:
                cur.execute(
                    "insert into silver.exploitants (siret, trouve) values (%s, false) on conflict do nothing",
                    (siret,),
                )
            else:
                pp = (unite.get("nature_juridique") or "").startswith("1")
                etabs = unite.get("matching_etablissements") or []
                naf_etab = next((e.get("activite_principale") for e in etabs if e.get("siret") == siret), None)
                cur.execute(
                    """
                    insert into silver.exploitants
                      (siret, siren, raison_sociale, naf_unite, naf_etablissement,
                       tranche_effectif, personne_physique, trouve)
                    values (%s, %s, %s, %s, %s, %s, %s, true)
                    on conflict (siret) do nothing
                    """,
                    (
                        siret,
                        unite.get("siren"),
                        None if pp else (unite.get("nom_raison_sociale") or unite.get("nom_complet")),
                        unite.get("activite_principale"),
                        naf_etab,
                        unite.get("tranche_effectif_salarie"),
                        pp,
                    ),
                )
            if i % 50 == 0:
                conn.commit()
                print(f"Exploitants : {i}/{len(sirets)}")
            time.sleep(PAUSE_S)
    conn.commit()


def record_controles(conn, run_id: int) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            select
              (select count(*) from bronze.georisques_installations),
              (select count(*) from bronze.georisques_installations where payload->>'regime' = 'Non ICPE'),
              (select count(*) from silver.entrepots_icpe),
              (select count(*) from silver.entrepots_icpe where siret is null or siret !~ '^[0-9]{14}$'),
              (select count(*) from silver.entrepots_icpe where geom is null),
              (select count(*) from silver.entrepots_icpe e
                 join silver.exploitants x on x.siret = e.siret where not x.trouve)
            """
        )
        total, non_icpe, nb_1510, sans_siret, sans_geo, introuvables = cur.fetchone()
        controles = [
            ("Installations Non ICPE dans la base ICPE", non_icpe, total),
            ("Entrepots 1510 sans SIRET valide", sans_siret, nb_1510),
            ("Entrepots 1510 sans coordonnees", sans_geo, nb_1510),
            ("Entrepots 1510 dont le SIRET est introuvable dans SIRENE", introuvables, nb_1510),
        ]
        cur.executemany(
            """
            insert into gov.controles_qualite (run_id, source_id, nom_controle, nb_anomalies, nb_total)
            values (%s, %s, %s, %s, %s)
            """,
            [(run_id, SOURCE_ID, n, a, t) for n, a, t in controles],
        )
    conn.commit()
    print(f"\nEntrepôts rubrique 1510 : {nb_1510}")
    for n, a, t in controles:
        print(f"Contrôle : {n} : {a} / {t}")


def main() -> int:
    with get_conn() as conn:
        run_id = start_run(conn, SOURCE_ID)
    try:
        with get_conn() as conn:
            nb = build_entrepots(conn)
            print(f"{nb} entrepôts en silver")
        with get_conn() as conn:
            identify_exploitants(conn)
        with get_conn() as conn:
            record_controles(conn, run_id)
            end_run(conn, run_id, SOURCE_ID, "succes", nb, f"{nb} entrepôts 1510 en silver")
        return 0
    except Exception as exc:
        print(f"ECHEC : {exc}")
        try:
            with get_conn() as conn:
                end_run(conn, run_id, SOURCE_ID, "echec", 0, str(exc)[:500])
        except Exception:
            pass
        return 1


if __name__ == "__main__":
    sys.exit(main())
