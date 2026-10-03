export function ErreurDonnees({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="font-display text-3xl font-bold">Les données n’ont pas pu être chargées</h1>
      <p className="mt-4 leading-relaxed">
        Vérifiez que le schéma gold est exposé dans Supabase (Project Settings, puis API) et que le
        rôle anon a le droit de lecture sur ce schéma.
      </p>
      <p className="mt-4 border-l-4 border-poutre bg-beton px-4 py-3 text-sm">{message}</p>
    </div>
  );
}
