// Sonar — Ingest (Schicht 1, Orchestrator).
//
// Pipeline-Registry: alle Quell-Adapter laufen parallel, jeder Fehler bleibt
// isoliert (ein Ausfall killt nicht den Rest). Ergebnisse werden pro
// Zieltabelle persistiert. Antwort ist eine JSON-Summary — beim ersten echten
// Lauf zeigt sie, welche Quelle wie viel lieferte und wo es hakt.
//
// NEUE QUELLE = eine Zeile in ADAPTERS.
// NEUE ZIELTABELLE = ein Feld in AdapterResult + ein Persist-Block unten.

import { insertMarketContext, insertSignals, makeClient, upsertNews, upsertSocialPosts } from "./lib/db.ts";
import type { AdapterResult, RunContext, SourceAdapter } from "./lib/types.ts";

import { coingecko } from "./sources/coingecko.ts";
import { coinpaprika } from "./sources/coinpaprika.ts";
import { dexscreener } from "./sources/dexscreener.ts";
import { apewisdom } from "./sources/apewisdom.ts";
import { alternativeme } from "./sources/alternativeme.ts";
import { rss } from "./sources/rss.ts";
import { reddit } from "./sources/reddit.ts";

// Registry aller aktiven Quellen.
const ADAPTERS: SourceAdapter[] = [
  coingecko,
  coinpaprika,
  dexscreener,
  apewisdom,
  alternativeme,
  rss,
  reddit,
];

function errMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

Deno.serve(async () => {
  const started = Date.now();
  const now = new Date();
  const ctx: RunContext = { now, env: (k) => Deno.env.get(k) };

  const sourceErrors: Record<string, string> = {};
  const merged: Required<AdapterResult> = { signals: [], marketContext: [], news: [], socialPosts: [] };

  // 1) Alle Adapter parallel, Fehler isoliert.
  const results = await Promise.allSettled(ADAPTERS.map((a) => a.run(ctx)));
  results.forEach((r, i) => {
    const name = ADAPTERS[i].name;
    if (r.status === "rejected") {
      sourceErrors[name] = errMessage(r.reason);
      return;
    }
    const v = r.value;
    if (v.signals?.length) merged.signals.push(...v.signals);
    if (v.marketContext?.length) merged.marketContext.push(...v.marketContext);
    if (v.news?.length) merged.news.push(...v.news);
    if (v.socialPosts?.length) merged.socialPosts.push(...v.socialPosts);
  });

  // 2) Persistieren — pro Tabelle isoliert, damit ein DB-Fehler nicht alles verwirft.
  const counts = { signals: 0, marketContext: 0, news: 0, socialPosts: 0 };
  let db;
  try {
    db = makeClient();
  } catch (e) {
    return Response.json(
      { ok: false, error: errMessage(e), sourceErrors },
      { status: 500 },
    );
  }

  try { counts.signals = await insertSignals(db, merged.signals); }
  catch (e) { sourceErrors["db:signals"] = errMessage(e); }

  try { counts.marketContext = await insertMarketContext(db, merged.marketContext); }
  catch (e) { sourceErrors["db:market_context"] = errMessage(e); }

  try { counts.news = await upsertNews(db, merged.news); }
  catch (e) { sourceErrors["db:news"] = errMessage(e); }

  try { counts.socialPosts = await upsertSocialPosts(db, merged.socialPosts); }
  catch (e) { sourceErrors["db:social_posts"] = errMessage(e); }

  return Response.json({
    ok: Object.keys(sourceErrors).length === 0,
    durationMs: Date.now() - started,
    ranAt: now.toISOString(),
    sources: ADAPTERS.map((a) => a.name),
    counts,
    sourceErrors,
  });
});
