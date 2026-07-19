// Sonar — judge: Claude-Urteils-Schicht (Spec §6). Reicht die Top-N-Kandidaten
// des juengsten Score-Laufs samt Kontext (Komponenten, Sentiment, News-Schlagzeilen,
// Fear&Greed) an Claude und schreibt STRUKTURIERTE Vorschlaege nach `proposals`
// (origin 'claude'). Claude darf und soll "no_trade" urteilen.
//
// Bewusst on-demand, KEIN Cron: jeder Lauf kostet API-Calls, Vorschlaege sollen
// kein Spam sein. Dormant ohne Secrets — aktiv erst mit JUDGE_ENABLED=true +
// ANTHROPIC_API_KEY. verify_jwt=true, damit Fremde nicht per oeffentlicher URL
// API-Guthaben verbrennen koennen; Aufruf mit dem (public) anon-Key als Bearer:
//   curl -X POST https://<ref>.supabase.co/functions/v1/judge \
//        -H "Authorization: Bearer <ANON_KEY>"
//
// Jeder Vorschlag bleibt NUR ein Vorschlag (Status proposed, manuelle
// Bestaetigung) — kein Finanzrat, keine Order. Der Paper-Forward-Test nimmt
// Claude-Vorschlaege automatisch mit auf (paper_open_from_proposals).

import { createClient } from "jsr:@supabase/supabase-js@2";

interface Inputs {
  price?: number | null;
  price_change_24h?: number | null;
  volume_24h?: number | null;
  mentions?: number | null;
  mentions_delta?: number | null;
}

interface LeaderRow {
  asset_symbol: string;
  sonar_score: number;
  components_json: {
    has_volume?: boolean;
    sentiment_polarity?: number;
    mentions_momentum?: number;
    price_momentum?: number;
    volume_confirmation?: number;
    hype_penalty?: number;
    inputs?: Inputs;
  } & Record<string, unknown>;
  run_at: string;
}

interface StrategyCfg {
  top_n: number;
  min_score: number;
  max_position_pct: number;
  require_volume: boolean;
}

interface Judgment {
  symbol?: string;
  verdict?: string;
  entry_zone?: string;
  stop_loss?: number;
  take_profit?: number;
  position_size_pct?: number;
  confidence?: number;
  rationale?: string;
  counterpoints?: string;
}

function parseJudgments(text: string): Judgment[] {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1) return [];
  try {
    const arr = JSON.parse(cleaned.slice(start, end + 1));
    return Array.isArray(arr) ? (arr as Judgment[]) : [];
  } catch {
    return [];
  }
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

function buildPrompt(
  candidates: unknown[],
  fg: { value: number | null; classification: string | null },
  maxPos: number,
): string {
  return [
    'Du bist die Urteils-Schicht ("Judge") eines privaten Krypto-Signal-Tools',
    "(ausschliesslich Eigengebrauch, keine Anlageberatung, keine Auto-Ausfuehrung).",
    "Unten die Top-Kandidaten des aktuellen SonarScore-Laufs mit Kontext.",
    'Beurteile JEDEN Kandidaten eigenstaendig und kritisch — vergib "no_trade",',
    "wenn die Datenlage duenn, widerspruechlich oder das Chance/Risiko schlecht ist.",
    "",
    `Marktumfeld: Fear & Greed = ${fg.value ?? "unbekannt"} (${fg.classification ?? "?"}).`,
    "",
    "Regeln:",
    "- Nur Long-Setups oder no_trade (kein Short, kein Hebel).",
    "- stop_loss < aktueller Preis < take_profit; realistische Zonen nahe am Preis.",
    `- position_size_pct: 0..${maxPos} (% des Risiko-Budgets), im Zweifel klein.`,
    "- confidence: 0..1, ehrlich. counterpoints sind PFLICHT — konkret, nicht generisch.",
    "- Beachte: Volumen-Bestaetigung ist Pflicht; Mentions ohne Volumen = Fake-Hype;",
    "  extreme Gier mahnt zur Vorsicht; Sentiment ist Fruehindikator mit Rauschen.",
    "",
    "Antworte NUR mit einem JSON-Array, ein Objekt je Kandidat:",
    '[{"symbol":"BTC","verdict":"long","entry_zone":"...","stop_loss":0,"take_profit":0,',
    ' "position_size_pct":0,"confidence":0,"rationale":"...","counterpoints":"..."}]',
    'Bei verdict "no_trade" reichen symbol, verdict, rationale, counterpoints.',
    "",
    "Kandidaten:",
    JSON.stringify(candidates, null, 1),
  ].join("\n");
}

Deno.serve(async () => {
  const started = Date.now();
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  const enabled = Deno.env.get("JUDGE_ENABLED") === "true";
  if (!enabled || !apiKey) {
    return Response.json({
      ok: true,
      enabled: false,
      hint: "Dormant. Function Secrets JUDGE_ENABLED=true + ANTHROPIC_API_KEY setzen, dann erneut aufrufen.",
    });
  }
  const model = Deno.env.get("JUDGE_MODEL") ?? "claude-sonnet-5";

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const since = new Date(Date.now() - 48 * 3600_000).toISOString();
  const [cfgRes, lbRes, fgRes, newsRes] = await Promise.all([
    db.from("strategy_config").select("*").eq("id", 1).single(),
    db.from("sonar_leaderboard").select("*"),
    db.from("market_context").select("value, classification").eq("metric", "fear_greed")
      .order("captured_at", { ascending: false }).limit(1),
    db.from("news").select("title").gte("captured_at", since),
  ]);
  const loadErr = cfgRes.error ?? lbRes.error ?? fgRes.error ?? newsRes.error;
  if (loadErr) return Response.json({ ok: false, error: loadErr.message }, { status: 500 });

  const cfg = cfgRes.data as StrategyCfg;
  const fgRow = (fgRes.data as { value: number; classification: string | null }[] | null)?.[0];
  const fg = { value: fgRow?.value ?? null, classification: fgRow?.classification ?? null };
  const titles = ((newsRes.data ?? []) as { title: string }[]).map((n) => n.title);

  const leaders = ((lbRes.data ?? []) as LeaderRow[])
    .filter((r) =>
      r.sonar_score >= cfg.min_score &&
      (!cfg.require_volume || r.components_json.has_volume === true) &&
      r.components_json.inputs?.price != null
    )
    .slice(0, cfg.top_n);

  if (leaders.length === 0) {
    return Response.json({ ok: true, enabled: true, judged: 0, hint: "Keine Kandidaten ueber min_score." });
  }

  const bySymbol = new Map(leaders.map((r) => [r.asset_symbol, r]));
  const candidates = leaders.map((r) => ({
    symbol: r.asset_symbol,
    sonar_score: r.sonar_score,
    komponenten: {
      mentions_momentum: r.components_json.mentions_momentum,
      sentiment_polarity: r.components_json.sentiment_polarity,
      price_momentum: r.components_json.price_momentum,
      volume_confirmation: r.components_json.volume_confirmation,
      hype_penalty: r.components_json.hype_penalty,
    },
    markt: r.components_json.inputs ?? {},
    news: titles
      .filter((t) => new RegExp(`\\b${r.asset_symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(t.toUpperCase()))
      .slice(0, 5),
  }));

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      messages: [{ role: "user", content: buildPrompt(candidates, fg, cfg.max_position_pct) }],
    }),
  });
  if (!res.ok) {
    return Response.json({ ok: false, error: `Anthropic ${res.status}: ${await res.text()}` }, { status: 502 });
  }
  const data = await res.json();
  const text = (data.content ?? [])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("");

  const judgments = parseJudgments(text);
  const now = new Date().toISOString();
  const skipped: string[] = [];
  const noTrade: string[] = [];
  const rows: Record<string, unknown>[] = [];

  for (const j of judgments) {
    const sym = j.symbol?.toUpperCase();
    const cand = sym ? bySymbol.get(sym) : undefined;
    if (!sym || !cand) continue;
    if (j.verdict === "no_trade") {
      noTrade.push(sym);
      continue;
    }
    const price = cand.components_json.inputs?.price ?? null;
    const stop = Number(j.stop_loss);
    const tp = Number(j.take_profit);
    // Sanity-Gate: Long-Logik muss stimmen, sonst Kandidat verwerfen statt Murks speichern.
    if (
      j.verdict !== "long" || price == null ||
      !Number.isFinite(stop) || !Number.isFinite(tp) || stop >= price || tp <= price
    ) {
      skipped.push(sym);
      continue;
    }
    rows.push({
      asset_symbol: sym,
      entry_zone: j.entry_zone ?? `≈ ${price}`,
      stop_loss: Number(stop.toFixed(8)),
      take_profit: Number(tp.toFixed(8)),
      position_size_pct: clamp(Number(j.position_size_pct) || 0, 0, cfg.max_position_pct),
      confidence: clamp(Number(j.confidence) || 0, 0, 1),
      rationale: j.rationale ?? null,
      counterpoints: j.counterpoints ?? null,
      sonar_score: cand.sonar_score,
      components_json: cand.components_json,
      status: "proposed",
      origin: "claude",
      model,
      created_at: now,
    });
  }

  let dbError: string | null = null;
  if (rows.length) {
    const { error } = await db.from("proposals").insert(rows);
    if (error) dbError = error.message;
  }

  return Response.json({
    ok: dbError == null,
    enabled: true,
    ms: Date.now() - started,
    model,
    candidates: leaders.map((r) => r.asset_symbol),
    proposals: rows.length,
    noTrade,
    skipped,
    dbError,
  }, { status: dbError == null ? 200 : 500 });
});
