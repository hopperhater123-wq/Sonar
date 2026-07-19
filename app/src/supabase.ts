import { createClient } from "@supabase/supabase-js";

// URL + Publishable Key sind public by design (Spec §3: keine echten Secrets im
// Frontend). Daten liefert die DB erst nach Login: RLS-Read-Policies gelten nur
// fuer `authenticated` (Migration 0010), Schreib-Policies gibt es gar keine.
const url = import.meta.env.VITE_SUPABASE_URL ?? "https://drwueulymfgfvgslxgay.supabase.co";
const key = import.meta.env.VITE_SUPABASE_KEY ?? "sb_publishable_tUrvVeJ4-b4pgrqIFHUTHg_aOuJm5bI";

export const supabase = createClient(url, key);
