"""Rafraîchit la couche Gold et affiche une synthèse des indicateurs."""
import sys

from pipelines.common.db import get_conn

VUES = [
    "gold.entrepots_carte",
    "gold.parc_entrepots_dept",
    "gold.marche_ventes",
    "gold.marche_idf",
    "gold.prospects",
    "gold.prospects_entreprises",
]

SYNTHESES = {
    "Parc d'entrepôts par département": """
        select departement, nb_entrepots, nb_autorisation, nb_enregistrement, volume_m3, nb_exploitants
        from gold.parc_entrepots_dept order by nb_entrepots desc
    """,
    "Unités de volume de la rubrique 1510": """
        select unite_1510, count(*) from gold.entrepots_carte group by 1 order by 2 desc
    """,
    "Top 10 des exploitants par nombre d'entrepôts": """
        select exploitant, naf_exploitant, count(*) as nb
        from gold.entrepots_carte
        where exploitant is not null
        group by 1, 2 order by 3 desc limit 10
    """,
    "Activité des exploitants (top 10 des codes NAF)": """
        select naf_exploitant, count(*) from gold.entrepots_carte
        group by 1 order by 2 desc limit 10
    """,
    "Prix médian au m² en Île-de-France, 2025, par taille": """
        select segment_surface, count(*) as ventes_avec_prix,
               round((percentile_cont(0.5) within group (order by prix_m2))::numeric) as median_idf
        from silver.ventes_locaux
        where annee = 2025 and prix_calculable and not prix_aberrant
        group by 1 order by 1
    """,
    "Ventes de grands locaux (1 000 m² et plus) par année": """
        select annee, sum(nb_ventes) from gold.marche_ventes
        where segment_surface in ('1 000 a 5 000 m2', '5 000 m2 et plus')
        group by 1 order by 1
    """,
    "Répartition des scores de prospects": """
        select case
                 when score >= 70 then '70 et plus'
                 when score >= 50 then '50 à 69'
                 when score >= 30 then '30 à 49'
                 else 'moins de 30'
               end as tranche, count(*)
        from gold.prospects group by 1 order by 1
    """,
    "Top 10 des prospects": """
        select raison_sociale, naf, departement, score,
               pts_activite, pts_effectif, pts_lien_entrepot, pts_site_recent
        from gold.prospects order by score desc, raison_sociale limit 10
    """,
}


def main() -> int:
    with get_conn() as conn:
        try:
            with conn.cursor() as cur:
                for vue in VUES:
                    cur.execute(f"refresh materialized view {vue}")
                    print(f"Rafraîchie : {vue}")
            conn.commit()

            with conn.cursor() as cur:
                for titre, sql in SYNTHESES.items():
                    print(f"\n=== {titre} ===")
                    cur.execute(sql)
                    for row in cur.fetchall():
                        print(row)
            return 0
        except Exception as exc:
            conn.rollback()
            print(f"ECHEC : {exc}")
            return 1


if __name__ == "__main__":
    sys.exit(main())
