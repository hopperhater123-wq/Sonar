// Sonar — sentiment: fuellt SentimentPolarity (Schicht 2, Spec §5) aus eigenen Texten.
//
// Quellen: news-Schlagzeilen (laufen bereits via ingest/rss) + social_posts
// (aktiviert sich automatisch, sobald Reddit-Creds gesetzt sind). Das Lexikon
// laeuft immer (keyless); Claude-LLM als zweite Quelle nur bei
// SENTIMENT_LLM_ENABLED=true + ANTHROPIC_API_KEY.
//
// Wichtig (19.07.): Lexikon und LLM haben UNTERSCHIEDLICHE Eintritts-Bedingungen.
//   * Lexikon zaehlt nur Texte, in denen es ein Stimmungswort findet (hits>0) —
//     sonst wuerde es Rauschen schreiben.
//   * Der LLM bekommt JEDEN Text mit erkanntem Ticker, auch ohne Stichwort —
//     Claude liest Stimmung aus dem Kontext, wo das Lexikon blind ist. Das hebt
//     die Sentiment-Abdeckung (sentiment_coverage) ohne Extra-Kosten spuerbar.
//
// Schreibt normale signals-Zeilen (source: sentiment_lexicon / sentiment_llm,
// sentiment_score -1..+1) — sonar_score_run() mittelt darueber (Migration 0009).
// Cron: :03/:33 — nach ingest (:00/:30), vor score (:05/:35).

import { createClient } from "jsr:@supabase/supabase-js@2";
import { analyzeText, extractTickers } from "./lib/lexicon.ts";
import { classifyBatch, type SymbolTexts } from "./lib/llm.ts";

const LOOKBACK_HOURS = 48;
const NEWS_WEIGHT = 1.0; // Schlagzeile hat kein Engagement-Signal — neutraler Fixwert
const MAX_TEXTS_PER_SYMBOL = 8;

interface TextItem {
  text: string;
  weight: number;
}

interface Acc {
  lexWeightedSum: number; // nur aus Texten mit Lexikon-Treffer
  lexWeightSum: number;
  texts: string[]; // ALLE ticker-erkannten Texte — Futter fuer den LLM
}

// Engagement-Gewicht: viel-beachtete Posts zaehlen mehr.
const engagementWeight = (score: number | null, comments: number | null) =>
  1 + Math.log10(1 + Math.max(score ?? 0, 0) + Math.max(comments ?? 0, 0));

function signalRow(symbol: string, source: string, score: number, at: string) {
  return {
    asset_symbol: symbol,
    asset_type: "crypto",
    source,
    sentiment_score: score,
    captured_at: at,
  };
}

Deno.serve(async () => {
  const started = Date.now();
  const since = new Date(Date.now() - LOOKBACK_HOURS * 3_600_000).toISOString();

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const [uniRes, postsRes, newsRes] = await Promise.all([
    db.from("symbol_features").select("symbol"),
    db.from("social_posts").select("title, score, num_comments").gte("captured_at", since),
    db.from("news").select("title").gte("captured_at", since),
  ]);

  const loadErr = uniRes.error ?? postsRes.error ?? newsRes.error;
  if (loadErr) {
    return Response.json({ ok: false, error: loadErr.message }, { status: 500 });
  }

  // Bekanntes Krypto-Universum (durch die View bereits BTC.X→BTC-normalisiert).
  const known = new Set<string>(
    (uniRes.data ?? []).map((u: { symbol: string }) => u.symbol),
  );

  const items: TextItem[] = [
    ...(postsRes.data ?? [])
      .filter((p: { title: string | null }) => p.title)
      .map((p: { title: string; score: number | null; num_comments: number | null }) => ({
        text: p.title,
        weight: engagementWeight(p.score, p.num_comments),
      })),
    ...(newsRes.data ?? [])
      .filter((n: { title: string | null }) => n.title)
      .map((n: { title: string }) => ({ text: n.title, weight: NEWS_WEIGHT })),
  ];

  // Pro Symbol akkumulieren. Kandidat = jeder Text mit erkanntem Ticker aus dem
  // bekannten Universum. Lexikon-Summe nur bei hits>0; Texte fuer den LLM immer.
  const acc = new Map<string, Acc>();
  for (const it of items) {
    const tickers = extractTickers(it.text, known).filter((s) => known.has(s));
    if (tickers.length === 0) continue;
    const { score, hits } = analyzeText(it.text);
    for (const sym of tickers) {
      let a = acc.get(sym);
      if (!a) {
        a = { lexWeightedSum: 0, lexWeightSum: 0, texts: [] };
        acc.set(sym, a);
      }
      if (hits > 0) {
        a.lexWeightedSum += score * it.weight;
        a.lexWeightSum += it.weight;
      }
      if (a.texts.length < MAX_TEXTS_PER_SYMBOL) a.texts.push(it.text);
    }
  }

  const now = new Date().toISOString();

  // --- Lexikon-Sentiment (laeuft immer, nur Texte mit Stichwort-Treffer) ---
  const lexRows = [...acc.entries()]
    .filter(([, a]) => a.lexWeightSum > 0)
    .map(([sym, a]) => signalRow(sym, "sentiment_lexicon", a.lexWeightedSum / a.lexWeightSum, now));

  let dbError: string | null = null;
  if (lexRows.length) {
    const { error } = await db.from("signals").insert(lexRows);
    if (error) dbError = `lexicon: ${error.message}`;
  }

  // --- LLM-Sentiment (optional): ALLE ticker-erkannten Symbole, auch ohne Stichwort ---
  let llmRowCount = 0;
  let llmError: string | null = null;
  const llmEnabled = Deno.env.get("SENTIMENT_LLM_ENABLED") === "true";
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");

  if (llmEnabled && apiKey && acc.size > 0) {
    try {
      const batches: SymbolTexts[] = [...acc.entries()]
        .filter(([, a]) => a.texts.length > 0)
        .map(([symbol, a]) => ({ symbol, texts: a.texts }));
      const scores = await classifyBatch(batches, apiKey);
      const llmRows = Object.entries(scores)
        .filter(([sym]) => known.has(sym))
        .map(([sym, score]) => signalRow(sym, "sentiment_llm", score, now));
      llmRowCount = llmRows.length;
      if (llmRows.length) {
        const { error } = await db.from("signals").insert(llmRows);
        if (error) llmError = `llm: ${error.message}`;
      }
    } catch (e) {
      llmError = e instanceof Error ? e.message : String(e);
    }
  }

  return Response.json({
    ok: dbError == null,
    ms: Date.now() - started,
    postsScanned: postsRes.data?.length ?? 0,
    newsScanned: newsRes.data?.length ?? 0,
    symbolsWithTicker: acc.size, // Kandidaten mit erkanntem Ticker (LLM-Reichweite)
    lexiconRows: lexRows.length, // davon mit Lexikon-Stichwort
    llm: { enabled: llmEnabled, hasKey: !!apiKey, rows: llmRowCount, error: llmError },
    dbError,
  }, { status: dbError == null ? 200 : 500 });
});
