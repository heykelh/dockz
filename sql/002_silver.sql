-- Entrepôts : installations classées sous la rubrique 1510
create table if not exists silver.entrepots_icpe (
  code_aiot                 text primary key,
  raison_sociale            text,
  siret                     text,
  regime_etablissement      text,
  regime_1510               text,
  volume_1510               numeric,
  unite_1510                text,
  adresse                   text,
  code_postal               text,
  code_insee                text,
  commune                   text,
  departement               text,
  derniere_inspection       date,
  date_maj_source           text,
  geom                      geography(Point, 4326),
  maj_le                    timestamptz not null default now()
);
create index if not exists entrepots_icpe_geom_idx on silver.entrepots_icpe using gist (geom);

-- Exploitants des entrepôts, enrichis via SIRENE
create table if not exists silver.exploitants (
  siret             text primary key,
  siren             text,
  raison_sociale    text,
  naf_unite         text,
  naf_etablissement text,
  tranche_effectif  text,
  personne_physique boolean not null default false,
  trouve            boolean not null default true,
  maj_le            timestamptz not null default now()
);

-- Ventes de locaux d'activité : une ligne par vente
create table if not exists silver.ventes_locaux (
  id_mutation      text primary key,
  date_mutation    date,
  annee            integer,
  nature_mutation  text,
  departement      text,
  code_commune     text,
  commune          text,
  valeur_fonciere  numeric,
  surface_locaux   numeric,
  nb_locaux        integer,
  nb_lignes        integer,
  avec_logement    boolean,
  segment_surface  text,
  prix_calculable  boolean,
  prix_m2          numeric,
  prix_aberrant    boolean,
  lon              double precision,
  lat              double precision,
  geom             geography(Point, 4326)
);
create index if not exists ventes_locaux_geom_idx on silver.ventes_locaux using gist (geom);
create index if not exists ventes_locaux_dep_annee_idx on silver.ventes_locaux (departement, annee);
