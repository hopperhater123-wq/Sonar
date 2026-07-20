// Sonar — news-digest: Claude fasst die aktuellen Schlagzeilen zusammen, zieht
// ein Fazit und ordnet sie mit Bezug zu Fear&Greed + Top-Signalen ein.
// On-demand (Button im Dashboard), KEIN Cron. CORS + OPTIONS von Anfang an
// (Lektion aus dem backtest-Button). verify_jwt=true. Dormant ohne ANTHROPIC_API_KEY.
//
// ⚠️ Einordnung, kein Finanzrat — steht im Prompt und im Output.

import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: CORS });

const LOOKBACK_HOURS = 36;
const MAX_HEADLINES = 40;

interface Digest {
  summary: string;
  sentiment: "bullish" | "bearish" | "neutral" | "mixed";
  themes: string[];
  fazit: string;
  analysis: string;
}

function parse(text: string): Digest | null {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const s = cleaned.indexOf("{");
  const e = cleaned.lastIndexOf("}");
  if (s === -1 || e === -1) return null;
  try {
    const o = JSON.parse(cleaned.slice(s, e + 1));
    return {
      summary: String(o.summary ?? ""),
      sentiment: ["bullish", "bearish", "neutral", "mixed"].includes(o.sentiment) ? o.sentiment : "mixed",
      themes: Array.isArray(o.themes) ? o.themes.map(String).slice(0, 6) : [],
      fazit: String(o.fazit ?? ""),
      analysis: String(o.analysis ?? ""),
    };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return json({ ok: false, error: "Kein ANTHROPIC_API_KEY gesetzt — News-Analyse ist dormant." }, 200);
  }
  const model = Deno.env.get("NEWS_MODEL") ?? "claude-sonnet-5";

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const since = new Date(Date.now() - LOOKBACK_HOURS * 3_600_000).toISOString();
  const [newsRes, fgRes, lbRes] = await Promise.all([
    db.from("news").select("title, source, published_at").gte("captured_at", since)
      .order("published_at", { ascending: false }).limit(MAX_HEADLINES),
    db.from("market_context").select("value, classification").eq("metric", "fear_greed")
      .order("captured_at", { ascending: false }).limit(1),
    db.from("sonar_leaderboard").select("asset_symbol, sonar_score").limit(6),
  ]);
  const loadErr = newsRes.error ?? fgRes.error ?? lbRes.error;
  if (loadErr) return json({ ok: false, error: loadErr.message }, 500);

  const headlines = (newsRes.data ?? []) as { title: string; source: string }[];
  if (headlines.length === 0) {
    return json({ ok: false, error: "Keine aktuellen Schlagzeilen im Zeitfenster." }, 200);
  }
  const fg = (fgRes.data as { value: number; classification: string | null }[] | null)?.[0];
  const top = (lbRes.data as { asset_symbol: string; sonar_score: number }[] | null) ?? [];

  const prompt = [
    "Du bist Markt-Analyst fuer ein PRIVATES Krypto-Signal-Tool (Eigengebrauch, keine Anlageberatung).",
    "Unten die aktuellen Krypto-Schlagzeilen der letzten ~36h, plus Marktkontext.",
    "",
    `Marktumfeld: Fear & Greed = ${fg?.value ?? "unbekannt"} (${fg?.classification ?? "?"}).`,
    `Top-Signale im Tool gerade: ${top.map((t) => `${t.asset_symbol} ${t.sonar_score.toFixed(2)}`).join(", ") || "—"}.`,
    "",
    "Schlagzeilen:",
    ...headlines.map((h, i) => `${i + 1}. [${h.source}] ${h.title}`),
    "",
    "Antworte AUSSCHLIESSLICH als JSON (deutsch, keine Anlageberatung, sachlich):",
    "{",
    '  "summary": "2-3 Saetze: was ist die Nachrichtenlage",',
    '  "sentiment": "bullish|bearish|neutral|mixed",',
    '  "themes": ["3-5 kurze Schlagworte der dominierenden Themen"],',
    '  "fazit": "1-2 Saetze Kernaussage",',
    '  "analysis": "3-5 Saetze Einordnung: wie passt die Nachrichtenlage zu Fear&Greed und den Top-Signalen; nenne Chancen UND Risiken; kein Finanzrat"',
    "}",
  ].join("\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: 1024, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) return json({ ok: false, error: `Anthropic ${res.status}: ${await res.text()}` }, 502);

  const data = await res.json();
  const text = (data.content ?? [])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("");
  const digest = parse(text);
  if (!digest) return json({ ok: false, error: "Antwort konnte nicht gelesen werden." }, 502);

  return json({
    ok: true,
    model,
    headlines: headlines.length,
    fearGreed: fg?.value ?? null,
    digest,
    hint: "Einordnung, kein Finanzrat — du entscheidest.",
  });
});
