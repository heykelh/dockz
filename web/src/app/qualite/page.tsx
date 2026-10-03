import { gold } from "@/lib/supabase";
import type { Controle, QualiteSource } from "@/lib/types";
import { dateLongue, entier } from "@/lib/format";
import { ErreurDonnees } from "@/components/erreur-donnees";

export const revalidate = 3600;

const ORDRE_SOURCES = ["sirene", "georisques_icpe", "dvf"];

const CONTROLES: Record<string, { label: string; pourquoi: string }> = {
  "Personnes physiques exclues": {
    label: "Personnes physiques exclues",
    pourquoi: "Un entrepreneur individuel est une personne : ses données relèvent du RGPD.",
  },
  "Etablissements non diffusibles exclus": {
    label: "Établissements non diffusibles exclus",
    pourquoi: "Ces entreprises ont demandé que leurs informations ne soient pas diffusées.",
  },
  "Etablissements sans coordonnees": {
    label: "Établissements sans coordonnées",
    pourquoi: "Ils restent dans la prospection mais n’apparaissent pas sur la carte.",
  },
  "Installations Non ICPE dans la base ICPE": {
    label: "Installations « Non ICPE » présentes dans la base",
    pourquoi: "Conservées pour la traçabilité, exclues du parc d’entrepôts.",
  },
  "Entrepots 1510 sans SIRET valide": {
    label: "Entrepôts sans SIRET valide",
    pourquoi: "Leur exploitant ne peut pas être identifié.",
  },
  "Entrepots 1510 sans coordonnees": {
    label: "Entrepôts sans coordonnées",
    pourquoi: "Ils ne peuvent pas être placés sur la carte.",
  },
  "Entrepots 1510 dont le SIRET est introuvable dans SIRENE": {
    label: "Entrepôts dont le SIRET est introuvable dans SIRENE",
    pourquoi: "Écart entre deux référentiels publics.",
  },
  "Ventes reparties sur plusieurs lignes (dedoublonnees)": {
    label: "Ventes comportant plusieurs lignes, tous biens confondus",
    pourquoi: "Regroupées en une seule vente pour ne pas compter le prix plusieurs fois.",
  },
  "Ventes comportant plusieurs lignes, tous biens confondus": {
    label: "Ventes comportant plusieurs lignes, tous biens confondus",
    pourquoi: "Regroupées en une seule vente pour ne pas compter le prix plusieurs fois.",
  },
  "Ventes incluant un logement (exclues du prix au m2)": {
    label: "Ventes incluant un logement",
    pourquoi: "Leur prix couvre aussi le logement : exclues du prix au m².",
  },
  "Ventes sans surface batie": {
    label: "Ventes sans surface bâtie",
    pourquoi: "Aucun prix au m² ne peut être calculé.",
  },
  "Prix au m2 aberrants signales": {
    label: "Prix au m² aberrants",
    pourquoi: "Sous 50 € ou au-dessus de 30 000 € le m² : exclus des médianes.",
  },
  "Ventes sans coordonnees": {
    label: "Ventes sans coordonnées",
    pourquoi: "Comptées dans les statistiques, absentes de la carte.",
  },
};

export default async function QualitePage() {
  const db = gold();
  const [rSources, rControles] = await Promise.all([
    db.from("qualite_sources").select("*"),
    db.from("controles_recents").select("*"),
  ]);

  const erreur = rSources.error ?? rControles.error;
  if (erreur) return <ErreurDonnees message={erreur.message} />;

  const sources = ((rSources.data ?? []) as unknown as QualiteSource[]).sort(
    (a, b) => ORDRE_SOURCES.indexOf(a.source_id) - ORDRE_SOURCES.indexOf(b.source_id),
  );

  // Un même contrôle renommé ne doit apparaître qu'une fois : on garde le plus récent par libellé
  const parLibelle = new Map<string, Controle & { label: string; pourquoi: string }>();
  for (const c of (rControles.data ?? []) as unknown as Controle[]) {
    const info = CONTROLES[c.nom_controle] ?? { label: c.nom_controle, pourquoi: "" };
    const cle = `${c.source_id}|${info.label}`;
    const existant = parLibelle.get(cle);
    if (!existant || existant.execute_le < c.execute_le) parLibelle.set(cle, { ...c, ...info });
  }
  const controles = [...parLibelle.values()];

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-4xl font-bold">Qualité des données</h1>
      <p className="mt-3 max-w-2xl leading-relaxed">
        Un chiffre ne sert à décider que si l’on sait d’où il vient. Cette page montre l’état de chaque
        source et le résultat des contrôles appliqués à chaque mise à jour.
      </p>

      <div className="mt-10 space-y-12">
        {sources.map((s) => {
          const ok = s.dernier_statut === "succes";
          const liste = controles.filter((c) => c.source_id === s.source_id);
          return (
            <section key={s.source_id} className="border-t-4 border-encre pt-5">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="font-display text-2xl font-bold">{s.nom}</h2>
                <span
                  className={`border-2 px-2 py-0.5 text-sm font-semibold ${
                    ok ? "border-rack text-rack" : "border-poutre text-poutre"
                  }`}
                >
                  {ok ? "Dernière mise à jour réussie" : "Dernière mise à jour en échec"}
                </span>
              </div>
              <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-gris">Producteur</dt>
                  <dd className="font-medium">{s.producteur}</dd>
                </div>
                <div>
                  <dt className="text-gris">Licence</dt>
                  <dd className="font-medium">{s.licence}</dd>
                </div>
                <div>
                  <dt className="text-gris">Dernière mise à jour</dt>
                  <dd className="font-medium">{dateLongue(s.derniere_ingestion)}</dd>
                </div>
                <div>
                  <dt className="text-gris">Lignes reçues</dt>
                  <dd className="font-medium tabular">{entier(s.nb_lignes_derniere)}</dd>
                </div>
              </dl>
              <p className="mt-2 text-sm">
                <a href={s.url} className="underline hover:text-rack">
                  Consulter la source
                </a>
              </p>

              {liste.length > 0 && (
                <div className="mt-5 overflow-x-auto">
                  <table className="w-full min-w-[720px] border-collapse text-left">
                    <thead>
                      <tr className="border-b-2 border-encre text-sm text-gris">
                        <th className="py-2 pr-4 font-medium">Contrôle</th>
                        <th className="py-2 pr-4 text-right font-medium">Résultat</th>
                        <th className="w-40 py-2 pr-4 font-medium">Part</th>
                        <th className="py-2 font-medium">Pourquoi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {liste.map((c) => (
                        <tr key={c.label} className="border-b border-encre/10 align-top">
                          <td className="py-3 pr-4 font-medium">{c.label}</td>
                          <td className="py-3 pr-4 text-right tabular">
                            {entier(c.nb_anomalies)} sur {entier(c.nb_total)}
                          </td>
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-24 bg-beton">
                                <div
                                  className="h-2 bg-poutre"
                                  style={{ width: `${Math.min(100, Number(c.taux_pct ?? 0))}%` }}
                                />
                              </div>
                              <span className="text-sm tabular">
                                {Number(c.taux_pct ?? 0).toLocaleString("fr-FR")} %
                              </span>
                            </div>
                          </td>
                          <td className="py-3 text-sm text-gris">{c.pourquoi}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
