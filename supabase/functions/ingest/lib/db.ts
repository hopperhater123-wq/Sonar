// Persistenz-Schicht: Supabase-Client (Service-Role) + Schreibhelfer je Tabelle.
// signals/market_context: reine Zeitreihe -> INSERT.
// news/social_posts: dedupliziert -> UPSERT auf dem Unique-Key.

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { MarketContextRow, NewsRow, SignalRow, SocialPostRow } from "./types.ts";

export function makeClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen in der Umgebung");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function insertSignals(db: SupabaseClient, rows: SignalRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const { error } = await db.from("signals").insert(rows);
  if (error) throw new Error(`signals: ${error.message}`);
  return rows.length;
}

export async function insertMarketContext(
  db: SupabaseClient,
  rows: MarketContextRow[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const { error } = await db.from("market_context").insert(rows);
  if (error) throw new Error(`market_context: ${error.message}`);
  return rows.length;
}

export async function upsertNews(db: SupabaseClient, rows: NewsRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  // Bestehende Schlagzeilen nicht überschreiben (ändern sich nicht).
  const { error } = await db
    .from("news")
    .upsert(rows, { onConflict: "url", ignoreDuplicates: true });
  if (error) throw new Error(`news: ${error.message}`);
  return rows.length;
}

export async function upsertSocialPosts(
  db: SupabaseClient,
  rows: SocialPostRow[],
): Promise<number> {
  if (rows.length === 0) return 0;
  // Score/Kommentare aktualisieren, wenn derselbe Post erneut auftaucht.
  const { error } = await db
    .from("social_posts")
    .upsert(rows, { onConflict: "external_id", ignoreDuplicates: false });
  if (error) throw new Error(`social_posts: ${error.message}`);
  return rows.length;
}
