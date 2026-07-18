// Quelle: Coinpaprika (komplett keyless, 1.000 req/Tag) — Top-50 nach Rang
// mit Preis/Volumen. Dient als Cross-Check / Fallback zu CoinGecko.
// Endpoint: /v1/tickers  (Spec §4)

import { fetchJson, toNumber } from "../lib/http.ts";
import type { AdapterResult, SignalRow, SourceAdapter } from "../lib/types.ts";

interface Ticker {
  symbol?: string;
  rank?: number;
  quotes?: { USD?: { price?: number; volume_24h?: number; percent_change_24h?: number } };
}

const TOP_N = 50;

export const coinpaprika: SourceAdapter = {
  name: "coinpaprika",
  async run(ctx): Promise<AdapterResult> {
    const capturedAt = ctx.now.toISOString();
    // Antwort ist groß (alle Coins) — wir nehmen nur die Top-N nach Rang.
    const tickers = await fetchJson<Ticker[]>("https://api.coinpaprika.com/v1/tickers", {
      timeoutMs: 25_000,
    });

    const signals: SignalRow[] = tickers
      .filter((t) => typeof t.rank === "number" && t.rank > 0 && t.rank <= TOP_N && t.symbol)
      .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
      .map((t) => ({
        asset_symbol: String(t.symbol).toUpperCase(),
        asset_type: "crypto" as const,
        source: "coinpaprika",
        price: toNumber(t.quotes?.USD?.price),
        volume_24h: toNumber(t.quotes?.USD?.volume_24h),
        price_change_24h: toNumber(t.quotes?.USD?.percent_change_24h),
        captured_at: capturedAt,
      }));

    return { signals };
  },
};
