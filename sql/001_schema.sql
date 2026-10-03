create extension if not exists postgis;

create schema if not exists bronze;
create schema if not exists silver;
create schema if not exists gold;
create schema if not exists gov;

-- Registre des sources
create table if not exists gov.sources (
  source_id            text primary key,
  nom                  text not null,
  producteur           text not null,
  licence              text not null,
  url                  text not null,
  frequence_maj        text,
  derniere_ingestion   timestamptz,
  nb_lignes_derniere   integer
);

-- Historique des exécutions
create table if not exists gov.ingestion_runs (
  run_id      bigserial primary key,
  source_id   text not null references gov.sources(source_id),
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  statut      text not null default 'en_cours'
              check (statut in ('en_cours', 'succes', 'echec')),
  nb_lignes   integer,
  message     text
);

-- Résultats des contrôles qualité
create table if not exists gov.controles_qualite (
  controle_id   bigserial primary key,
  run_id        bigint references gov.ingestion_runs(run_id),
  source_id     text not null references gov.sources(source_id),
  nom_controle  text not null,
  nb_anomalies  integer not null,
  nb_total      integer not null,
  execute_le    timestamptz not null default now()
);

-- Bronze : SIRENE brut
create table if not exists bronze.sirene_etablissements (
  siret      text primary key,
  payload    jsonb not null,
  run_id     bigint references gov.ingestion_runs(run_id),
  ingere_le  timestamptz not null default now()
);

-- Silver : SIRENE nettoyé
create table if not exists silver.etablissements (
  siret              text primary key,
  siren              text not null,
  raison_sociale     text,
  naf                text,
  tranche_effectif   text,
  date_creation      date,
  est_siege          boolean,
  adresse            text,
  code_postal        text,
  commune            text,
  departement        text,
  geom               geography(Point, 4326),
  maj_le             timestamptz not null default now()
);

create index if not exists etablissements_geom_idx on silver.etablissements using gist (geom);
create index if not exists etablissements_dept_naf_idx on silver.etablissements (departement, naf);

insert into gov.sources (source_id, nom, producteur, licence, url, frequence_maj) values
  ('sirene', 'API Recherche d''entreprises (SIRENE)', 'DINUM / INSEE', 'Licence Ouverte 2.0',
   'https://recherche-entreprises.api.gouv.fr', 'quotidienne'),
  ('georisques_icpe', 'Installations classées (rubrique 1510)', 'Ministère de la Transition écologique', 'Licence Ouverte 2.0',
   'https://www.georisques.gouv.fr', 'continue'),
  ('dvf', 'Demandes de valeurs foncières géolocalisées', 'DGFiP / Etalab', 'Licence Ouverte 2.0',
   'https://files.data.gouv.fr/geo-dvf/', 'semestrielle')
on conflict (source_id) do nothing;
