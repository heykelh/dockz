export const DEPARTEMENTS: Record<string, string> = {
  "75": "Paris",
  "77": "Seine-et-Marne",
  "78": "Yvelines",
  "91": "Essonne",
  "92": "Hauts-de-Seine",
  "93": "Seine-Saint-Denis",
  "94": "Val-de-Marne",
  "95": "Val-d'Oise",
};

export const NAF: Record<string, string> = {
  "52.10A": "Entreposage frigorifique",
  "52.10B": "Entreposage non frigorifique",
  "52.29A": "Messagerie, fret express",
  "52.29B": "Affrètement, organisation des transports",
  "49.41A": "Transport routier interurbain",
  "49.41B": "Transport routier de proximité",
  "47.91A": "Vente à distance, catalogue général",
  "47.91B": "Vente à distance, catalogue spécialisé",
  "53.20Z": "Livraison, courrier",
  "68.20A": "Location de logements",
  "68.20B": "Location de biens immobiliers",
  "68.32A": "Administration de biens immobiliers",
  "52.22Z": "Services portuaires et fluviaux",
  "64.20Z": "Holding",
  "70.10Z": "Siège social",
  "46.39B": "Commerce de gros alimentaire",
  "71.12B": "Ingénierie, études techniques",
  "66.30Z": "Gestion de fonds",
};

export const TRANCHES: Record<string, string> = {
  "11": "10 à 19",
  "12": "20 à 49",
  "21": "50 à 99",
  "22": "100 à 199",
  "31": "200 à 249",
  "32": "250 à 499",
  "41": "500 à 999",
  "42": "1 000 à 1 999",
  "51": "2 000 à 4 999",
  "52": "5 000 à 9 999",
  "53": "10 000 et plus",
};

export const ACTIVITES = [
  { id: "entreposage", label: "Entreposage", codes: ["52.10A", "52.10B"] },
  { id: "vad", label: "Vente à distance", codes: ["47.91A", "47.91B"] },
  { id: "messagerie", label: "Messagerie et affrètement", codes: ["52.29A", "52.29B"] },
  { id: "transport", label: "Transport routier", codes: ["49.41A", "49.41B"] },
  { id: "livraison", label: "Livraison", codes: ["53.20Z"] },
];

export const SEGMENTS = [
  { id: "moins de 300 m2", label: "Moins de 300 m²" },
  { id: "300 a 1 000 m2", label: "300 à 1 000 m²" },
  { id: "1 000 a 5 000 m2", label: "1 000 à 5 000 m²" },
  { id: "5 000 m2 et plus", label: "5 000 m² et plus" },
];

const nf = new Intl.NumberFormat("fr-FR");

export function entier(n: number | null | undefined): string {
  return n == null ? "" : nf.format(Math.round(n));
}

export function millions(n: number): string {
  return (n / 1_000_000).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function pourcent(a: number, b: number): number {
  return b ? Math.round((100 * a) / b) : 0;
}

export function dateLongue(s: string | null | undefined): string {
  if (!s) return "";
  return new Date(s).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

export function libelleNaf(code: string | null | undefined): string {
  if (!code) return "Non renseignée";
  return NAF[code] ?? code;
}
