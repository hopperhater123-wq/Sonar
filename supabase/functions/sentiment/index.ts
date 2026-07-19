// Sonar — sentiment: fuellt SentimentPolarity (Schicht 2, Spec §5) aus eigenen Texten.
//
// Quellen: news-Schlagzeilen (laufen bereits via ingest/rss) + social_posts
// (aktiviert sich automatisch, sobald Reddit-Creds gesetzt sind). Das Lexikon
// laeuft immer (keyless); Claude-LLM als zweite Quelle nur bei
// SENTIMENT_LLM_ENABLED=true + ANTHROPIC_API_KEY.
//
// Schreibt normale signals-Zeilen (source: sentiment_lexicon / sentiment_llm,
// sentiment_score -1..+1) — sonar_score_run() mittelt darueber (Migration 0009).
// Cron: :03/:33 — nach ingest (:00/:30), vor score (:05/:35).

import { createClient } from "jsr:@supabase/supabase-js@2";
import { analyzeText, extractTickers } from "./lib/lexicon.ts";
import { classifyBatch, type SymbolTexts } from "./lib/llm.ts";

const LOOKBACK_HOURS = 48;
const NEWS_WEIGHT = 1.0; // Schlagzeile hat kein Engagement-Signal — neutraler Fixwert

interface TextItem {
  text: string;
  weight: number;
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

  // Pro Symbol akkumulieren. Nur Ticker aus dem bekannten Universum —
  // fremde $CASHTAGS erzeugen keinen Symbol-Muell in signals.
  const acc = new Map<string, { weightedSum: number; weightSum: number; texts: string[] }>();
  for (const it of items) {
    const tickers = extractTickers(it.text, known).filter((s) => known.has(s));
    if (tickers.length === 0) continue;
    const { score, hits } = analyzeText(it.text);
    if (hits === 0) continue; // kein Stimmungssignal im Text
    for (const sym of tickers) {
      let a = acc.get(sym);
      if (!a) {
        a = { weightedSum: 0, weightSum: 0, texts: [] };
        acc.set(sym, a);
      }
      a.weightedSum += score * it.weight;
      a.weightSum += it.weight;
      if (a.texts.length < 8) a.texts.push(it.text);
    }
  }

  const now = new Date().toISOString();

  // --- Lexikon-Sentiment (laeuft immer) ---
  const lexRows = [...acc.entries()]
    .filter(([, a]) => a.weightSum > 0)
    .map(([sym, a]) => signalRow(sym, "sentiment_lexicon", a.weightedSum / a.weightSum, now));

  let dbError: string | null = null;
  if (lexRows.length) {
    const { error } = await db.from("signals").insert(lexRows);
    if (error) dbError = `lexicon: ${error.message}`;
  }

  // --- LLM-Sentiment (optional, zuschaltbar) ---
  let llmRowCount = 0;
  let llmError: string | null = null;
  const llmEnabled = Deno.env.get("SENTIMENT_LLM_ENABLED") === "true";
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");

  if (llmEnabled && apiKey && acc.size > 0) {
    try {
      const batches: SymbolTexts[] = [...acc.entries()]
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
    symbolsWithSentiment: acc.size,
    lexiconRows: lexRows.length,
    llm: { enabled: llmEnabled, hasKey: !!apiKey, rows: llmRowCount, error: llmError },
    dbError,
  }, { status: dbError == null ? 200 : 500 });
});
