// Quelle: CoinGecko (Demo, keyless) — Trending-Coins mit Preis/Volumen.
// Liefert Preis-/Volumen-Signale für die gerade "heißen" Coins.
// Endpoint: /api/v3/search/trending  (Spec §4, keyless ~100/min)

import { fetchJson, toNumber } from "../lib/http.ts";
import type { AdapterResult, SignalRow, SourceAdapter } from "../lib/types.ts";

interface TrendingResponse {
  coins?: Array<{
    item?: {
      symbol?: string;
      name?: string;
      market_cap_rank?: number;
      data?: {
        price?: number | string;
        total_volume?: number | string;
        price_change_percentage_24h?: { usd?: number };
      };
    };
  }>;
}

export const coingecko: SourceAdapter = {
  name: "coingecko",
  async run(ctx): Promise<AdapterResult> {
    const capturedAt = ctx.now.toISOString();
    const json = await fetchJson<TrendingResponse>(
      "https://api.coingecko.com/api/v3/search/trending",
    );

    const signals: SignalRow[] = (json.coins ?? [])
      .map((c) => c.item)
      .filter((it): it is NonNullable<typeof it> => Boolean(it?.symbol))
      .map((it) => ({
        asset_symbol: String(it.symbol).toUpperCase(),
        asset_type: "crypto" as const,
        source: "coingecko",
        price: toNumber(it.data?.price),
        volume_24h: toNumber(it.data?.total_volume),
        price_change_24h: toNumber(it.data?.price_change_percentage_24h?.usd),
        captured_at: capturedAt,
      }));

    return { signals };
  },
};
