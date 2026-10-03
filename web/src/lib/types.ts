export type Entrepot = {
  code_aiot: string;
  exploitant: string | null;
  naf_exploitant: string | null;
  commune: string | null;
  departement: string | null;
  volume_1510: number | null;
  regime_1510: string | null;
  lon: number | null;
  lat: number | null;
};

export type ParcDept = {
  departement: string;
  nb_entrepots: number;
  nb_autorisation: number;
  nb_enregistrement: number;
  volume_m3: number | null;
  nb_exploitants: number;
};

export type MarcheIdf = {
  annee: number;
  segment_surface: string;
  nb_ventes: number;
  nb_prix: number;
  prix_m2_median: number | null;
};

export type ProspectSite = {
  siret: string;
  raison_sociale: string | null;
  naf: string | null;
  tranche_effectif: string | null;
  departement: string | null;
  commune: string | null;
  adresse: string | null;
  date_ouverture_site: string | null;
  est_exploitant: boolean;
  proche_entrepot: boolean;
  pts_activite: number;
  pts_effectif: number;
  pts_lien_entrepot: number;
  pts_site_recent: number;
  score: number;
};

export type ProspectEntreprise = {
  siren: string;
  raison_sociale: string | null;
  nb_sites: number;
  score_max: number;
  departements: string | null;
  exploite_un_entrepot: boolean;
  proche_d_un_entrepot: boolean;
};

export type QualiteSource = {
  source_id: string;
  nom: string;
  producteur: string;
  licence: string;
  url: string;
  frequence_maj: string | null;
  derniere_ingestion: string | null;
  nb_lignes_derniere: number | null;
  dernier_statut: string | null;
  derniere_execution: string | null;
};

export type Controle = {
  source_id: string;
  nom_controle: string;
  nb_anomalies: number;
  nb_total: number;
  taux_pct: number | null;
  execute_le: string;
};
