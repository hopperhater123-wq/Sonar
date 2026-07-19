// Lexikon-Sentiment — Basis-Layer der Sentiment-Schicht. Pure, deterministisch, keyless.
// Rechnet aus einem Text (News-/Post-Titel) eine Polaritaet (-1..+1) und extrahiert
// erwaehnte Ticker. Bewusst simpel (Bag-of-Words + Negation + Emojis) — versteht keinen
// Sarkasmus, dafuer gratis und sofort testbar. Der LLM-Layer (lib/llm.ts) ergaenzt optional.

const BULLISH: Record<string, number> = {
  moon: 1.5, mooning: 1.5, bull: 1, bullish: 2, pump: 1.5, pumping: 1.5, buy: 1, buying: 1,
  long: 1, breakout: 1.5, ath: 1.5, rally: 1.5, surge: 1.5, gem: 1.5, undervalued: 1.5,
  accumulate: 1, hodl: 1, lfg: 1.5, send: 1, sending: 1, green: 1, rocket: 1.5, parabolic: 2,
  support: 0.5, bounce: 1, wagmi: 1.5, loaded: 1, ape: 1, aped: 1, up: 0.5, gains: 1.5,
  strong: 1, rip: 1, ripping: 1.5, higher: 1, "10x": 2, "100x": 2, based: 1, alpha: 1,
};

const BEARISH: Record<string, number> = {
  dump: -1.5, dumping: -1.5, bear: -1, bearish: -2, sell: -1, selling: -1, short: -1,
  crash: -2, rug: -2, rugpull: -2, scam: -2, dead: -1.5, rekt: -1.5, red: -1, capitulate: -1.5,
  capitulation: -1.5, bagholder: -1.5, overvalued: -1.5, bleeding: -1.5, tank: -1.5, tanking: -1.5,
  ngmi: -1.5, exit: -1, avoid: -1.5, ponzi: -2, honeypot: -2, down: -0.5, drop: -1, dropping: -1,
  resistance: -0.5, weak: -1, fud: -0.5, lower: -1, worthless: -2, fail: -1.5, failed: -1.5,
};

// Mehrwort-Phrasen (werden im Rohtext gesucht).
const PHRASES: Record<string, number> = {
  "diamond hands": 1.5, "paper hands": -1, "bull trap": -1.5, "bull run": 2,
  "to the moon": 2, "buy the dip": 1.5, "dead cat": -1.5, "exit liquidity": -2,
  "all time high": 1.5, "buy signal": 1.5, "sell signal": -1.5, "pump and dump": -2,
};

const EMOJI: Record<string, number> = {
  "🚀": 2, "🌙": 1.5, "📈": 1.5, "🟢": 1, "💎": 1.5, "🙌": 1, "🐂": 1.5, "🔥": 1, "✅": 1,
  "📉": -1.5, "🔴": -1, "🩸": -1.5, "💀": -1.5, "🐻": -1.5, "❌": -1,
};

const NEGATIONS = new Set(["not", "no", "dont", "isnt", "aint", "never", "cant", "wont"]);
const INTENSIFIERS = new Set(["very", "super", "massive", "massively", "huge", "insanely", "extremely"]);

// Englische Woerter/Kuerzel, die als Ticker kollidieren wuerden (Praezisions-Guard).
// Datenbefunde 19.07. aus echten Laeufen: LONG (Trading-Wort), dann nach der
// LLM-Entkopplung ETF/FTX/CORE/BET/BANK/HYPE/GPT — News-Woerter, die Low-Cap-
// Symbole trafen ("Bitcoin ETF approved" ist kein Signal fuer den ETF-Token).
// Per $CASHTAG bleiben alle diese Symbole weiterhin erreichbar.
const STOP = new Set([
  "ALL", "FOR", "ARE", "THE", "AND", "YOU", "GET", "NOW", "NEW", "ONE", "OUT", "BUY", "CAN",
  "HAS", "HAD", "WAS", "WHO", "WHY", "HOW", "ANY", "USE", "SEE", "OWN", "TOP", "LOW", "BIG",
  "ITS", "NOT", "BUT", "DIP", "ATH", "GEM", "APE", "FUD", "WEN", "LONG",
  "ETF", "FTX", "CORE", "BET", "BANK", "HYPE", "GPT",
]);

export interface TextSentiment {
  score: number; // -1..+1
  hits: number; // Anzahl gewerteter Tokens/Emojis/Phrasen
}

export function analyzeText(text: string): TextSentiment {
  const lower = text.toLowerCase();
  let sum = 0;
  let hits = 0;

  // Phrasen zuerst (Rohtext).
  for (const [phrase, w] of Object.entries(PHRASES)) {
    if (lower.includes(phrase)) {
      sum += w;
      hits++;
    }
  }

  // Emojis.
  for (const ch of Array.from(text)) {
    const w = EMOJI[ch];
    if (w != null) {
      sum += w;
      hits++;
    }
  }

  // Woerter mit Negations-/Intensitaets-Fenster.
  const tokens = lower.split(/[^a-z0-9']+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const base = BULLISH[t] ?? BEARISH[t];
    if (base == null) continue;
    let w = base;
    // Blick auf die 2 vorherigen Tokens fuer Negation/Intensitaet.
    for (let j = Math.max(0, i - 2); j < i; j++) {
      if (NEGATIONS.has(tokens[j])) w = -w;
      if (INTENSIFIERS.has(tokens[j])) w *= 1.5;
    }
    sum += w;
    hits++;
  }

  if (hits === 0) return { score: 0, hits: 0 };
  // Normalisieren: mittleres Gewicht je Treffer, auf -1..+1 gestaucht.
  const score = Math.max(-1, Math.min(1, sum / (hits * 1.5)));
  return { score, hits };
}

// Extrahiert Ticker aus einem Text: $CASHTAGS immer, blanke bekannte Symbole nur mit
// Wortgrenze, Laenge >= 3 und nicht im Stopwort-Set (gegen Falschtreffer wie "ALL").
export function extractTickers(text: string, known: Set<string>): string[] {
  const out = new Set<string>();

  for (const m of text.matchAll(/\$([A-Za-z]{2,10})\b/g)) {
    out.add(m[1].toUpperCase());
  }

  const upper = text.toUpperCase();
  for (const sym of known) {
    if (sym.length < 3 || STOP.has(sym)) continue;
    const esc = sym.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${esc}\\b`).test(upper)) out.add(sym);
  }

  return [...out];
}
