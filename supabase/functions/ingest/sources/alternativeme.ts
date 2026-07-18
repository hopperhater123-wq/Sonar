// Quelle: Alternative.me (keyless) — Crypto Fear & Greed Index (0..100).
// Der "Gesamtfilter über allem" (Spec §5): kein aggressives Long bei
// Extreme Greed. Schreibt in market_context, nicht in signals.
// Endpoint: /fng/

import { fetchJson, toNumber } from "../lib/http.ts";
import type { AdapterResult, MarketContextRow, SourceAdapter } from "../lib/types.ts";

interface FngResponse {
  data?: Array<{
    value?: string | number;
    value_classification?: string;
    timestamp?: string | number;
  }>;
}

export const alternativeme: SourceAdapter = {
  name: "alternativeme",
  async run(ctx): Promise<AdapterResult> {
    const json = await fetchJson<FngResponse>("https://api.alternative.me/fng/");
    const latest = json.data?.[0];
    const value = toNumber(latest?.value);
    if (value === null) return { marketContext: [] };

    // timestamp ist Unix-Sekunden; fällt es weg, nehmen wir jetzt.
    const ts = toNumber(latest?.timestamp);
    const capturedAt = ts !== null ? new Date(ts * 1000).toISOString() : ctx.now.toISOString();

    const row: MarketContextRow = {
      metric: "fear_greed",
      value,
      classification: latest?.value_classification ?? null,
      source: "alternative.me",
      captured_at: capturedAt,
    };
    return { marketContext: [row] };
  },
};
