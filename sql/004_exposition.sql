-- Couche d'exposition : seules ces vues sont lisibles par le site public
create or replace view public.entrepots_carte       as select * from gold.entrepots_carte;
create or replace view public.parc_entrepots_dept   as select * from gold.parc_entrepots_dept;
create or replace view public.marche_ventes         as select * from gold.marche_ventes;
create or replace view public.marche_idf            as select * from gold.marche_idf;
create or replace view public.prospects             as select * from gold.prospects;
create or replace view public.prospects_entreprises as select * from gold.prospects_entreprises;
create or replace view public.qualite_sources       as select * from gold.qualite_sources;
create or replace view public.controles_recents     as select * from gold.controles_recents;

grant select on
  public.entrepots_carte,
  public.parc_entrepots_dept,
  public.marche_ventes,
  public.marche_idf,
  public.prospects,
  public.prospects_entreprises,
  public.qualite_sources,
  public.controles_recents
to anon;

notify pgrst, 'reload schema';
