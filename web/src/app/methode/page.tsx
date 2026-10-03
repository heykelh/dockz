const ETAPES = [
  {
    titre: "Collecter",
    texte:
      "Les données publiques sont récupérées et stockées exactement telles qu’elles ont été reçues. En cas de doute, on peut toujours revenir à l’original.",
  },
  {
    titre: "Nettoyer",
    texte:
      "Formats corrigés, doublons regroupés, personnes physiques et établissements non diffusibles exclus, exploitants identifiés par leur numéro SIRET.",
  },
  {
    titre: "Calculer",
    texte:
      "Les indicateurs utilisés par les équipes sont produits : parc par département, prix médians, prospects classés.",
  },
];

const SCORE = [
  { critere: "Activité", regle: "Entreposage 30, vente à distance 25, messagerie et affrètement 20, transport routier 15, livraison 10", points: "30" },
  { critere: "Effectif", regle: "De 5 points (10 à 19 salariés) à 25 points (200 salariés et plus)", points: "25" },
  { critere: "Lien avec un entrepôt", regle: "Exploite un entrepôt classé 35, situé à moins de 500 m d’un entrepôt classé 25", points: "35" },
  { critere: "Site récent", regle: "Établissement ouvert il y a moins de 5 ans", points: "10" },
];

const LIMITES = [
  "Pas de loyers ni de surfaces louées : ces chiffres appartiennent aux conseils en immobilier et ne sont pas publics.",
  "Pas de petits entrepôts : ceux soumis à simple déclaration n’ont pas leurs activités détaillées dans la source.",
  "Boutiques et locaux d’activité sont regroupés dans les ventes DVF : la taille du local sert d’indicateur.",
  "Une entreprise proche d’un entrepôt n’en est pas forcément l’occupante : c’est un indice, pas une certitude.",
];

export default function MethodePage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-4xl font-bold">Comment DOCKZ est construit</h1>
      <p className="mt-4 leading-relaxed">
        DOCKZ est l’outil data de la ligne Industrial &amp; Logistics d’ERBC, un conseil en immobilier
        d’entreprise fictif. Il répond à trois questions : où sont les grands entrepôts, quelles entreprises
        pourraient en chercher, et ce que valent les locaux d’activité. Toutes les données sont publiques.
      </p>

      <section className="mt-12">
        <h2 className="font-display text-2xl font-bold">La chaîne de données</h2>
        <ol className="mt-5 space-y-5">
          {ETAPES.map((e, i) => (
            <li key={e.titre} className="grid grid-cols-[3rem_1fr] gap-4 border-t border-encre/15 pt-4">
              <span className="font-display text-4xl font-bold leading-none text-rack">{i + 1}</span>
              <div>
                <h3 className="text-lg font-semibold">{e.titre}</h3>
                <p className="mt-1 leading-relaxed">{e.texte}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-5 leading-relaxed">
          Chaque exécution est tracée (date, statut, nombre de lignes) et chaque contrôle est enregistré.
          Les résultats sont visibles sur la page Qualité des données.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-2xl font-bold">Le score de prospection</h2>
        <p className="mt-2 leading-relaxed">
          Le score est volontairement simple : chaque critère est visible, pour que l’on comprenne
          immédiatement pourquoi une entreprise est bien classée. Les pondérations sont un point de départ,
          à ajuster avec les équipes commerciales.
        </p>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left">
            <thead>
              <tr className="border-b-2 border-encre text-sm text-gris">
                <th className="py-2 pr-4 font-medium">Critère</th>
                <th className="py-2 pr-4 font-medium">Règle</th>
                <th className="py-2 text-right font-medium">Points maximum</th>
              </tr>
            </thead>
            <tbody>
              {SCORE.map((s) => (
                <tr key={s.critere} className="border-b border-encre/10 align-top">
                  <td className="py-3 pr-4 font-semibold">{s.critere}</td>
                  <td className="py-3 pr-4 text-sm leading-relaxed">{s.regle}</td>
                  <td className="py-3 text-right font-display text-xl font-bold tabular">{s.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-2xl font-bold">Les sources</h2>
        <ul className="mt-4 space-y-3 leading-relaxed">
          <li>
            <a className="font-semibold underline hover:text-rack" href="https://recherche-entreprises.api.gouv.fr">
              SIRENE
            </a>{" "}
            via l’API Recherche d’entreprises (INSEE, DINUM) : les entreprises ciblées.
          </li>
          <li>
            <a className="font-semibold underline hover:text-rack" href="https://www.georisques.gouv.fr">
              Géorisques
            </a>{" "}
            (ministère de la Transition écologique) : les installations classées, dont les entrepôts.
          </li>
          <li>
            <a className="font-semibold underline hover:text-rack" href="https://files.data.gouv.fr/geo-dvf/">
              DVF géolocalisé
            </a>{" "}
            (DGFiP, Etalab) : les ventes immobilières de 2021 à 2025.
          </li>
        </ul>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-2xl font-bold">Ce que DOCKZ ne fait pas</h2>
        <ul className="mt-4 space-y-3">
          {LIMITES.map((l) => (
            <li key={l} className="border-l-4 border-poutre pl-4 leading-relaxed">
              {l}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
