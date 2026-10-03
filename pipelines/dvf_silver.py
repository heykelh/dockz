"""Silver DVF : une ligne par vente de locaux industriels, commerciaux ou assimilés."""
import sys
from pathlib import Path

import duckdb

from pipelines.common.db import end_run, get_conn, start_run

SOURCE_ID = "dvf"
DEST = Path("data/raw/dvf")
TYPE_CIBLE = "Local industriel. commercial ou assimilé"

# Règles explicites, documentées sur la page Qualité
SURFACE_MIN_M2 = 10
PRIX_M2_MIN = 50
PRIX_M2_MAX = 30000

COLONNES = [
    "id_mutation", "date_mutation", "annee", "nature_mutation", "departement",
    "code_commune", "commune", "valeur_fonciere", "surface_locaux", "nb_locaux",
    "nb_lignes", "avec_logement", "segment_surface", "prix_calculable",
    "prix_m2", "prix_aberrant", "lon", "lat",
]

QUERY = f"""
with src as (
  select * from read_csv_auto('{DEST.as_posix()}/*.csv.gz', union_by_name=true, all_varchar=true)
),
base as (
  select
    id_mutation,
    try_cast(date_mutation as date)           as d,
    nature_mutation,
    numero_disposition,
    try_cast(valeur_fonciere as double)       as valeur,
    code_departement                          as dep,
    code_commune,
    nom_commune,
    id_parcelle,
    lot1_numero,
    type_local,
    try_cast(surface_reelle_bati as double)   as surf,
    try_cast(longitude as double)             as lon,
    try_cast(latitude as double)              as lat
  from src
),
mutations_cibles as (
  select distinct id_mutation from base where type_local = '{TYPE_CIBLE}'
),
lignes as (
  select b.* from base b join mutations_cibles m using (id_mutation)
),
agg as (
  select
    id_mutation,
    min(d)                                                   as date_mutation,
    any_value(nature_mutation)                               as nature_mutation,
    any_value(dep)                                           as departement,
    any_value(code_commune)                                  as code_commune,
    any_value(nom_commune)                                   as commune,
    count(*)                                                 as nb_lignes,
    count(distinct numero_disposition)                       as nb_dispositions,
    count(distinct valeur)                                   as nb_valeurs,
    max(valeur)                                              as valeur_fonciere,
    bool_or(type_local in ('Maison', 'Appartement'))         as avec_logement,
    avg(lon) filter (where type_local = '{TYPE_CIBLE}')      as lon,
    avg(lat) filter (where type_local = '{TYPE_CIBLE}')      as lat
  from lignes
  group by id_mutation
),
locaux as (
  select id_mutation, sum(surf) as surface_locaux, count(*) as nb_locaux
  from (
    select distinct id_mutation, numero_disposition, id_parcelle, lot1_numero, surf
    from lignes
    where type_local = '{TYPE_CIBLE}' and surf is not null
  )
  group by id_mutation
),
final as (
  select
    a.*,
    l.surface_locaux,
    coalesce(l.nb_locaux, 0) as nb_locaux,
    (a.nature_mutation = 'Vente'
      and not a.avec_logement
      and a.nb_dispositions = 1
      and a.nb_valeurs = 1
      and a.valeur_fonciere > 0
      and l.surface_locaux >= {SURFACE_MIN_M2}) as prix_calculable
  from agg a
  left join locaux l using (id_mutation)
)
select
  id_mutation,
  date_mutation,
  year(date_mutation) as annee,
  nature_mutation,
  departement,
  code_commune,
  commune,
  valeur_fonciere,
  surface_locaux,
  nb_locaux,
  nb_lignes,
  avec_logement,
  case
    when surface_locaux is null then 'inconnue'
    when surface_locaux < 300 then 'moins de 300 m2'
    when surface_locaux < 1000 then '300 a 1 000 m2'
    when surface_locaux < 5000 then '1 000 a 5 000 m2'
    else '5 000 m2 et plus'
  end as segment_surface,
  prix_calculable,
  case when prix_calculable then valeur_fonciere / surface_locaux end as prix_m2,
  case when prix_calculable
       then (valeur_fonciere / surface_locaux) < {PRIX_M2_MIN}
         or (valeur_fonciere / surface_locaux) > {PRIX_M2_MAX}
       else false end as prix_aberrant,
  lon,
  lat
from final
"""


def transform() -> list[tuple]:
    con = duckdb.connect()
    rows = con.execute(QUERY).fetchall()
    print(f"{len(rows)} ventes construites par DuckDB")
    return rows


def load(conn, rows: list[tuple]) -> None:
    with conn.cursor() as cur:
        cur.execute("truncate silver.ventes_locaux")
        with cur.copy(f"copy silver.ventes_locaux ({', '.join(COLONNES)}) from stdin") as copy:
            for row in rows:
                copy.write_row(row)
        cur.execute(
            """
            update silver.ventes_locaux
               set geom = st_setsrid(st_makepoint(lon, lat), 4326)::geography
             where lon is not null and lat is not null
            """
        )
    conn.commit()


def record_controles(conn, run_id: int) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            select
              count(*),
              count(*) filter (where nb_lignes > 1),
              count(*) filter (where avec_logement),
              count(*) filter (where surface_locaux is null),
              count(*) filter (where prix_calculable),
              count(*) filter (where prix_aberrant),
              count(*) filter (where geom is null)
            from silver.ventes_locaux
            """
        )
        total, multi, logement, sans_surf, calculable, aberrant, sans_geo = cur.fetchone()
        controles = [
            ("Ventes comportant plusieurs lignes, tous biens confondus", multi, total),
            ("Ventes incluant un logement (exclues du prix au m2)", logement, total),
            ("Ventes sans surface batie", sans_surf, total),
            ("Prix au m2 aberrants signales", aberrant, calculable),
            ("Ventes sans coordonnees", sans_geo, total),
        ]
        cur.executemany(
            """
            insert into gov.controles_qualite (run_id, source_id, nom_controle, nb_anomalies, nb_total)
            values (%s, %s, %s, %s, %s)
            """,
            [(run_id, SOURCE_ID, n, a, t) for n, a, t in controles],
        )
    conn.commit()
    print(f"\nVentes en silver : {total}, dont {calculable} avec un prix au m2 calculable")
    for n, a, t in controles:
        print(f"Contrôle : {n} : {a} / {t}")


def main() -> int:
    with get_conn() as conn:
        run_id = start_run(conn, SOURCE_ID)
    try:
        rows = transform()
        with get_conn() as conn:
            load(conn, rows)
            record_controles(conn, run_id)
            end_run(conn, run_id, SOURCE_ID, "succes", len(rows), f"{len(rows)} ventes en silver")
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
