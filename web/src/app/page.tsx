import Link from "next/link";
import { gold } from "@/lib/supabase";
import type { Entrepot, MarcheIdf, ParcDept } from "@/lib/types";
import { DEPARTEMENTS, SEGMENTS, entier, millions, pourcent } from "@/lib/format";
import { CarteEntrepots } from "@/components/carte-entrepots";
import { ErreurDonnees } from "@/components/erreur-donnees";

export const revalidate = 3600;

const GRANDS_LOCAUX = ["1 000 a 5 000 m2", "5 000 m2 et plus"];

export default async function MarchePage() {
  const db = gold();
  const [rEntrepots, rParc, rMarche] = await Promise.all([
    db
      .from("entrepots_carte")
      .select("code_aiot,exploitant,naf_exploitant,commune,departement,volume_1510,regime_1510,lon,lat"),
    db.from("parc_entrepots_dept").select("*").order("nb_entrepots", { ascending: false }),
    db.from("marche_idf").select("*"),
  ]);

  const erreur = rEntrepots.error ?? rParc.error ?? rMarche.error;
  if (erreur) return <ErreurDonnees message={erreur.message} />;

  const entrepots = (rEntrepots.data ?? []) as unknown as Entrepot[];
  const parc = (rParc.data ?? []) as unknown as ParcDept[];
  const marche = (rMarche.data ?? []) as unknown as MarcheIdf[];

  const total = entrepots.length;
  const volumeTotal = entrepots.reduce((s, e) => s + (e.volume_1510 ?? 0), 0);
  const top3 = parc.slice(0, 3);
  const partTop3 = pourcent(top3.reduce((s, p) => s + p.nb_entrepots, 0), total);
  const foncieres = entrepots.filter((e) => e.naf_exploitant?.startsWith("68")).length;

  const annees = [...new Set(marche.map((m) => m.annee))].sort((a, b) => a - b);
  const derniereAnnee = annees[annees.length - 1];
  const ventesGrands = annees.map((a) => ({
    annee: a,
    n: marche
      .filter((m) => m.annee === a && GRANDS_LOCAUX.includes(m.segment_surface))
      .reduce((s, m) => s + m.nb_ventes, 0),
  }));
  const maxVentes = Math.max(...ventesGrands.map((v) => v.n), 1);
  const evolution =
    ventesGrands.length > 1
      ? pourcent(ventesGrands[ventesGrands.length - 1].n - ventesGrands[0].n, ventesGrands[0].n)
      : 0;
  const prix = SEGMENTS.map((s) => ({
    ...s,
    ligne: marche.find((m) => m.annee === derniereAnnee && m.segment_surface === s.id),
  }));

  return (
    <>
      <section className="relative border-b border-encre/15">
        <div className="px-4 py-6 sm:px-6 md:pointer-events-none md:absolute md:left-0 md:top-0 md:z-10">
          <div className="max-w-md bg-papier/95 md:pointer-events-auto md:border-l-4 md:border-poutre md:p-6 md:shadow-sm">
            <h1 className="font-display text-4xl font-bold leading-none sm:text-5xl">
              {entier(total)} grands entrepôts en Île-de-France
            </h1>
            <p className="mt-4 leading-relaxed">
              Chaque point est un entrepôt couvert classé au titre de la rubrique 1510. Sa taille suit le
              volume autorisé. Cliquez sur un point pour voir qui l’exploite.
            </p>
            <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-encre/15 pt-4">
              <div>
                <dt className="text-sm text-gris">Volume autorisé</dt>
                <dd className="font-display text-2xl font-bold tabular">{millions(volumeTotal)} millions de m³</dd>
              </div>
              <div>
                <dt className="text-sm text-gris">Dans 3 départements</dt>
                <dd className="font-display text-2xl font-bold tabular">{partTop3} % du parc</dd>
              </div>
            </dl>
          </div>
        </div>
        <div className="h-[62vh] min-h-[420px] bg-beton">
          <CarteEntrepots entrepots={entrepots} />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <h2 className="font-display text-3xl font-bold">Le parc par département</h2>
        <p className="mt-2 max-w-2xl text-gris">
          {top3.map((p) => DEPARTEMENTS[p.departement]).join(", ")} concentrent {partTop3} % des grands
          entrepôts de la région.
        </p>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b-2 border-encre text-sm text-gris">
                <th className="py-2 pr-4 font-medium">Département</th>
                <th className="py-2 pr-4 text-right font-medium">Entrepôts</th>
                <th className="w-1/3 py-2 pr-4 font-medium">Part du parc</th>
                <th className="py-2 pr-4 text-right font-medium">Volume autorisé (millions de m³)</th>
                <th className="py-2 text-right font-medium">Exploitants</th>
              </tr>
            </thead>
            <tbody>
              {parc.map((p) => (
                <tr key={p.departement} className="border-b border-encre/10">
                  <td className="py-3 pr-4">
                    <span className="tabular text-gris">{p.departement}</span>{" "}
                    {DEPARTEMENTS[p.departement] ?? p.departement}
                  </td>
                  <td className="py-3 pr-4 text-right font-semibold tabular">{entier(p.nb_entrepots)}</td>
                  <td className="py-3 pr-4">
                    <div className="h-3 w-full bg-beton">
                      <div className="h-3 bg-rack" style={{ width: `${pourcent(p.nb_entrepots, total)}%` }} />
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-right tabular">{millions(p.volume_m3 ?? 0)}</td>
                  <td className="py-3 text-right tabular">{entier(p.nb_exploitants)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-beton">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-6 md:grid-cols-[1fr_1fr]">
          <h2 className="font-display text-3xl font-bold leading-tight">
            Le déclarant d’un entrepôt n’est souvent pas son occupant
          </h2>
          <div className="space-y-4 leading-relaxed">
            <p>
              {entier(foncieres)} entrepôts sur {entier(total)} ({pourcent(foncieres, total)} %) sont
              déclarés par une société de location ou de gestion immobilière. Le nom sur le dossier est
              alors celui du propriétaire, pas celui de l’entreprise qui travaille dans le bâtiment.
            </p>
            <p>
              Pour ERBC, cela fait deux cibles : les propriétaires, pour les mandats de commercialisation,
              et les occupants, repérés par leur installation à proximité immédiate de ces sites.
            </p>
            <Link
              href="/prospection"
              className="inline-block border-b-4 border-poutre pb-1 font-semibold hover:text-rack"
            >
              Voir les occupants probables
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-12 px-4 py-14 sm:px-6 lg:grid-cols-2">
        <div>
          <h2 className="font-display text-3xl font-bold">Plus le local est grand, moins le m² coûte</h2>
          <p className="mt-2 text-gris">Prix médian de vente en {derniereAnnee}, Île-de-France</p>
          <table className="mt-6 w-full border-collapse text-left">
            <thead>
              <tr className="border-b-2 border-encre text-sm text-gris">
                <th className="py-2 pr-4 font-medium">Taille du local</th>
                <th className="py-2 pr-4 text-right font-medium">Ventes avec prix</th>
                <th className="py-2 text-right font-medium">Prix médian au m²</th>
              </tr>
            </thead>
            <tbody>
              {prix.map((s) => (
                <tr key={s.id} className="border-b border-encre/10">
                  <td className="py-3 pr-4">{s.label}</td>
                  <td className="py-3 pr-4 text-right tabular">{entier(s.ligne?.nb_prix)}</td>
                  <td className="py-3 text-right font-display text-xl font-bold tabular">
                    {s.ligne?.prix_m2_median != null ? `${entier(s.ligne.prix_m2_median)} €` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-4 text-sm leading-relaxed text-gris">
            Les petites surfaces sont surtout des commerces. Le prix n’est calculé que pour les ventes sans
            logement inclus et avec une surface connue.
          </p>
        </div>

        <div>
          <h2 className="font-display text-3xl font-bold">
            Ventes de grands locaux : {evolution > 0 ? "+" : ""}
            {evolution} % depuis {annees[0]}
          </h2>
          <p className="mt-2 text-gris">Ventes de locaux de 1 000 m² et plus, par année</p>
          <div className="mt-6 flex h-56 items-end gap-3 border-b-2 border-encre" role="img"
            aria-label={ventesGrands.map((v) => `${v.annee} : ${v.n} ventes`).join(", ")}>
            {ventesGrands.map((v) => (
              <div key={v.annee} className="flex h-full flex-1 flex-col justify-end">
                <span className="mb-1 text-center text-sm font-semibold tabular">{entier(v.n)}</span>
                <div className="bg-rack" style={{ height: `${(v.n / maxVentes) * 85}%` }} />
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-3">
            {ventesGrands.map((v) => (
              <span key={v.annee} className="flex-1 text-center text-sm text-gris tabular">
                {v.annee}
              </span>
            ))}
          </div>
          <p className="mt-4 text-sm leading-relaxed text-gris">
            Source : DVF, ventes de locaux industriels, commerciaux ou assimilés. La couverture de la
            dernière année reste à confirmer auprès de la source.
          </p>
        </div>
      </section>
    </>
  );
}
