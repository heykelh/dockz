import { Prospection } from "@/components/prospection";

export default function ProspectionPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-4xl font-bold">Prospection</h1>
      <p className="mt-3 max-w-2xl leading-relaxed">
        Entreprises de 10 salariés et plus liées à la logistique en Île-de-France, classées par un score
        sur 100. Chaque couleur de la barre montre d’où viennent les points.
      </p>
      <Prospection />
    </div>
  );
}
