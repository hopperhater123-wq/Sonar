// LLM-Sentiment — optionale 2. Quelle. Nutzt Claude (Anthropic API) als kontextsensitiven
// Klassifikator: versteht Sarkasmus/Slang deutlich besser als das Lexikon, kostet aber
// API-Calls. Deshalb per Env zuschaltbar (SENTIMENT_LLM_ENABLED) und auf Haiku (guenstig)
// plus harte Batch-Grenzen. Kein I/O ausser dem einen fetch — Aufruf bleibt bewusst schlank.

export interface SymbolTexts {
  symbol: string;
  texts: string[];
}

export interface LlmConfig {
  model?: string;
  maxSymbols?: number;
  maxTextsPerSymbol?: number;
  maxTokens?: number;
}

function buildPrompt(items: SymbolTexts[]): string {
  const bundles = items
    .map((it) => `${it.symbol}:\n${it.texts.map((t) => `  - ${t.replace(/\n/g, " ")}`).join("\n")}`)
    .join("\n\n");
  return [
    "Du bist ein Krypto-Sentiment-Klassifikator. Unten stehen Social-Media-/News-Titel je Ticker.",
    "Bewerte je Ticker die aggregierte Handels-Stimmung als Zahl zwischen -1 (stark bearish)",
    "und +1 (stark bullish), 0 = neutral/gemischt. Beachte Slang, Ironie und Sarkasmus",
    '(z.B. "exit liquidity", "pump and dump" sind bearish).',
    "",
    "Antworte AUSSCHLIESSLICH mit einem JSON-Objekt {TICKER: zahl}, ohne Markdown, ohne Text.",
    "",
    bundles,
  ].join("\n");
}

function parseScores(text: string): Record<string, number> {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return {};
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return {}; // kaputte Antwort => LLM-Sentiment fuer diesen Lauf einfach auslassen
  }
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj)) {
    const n = Number(v);
    if (Number.isFinite(n)) out[k.toUpperCase()] = Math.max(-1, Math.min(1, n));
  }
  return out;
}

export async function classifyBatch(
  items: SymbolTexts[],
  apiKey: string,
  cfg: LlmConfig = {},
): Promise<Record<string, number>> {
  const model = cfg.model ?? "claude-haiku-4-5-20251001";
  const maxSymbols = cfg.maxSymbols ?? 40;
  const maxTexts = cfg.maxTextsPerSymbol ?? 8;

  const trimmed = items
    .slice(0, maxSymbols)
    .map((it) => ({ symbol: it.symbol, texts: it.texts.slice(0, maxTexts) }))
    .filter((it) => it.texts.length > 0);
  if (trimmed.length === 0) return {};

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: cfg.maxTokens ?? 1024,
      messages: [{ role: "user", content: buildPrompt(trimmed) }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const text = (data.content ?? [])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("");
  return parseScores(text);
}
