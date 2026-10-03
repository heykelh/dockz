"""Téléchargement DVF géolocalisé (Île-de-France) puis profilage local avec DuckDB."""
from pathlib import Path

import duckdb
import requests

BASE_URL = "https://files.data.gouv.fr/geo-dvf/latest/csv/{annee}/departements/{dep}.csv.gz"
DEPARTEMENTS_IDF = ["75", "77", "78", "91", "92", "93", "94", "95"]
ANNEES = range(2021, 2026)
DEST = Path("data/raw/dvf")
TYPE_CIBLE = "Local industriel. commercial ou assimilé"


def download() -> None:
    DEST.mkdir(parents=True, exist_ok=True)
    for annee in ANNEES:
        for dep in DEPARTEMENTS_IDF:
            chemin = DEST / f"{annee}_{dep}.csv.gz"
            if chemin.exists():
                continue
            r = requests.get(BASE_URL.format(annee=annee, dep=dep), stream=True, timeout=60)
            if r.status_code == 404:
                print(f"{annee} {dep} : absent sur le serveur, ignoré")
                continue
            r.raise_for_status()
            with open(chemin, "wb") as f:
                for bloc in r.iter_content(chunk_size=1 << 20):
                    f.write(bloc)
            print(f"{annee} {dep} : téléchargé")


def profile() -> None:
    con = duckdb.connect()
    src = f"read_csv_auto('{DEST.as_posix()}/*.csv.gz', union_by_name=true, all_varchar=true)"

    print("\n=== Colonnes ===")
    for row in con.execute(f"describe select * from {src}").fetchall():
        print(row[0])

    print("\n=== Types de locaux (lignes) ===")
    for row in con.execute(
        f"select type_local, count(*) from {src} group by 1 order by 2 desc"
    ).fetchall():
        print(row)

    print(f"\n=== '{TYPE_CIBLE}' par département et par année ===")
    print("(département, année, lignes, mutations distinctes)")
    for row in con.execute(
        f"""
        select code_departement, substr(date_mutation, 1, 4) as annee,
               count(*) as lignes,
               count(distinct id_mutation) as mutations
        from {src}
        where type_local = '{TYPE_CIBLE}'
        group by 1, 2 order by 1, 2
        """
    ).fetchall():
        print(row)

    print("\n=== Ventes multi-lignes (même mutation répétée) ===")
    row = con.execute(
        f"""
        with m as (
          select id_mutation, count(*) as n
          from {src}
          where type_local = '{TYPE_CIBLE}'
          group by 1
        )
        select count(*) as mutations,
               count(*) filter (where n > 1) as mutations_multi_lignes
        from m
        """
    ).fetchone()
    print(f"{row[1]} mutations sur {row[0]} occupent plusieurs lignes")


if __name__ == "__main__":
    download()
    profile()
