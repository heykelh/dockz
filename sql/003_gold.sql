drop view if exists gold.controles_recents;
drop view if exists gold.qualite_sources;
drop materialized view if exists gold.prospects;
drop materialized view if exists gold.marche_ventes;
drop materialized view if exists gold.parc_entrepots_dept;
drop materialized view if exists gold.entrepots_carte;

-- Entrepôts avec exploitant, pour la carte
create materialized view gold.entrepots_carte as
select
  e.code_aiot,
  case
    when x.personne_physique then 'Exploitant individuel (non affiché)'
    else coalesce(x.raison_sociale, e.raison_sociale)
  end                                              as exploitant,
  e.siret,
  x.siren,
  coalesce(x.naf_etablissement, x.naf_unite)       as naf_exploitant,
  x.tranche_effectif,
  e.regime_1510,
  e.volume_1510,
  e.unite_1510,
  e.adresse,
  e.code_postal,
  e.commune,
  e.departement,
  e.derniere_inspection,
  st_x(e.geom::geometry)                           as lon,
  st_y(e.geom::geometry)                           as lat
from silver.entrepots_icpe e
left join silver.exploitants x on x.siret = e.siret;

-- Parc d'entrepôts par département
create materialized view gold.parc_entrepots_dept as
select
  departement,
  count(*)                                                          as nb_entrepots,
  count(*) filter (where regime_1510 ilike '%autorisation%')        as nb_autorisation,
  count(*) filter (where regime_1510 ilike '%enregistrement%')      as nb_enregistrement,
  round(sum(volume_1510) filter (where lower(unite_1510) in ('m3', 'm³'))) as volume_m3,
  count(distinct siren)                                             as nb_exploitants
from gold.entrepots_carte
group by departement;

-- Marché des ventes par département, année et taille
create materialized view gold.marche_ventes as
select
  departement,
  annee,
  segment_surface,
  count(*)                                                          as nb_ventes,
  round(sum(surface_locaux))                                        as surface_totale_m2,
  count(*) filter (where prix_calculable and not prix_aberrant)     as nb_prix,
  round((percentile_cont(0.5) within group (order by prix_m2)
         filter (where prix_calculable and not prix_aberrant))::numeric) as prix_m2_median
from silver.ventes_locaux
group by departement, annee, segment_surface;

-- Prospects avec score explicable
create materialized view gold.prospects as
with points as (
  select
    s.siret,
    case
      when s.naf in ('52.10A', '52.10B') then 30
      when s.naf in ('47.91A', '47.91B') then 25
      when s.naf in ('52.29A', '52.29B') then 20
      when s.naf in ('49.41A', '49.41B') then 15
      when s.naf = '53.20Z' then 10
      else 0
    end as pts_activite,
    case
      when s.tranche_effectif = '11' then 5
      when s.tranche_effectif = '12' then 10
      when s.tranche_effectif = '21' then 15
      when s.tranche_effectif = '22' then 20
      when s.tranche_effectif in ('31', '32', '41', '42', '51', '52', '53') then 25
      else 0
    end as pts_effectif,
    case
      when exists (select 1 from silver.entrepots_icpe w where w.siret = s.siret) then 20
      else 0
    end as pts_exploitant,
    case
      when s.geom is not null
       and exists (select 1 from silver.entrepots_icpe w where st_dwithin(w.geom, s.geom, 500)) then 15
      else 0
    end as pts_site_logistique,
    case
      when s.date_creation >= current_date - interval '5 years' then 10
      else 0
    end as pts_croissance
  from silver.etablissements s
)
select
  s.siret,
  s.siren,
  s.raison_sociale,
  s.naf,
  s.tranche_effectif,
  s.date_creation,
  s.est_siege,
  s.adresse,
  s.code_postal,
  s.commune,
  s.departement,
  st_x(s.geom::geometry) as lon,
  st_y(s.geom::geometry) as lat,
  p.pts_activite,
  p.pts_effectif,
  p.pts_exploitant,
  p.pts_site_logistique,
  p.pts_croissance,
  p.pts_activite + p.pts_effectif + p.pts_exploitant + p.pts_site_logistique + p.pts_croissance as score
from silver.etablissements s
join points p using (siret);

create index prospects_score_idx on gold.prospects (score desc);
create index prospects_dept_idx on gold.prospects (departement);

-- État des sources, pour la page Qualité
create view gold.qualite_sources as
select
  s.source_id,
  s.nom,
  s.producteur,
  s.licence,
  s.url,
  s.frequence_maj,
  s.derniere_ingestion,
  s.nb_lignes_derniere,
  r.statut   as dernier_statut,
  r.ended_at as derniere_execution
from gov.sources s
left join lateral (
  select statut, ended_at
  from gov.ingestion_runs
  where source_id = s.source_id
  order by run_id desc
  limit 1
) r on true;

-- Dernier résultat de chaque contrôle
create view gold.controles_recents as
select distinct on (source_id, nom_controle)
  source_id,
  nom_controle,
  nb_anomalies,
  nb_total,
  round(100.0 * nb_anomalies / nullif(nb_total, 0), 1) as taux_pct,
  execute_le
from gov.controles_qualite
order by source_id, nom_controle, execute_le desc;
