"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { gold } from "@/lib/supabase";
import type { ProspectEntreprise, ProspectSite } from "@/lib/types";
import { ACTIVITES, DEPARTEMENTS, TRANCHES, entier, libelleNaf } from "@/lib/format";

const PAR_PAGE = 50;
const LOT_EXPORT = 1000;

const COLONNES_SITE =
  "siret,raison_sociale,naf,tranche_effectif,departement,commune,adresse,date_ouverture_site," +
  "est_exploitant,proche_entrepot,pts_activite,pts_effectif,pts_lien_entrepot,pts_site_recent,score";
const COLONNES_ENTREPRISE =
  "siren,raison_sociale,nb_sites,score_max,departements,exploite_un_entrepot,proche_d_un_entrepot";

type Vue = "site" | "entreprise";
type Lien = "tous" | "exploitant" | "voisin";
type Filtres = { dep: string; activite: string; scoreMin: number; lien: Lien; recherche: string };

const SEGMENTS_SCORE = [
  { cle: "pts_activite", label: "Activité", couleur: "bg-rack" },
  { cle: "pts_effectif", label: "Effectif", couleur: "bg-rack/45" },
  { cle: "pts_lien_entrepot", label: "Lien avec un entrepôt", couleur: "bg-poutre" },
  { cle: "pts_site_recent", label: "Site récent", couleur: "bg-encre" },
] as const;

function nettoyer(texte: string): string {
  return texte.replace(/[%_]/g, "");
}

function requeteSites(f: Filtres, colonnes: string, compter: boolean) {
  let q = gold().from("prospects").select(colonnes, compter ? { count: "exact" } : undefined);
  if (f.dep) q = q.eq("departement", f.dep);
  const act = ACTIVITES.find((a) => a.id === f.activite);
  if (act) q = q.in("naf", act.codes);
  if (f.scoreMin > 0) q = q.gte("score", f.scoreMin);
  if (f.lien === "exploitant") q = q.eq("est_exploitant", true);
  if (f.lien === "voisin") q = q.eq("proche_entrepot", true).eq("est_exploitant", false);
  if (f.recherche) q = q.ilike("raison_sociale", `%${nettoyer(f.recherche)}%`);
  return q.order("score", { ascending: false }).order("raison_sociale", { ascending: true });
}

function requeteEntreprises(f: Filtres, colonnes: string, compter: boolean) {
  let q = gold().from("prospects_entreprises").select(colonnes, compter ? { count: "exact" } : undefined);
  if (f.dep) q = q.ilike("departements", `%${f.dep}%`);
  if (f.scoreMin > 0) q = q.gte("score_max", f.scoreMin);
  if (f.lien === "exploitant") q = q.eq("exploite_un_entrepot", true);
  if (f.lien === "voisin") q = q.eq("proche_d_un_entrepot", true).eq("exploite_un_entrepot", false);
  if (f.recherche) q = q.ilike("raison_sociale", `%${nettoyer(f.recherche)}%`);
  return q.order("score_max", { ascending: false }).order("raison_sociale", { ascending: true });
}

function libelleLien(exploitant: boolean, proche: boolean): string {
  if (exploitant) return "Exploite un entrepôt";
  if (proche) return "À moins de 500 m d’un entrepôt";
  return "";
}

function BarreScore({ p }: { p: ProspectSite }) {
  const description = SEGMENTS_SCORE.map((s) => `${s.label} ${p[s.cle]}`).join(", ");
  return (
    <div className="flex items-center gap-3">
      <span className="w-8 text-right font-display text-xl font-bold tabular">{p.score}</span>
      <div className="flex h-3 w-32 bg-beton" role="img" aria-label={`Score ${p.score} sur 100 : ${description}`}>
        {SEGMENTS_SCORE.map((s) =>
          p[s.cle] > 0 ? (
            <div key={s.cle} className={s.couleur} style={{ width: `${p[s.cle]}%` }} title={`${s.label} : ${p[s.cle]} points`} />
          ) : null,
        )}
      </div>
    </div>
  );
}

function Bascule<T extends string | number>({
  options,
  valeur,
  onChange,
  label,
}: {
  options: { valeur: T; label: string }[];
  valeur: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex border-2 border-encre">
      {options.map((o) => (
        <button
          key={String(o.valeur)}
          type="button"
          aria-pressed={valeur === o.valeur}
          onClick={() => onChange(o.valeur)}
          className={`flex-1 px-3 py-1.5 text-sm font-medium ${
            valeur === o.valeur ? "bg-encre text-papier" : "bg-papier hover:bg-beton"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Prospection() {
  const [vue, setVue] = useState<Vue>("site");
  const [dep, setDep] = useState("");
  const [activite, setActivite] = useState("");
  const [scoreMin, setScoreMin] = useState(50);
  const [lien, setLien] = useState<Lien>("tous");
  const [saisie, setSaisie] = useState("");
  const [recherche, setRecherche] = useState("");
  const [page, setPage] = useState(0);

  const [sites, setSites] = useState<ProspectSite[]>([]);
  const [entreprises, setEntreprises] = useState<ProspectEntreprise[]>([]);
  const [total, setTotal] = useState(0);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [exportEnCours, setExportEnCours] = useState(false);

  const filtres = useMemo<Filtres>(
    () => ({ dep, activite, scoreMin, lien, recherche }),
    [dep, activite, scoreMin, lien, recherche],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      setRecherche(saisie.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [saisie]);

  useEffect(() => {
    let actif = true;
    const de = page * PAR_PAGE;
    const a = de + PAR_PAGE - 1;

    (async () => {
      setChargement(true);
      setErreur(null);
      if (vue === "site") {
        const { data, error, count } = await requeteSites(filtres, COLONNES_SITE, true).range(de, a);
        if (!actif) return;
        if (error) {
          setErreur(error.message);
          setSites([]);
          setTotal(0);
        } else {
          setSites((data ?? []) as unknown as ProspectSite[]);
          setTotal(count ?? 0);
        }
      } else {
        const { data, error, count } = await requeteEntreprises(filtres, COLONNES_ENTREPRISE, true).range(de, a);
        if (!actif) return;
        if (error) {
          setErreur(error.message);
          setEntreprises([]);
          setTotal(0);
        } else {
          setEntreprises((data ?? []) as unknown as ProspectEntreprise[]);
          setTotal(count ?? 0);
        }
      }
      setChargement(false);
    })();

    return () => {
      actif = false;
    };
  }, [vue, filtres, page]);

  function changer<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(0);
    };
  }

  async function exporter() {
    setExportEnCours(true);
    setErreur(null);
    try {
      const lignes: Record<string, string | number>[] = [];
      for (let de = 0; de < total; de += LOT_EXPORT) {
        const fin = de + LOT_EXPORT - 1;
        if (vue === "site") {
          const { data, error } = await requeteSites(filtres, COLONNES_SITE, false).range(de, fin);
          if (error) throw new Error(error.message);
          for (const p of (data ?? []) as unknown as ProspectSite[]) {
            lignes.push({
              "Raison sociale": p.raison_sociale ?? "",
              SIRET: p.siret,
              Activité: libelleNaf(p.naf),
              "Code NAF": p.naf ?? "",
              Effectif: TRANCHES[p.tranche_effectif ?? ""] ?? "",
              Adresse: p.adresse ?? "",
              Commune: p.commune ?? "",
              Département: p.departement ?? "",
              "Lien avec un entrepôt": libelleLien(p.est_exploitant, p.proche_entrepot),
              Score: p.score,
              "Points activité": p.pts_activite,
              "Points effectif": p.pts_effectif,
              "Points lien entrepôt": p.pts_lien_entrepot,
              "Points site récent": p.pts_site_recent,
            });
          }
        } else {
          const { data, error } = await requeteEntreprises(filtres, COLONNES_ENTREPRISE, false).range(de, fin);
          if (error) throw new Error(error.message);
          for (const e of (data ?? []) as unknown as ProspectEntreprise[]) {
            lignes.push({
              "Raison sociale": e.raison_sociale ?? "",
              SIREN: e.siren,
              "Nombre de sites": e.nb_sites,
              Départements: e.departements ?? "",
              "Lien avec un entrepôt": libelleLien(e.exploite_un_entrepot, e.proche_d_un_entrepot),
              "Score maximum": e.score_max,
            });
          }
        }
      }

      const filtresTexte = [
        `Vue : ${vue === "site" ? "par site" : "par entreprise"}`,
        `Département : ${dep ? `${dep} ${DEPARTEMENTS[dep]}` : "tous"}`,
        `Activité : ${ACTIVITES.find((a) => a.id === activite)?.label ?? "toutes"}`,
        `Score minimum : ${scoreMin}`,
        `Lien avec un entrepôt : ${lien}`,
        `Recherche : ${recherche || "aucune"}`,
      ];

      const classeur = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(classeur, XLSX.utils.json_to_sheet(lignes), "Prospects");
      XLSX.utils.book_append_sheet(
        classeur,
        XLSX.utils.aoa_to_sheet([
          ["Extraction DOCKZ", new Date().toLocaleString("fr-FR")],
          [],
          ["Filtres appliqués"],
          ...filtresTexte.map((t) => [t]),
          [],
          ["Source", "Producteur", "Licence"],
          ["SIRENE, API Recherche d'entreprises", "INSEE, DINUM", "Licence Ouverte 2.0"],
          ["Installations classées", "Géorisques", "Licence Ouverte 2.0"],
          [],
          ["Personnes physiques et établissements non diffusibles exclus."],
        ]),
        "Sources et filtres",
      );
      XLSX.writeFile(classeur, `dockz-prospects-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L’export a échoué.");
    } finally {
      setExportEnCours(false);
    }
  }

  const nbPages = Math.max(1, Math.ceil(total / PAR_PAGE));
  const champ = "w-full border-2 border-encre bg-papier px-3 py-1.5";

  return (
    <div className="mt-8">
      <div className="grid gap-4 border-y-2 border-encre py-5 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <span className="mb-1 block text-sm text-gris">Afficher</span>
          <Bascule
            label="Niveau d’affichage"
            valeur={vue}
            onChange={changer(setVue)}
            options={[
              { valeur: "site", label: "Par site" },
              { valeur: "entreprise", label: "Par entreprise" },
            ]}
          />
        </div>
        <label className="block">
          <span className="mb-1 block text-sm text-gris">Département</span>
          <select className={champ} value={dep} onChange={(e) => changer(setDep)(e.target.value)}>
            <option value="">Toute l’Île-de-France</option>
            {Object.entries(DEPARTEMENTS).map(([code, nom]) => (
              <option key={code} value={code}>
                {code} {nom}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-gris">Activité</span>
          <select
            className={`${champ} disabled:opacity-50`}
            value={activite}
            disabled={vue === "entreprise"}
            onChange={(e) => changer(setActivite)(e.target.value)}
          >
            <option value="">Toutes les activités</option>
            {ACTIVITES.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <div>
          <span className="mb-1 block text-sm text-gris">Score minimum</span>
          <Bascule
            label="Score minimum"
            valeur={scoreMin}
            onChange={changer(setScoreMin)}
            options={[
              { valeur: 0, label: "Tous" },
              { valeur: 30, label: "30" },
              { valeur: 50, label: "50" },
              { valeur: 70, label: "70" },
            ]}
          />
        </div>
        <label className="block">
          <span className="mb-1 block text-sm text-gris">Lien avec un entrepôt</span>
          <select className={champ} value={lien} onChange={(e) => changer(setLien)(e.target.value as Lien)}>
            <option value="tous">Tous</option>
            <option value="exploitant">Exploite un entrepôt</option>
            <option value="voisin">Occupant probable (à moins de 500 m)</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-gris">Rechercher une entreprise</span>
          <input
            type="search"
            className={champ}
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            placeholder="Nom de l’entreprise"
          />
        </label>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <p className="font-semibold" aria-live="polite">
          {chargement
            ? "Chargement…"
            : `${entier(total)} ${vue === "site" ? "sites" : "entreprises"} correspondent`}
        </p>
        <button
          type="button"
          onClick={exporter}
          disabled={exportEnCours || total === 0}
          className="border-2 border-encre bg-poutre px-4 py-2 font-semibold text-encre hover:bg-encre hover:text-papier disabled:opacity-50"
        >
          {exportEnCours ? "Export en cours…" : `Exporter ${entier(total)} lignes en Excel`}
        </button>
      </div>

      {vue === "site" && (
        <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-gris" aria-label="Légende du score">
          {SEGMENTS_SCORE.map((s) => (
            <li key={s.cle} className="flex items-center gap-2">
              <span className={`inline-block h-3 w-3 ${s.couleur}`} aria-hidden="true" />
              {s.label}
            </li>
          ))}
        </ul>
      )}

      {erreur && <p className="mt-4 border-l-4 border-poutre bg-beton px-4 py-3 text-sm">{erreur}</p>}

      <div className="mt-4 overflow-x-auto">
        {vue === "site" ? (
          <table className="w-full min-w-[860px] border-collapse text-left">
            <thead>
              <tr className="border-b-2 border-encre text-sm text-gris">
                <th className="py-2 pr-4 font-medium">Entreprise et site</th>
                <th className="py-2 pr-4 font-medium">Activité</th>
                <th className="py-2 pr-4 font-medium">Effectif</th>
                <th className="py-2 pr-4 font-medium">Dép.</th>
                <th className="py-2 pr-4 font-medium">Score</th>
                <th className="py-2 font-medium">Lien avec un entrepôt</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((p) => (
                <tr key={p.siret} className="border-b border-encre/10 align-top">
                  <td className="py-3 pr-4">
                    <span className="font-semibold">{p.raison_sociale}</span>
                    <span className="block text-sm text-gris">{p.adresse}</span>
                  </td>
                  <td className="py-3 pr-4 text-sm">{libelleNaf(p.naf)}</td>
                  <td className="py-3 pr-4 text-sm tabular">{TRANCHES[p.tranche_effectif ?? ""] ?? ""}</td>
                  <td className="py-3 pr-4 tabular">{p.departement}</td>
                  <td className="py-3 pr-4">
                    <BarreScore p={p} />
                  </td>
                  <td className="py-3 text-sm">{libelleLien(p.est_exploitant, p.proche_entrepot)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr className="border-b-2 border-encre text-sm text-gris">
                <th className="py-2 pr-4 font-medium">Entreprise</th>
                <th className="py-2 pr-4 text-right font-medium">Sites</th>
                <th className="py-2 pr-4 font-medium">Départements</th>
                <th className="py-2 pr-4 text-right font-medium">Score maximum</th>
                <th className="py-2 font-medium">Lien avec un entrepôt</th>
              </tr>
            </thead>
            <tbody>
              {entreprises.map((e) => (
                <tr key={e.siren} className="border-b border-encre/10">
                  <td className="py-3 pr-4 font-semibold">{e.raison_sociale}</td>
                  <td className="py-3 pr-4 text-right tabular">{e.nb_sites}</td>
                  <td className="py-3 pr-4 tabular">{e.departements}</td>
                  <td className="py-3 pr-4 text-right font-display text-xl font-bold tabular">{e.score_max}</td>
                  <td className="py-3 text-sm">{libelleLien(e.exploite_un_entrepot, e.proche_d_un_entrepot)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {!chargement && total === 0 && !erreur && (
          <p className="py-10 text-center text-gris">
            Aucune entreprise ne correspond à ces filtres. Baissez le score minimum ou élargissez le
            département.
          </p>
        )}
      </div>

      {total > PAR_PAGE && (
        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="border-2 border-encre px-4 py-1.5 font-medium hover:bg-beton disabled:opacity-40"
          >
            Page précédente
          </button>
          <span className="text-sm text-gris tabular">
            Page {page + 1} sur {nbPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(nbPages - 1, p + 1))}
            disabled={page >= nbPages - 1}
            className="border-2 border-encre px-4 py-1.5 font-medium hover:bg-beton disabled:opacity-40"
          >
            Page suivante
          </button>
        </div>
      )}
    </div>
  );
}
