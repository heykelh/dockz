import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY doivent être définies dans web/.env.local",
  );
}

const supabase = createClient(url, key);

// Le site ne lit que la couche d'exposition (vues du schéma public sur la Gold)
export const gold = () => supabase.schema("public");
