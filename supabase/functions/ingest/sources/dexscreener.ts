// Quelle: DexScreener (keyless) — geboostete Frühphase-Token + Liquidität.
// Zweiteilig: erst die Boost-Liste, dann je Token die Pair-Daten
// (Preis/Volumen/Liquidität). BEST-EFFORT — Feldnamen im ersten echten Lauf
// verifizieren. Fehler pro Token isoliert, damit einer nicht alles killt.
// Endpoints: /token-boosts/latest/v1 , /latest/dex/tokens/{address}

import { fetchJson, toNumber } from "../lib/http.ts";
import type { AdapterResult, SignalRow, SourceAdapter } from "../lib/types.ts";

interface Boost {
  chainId?: string;
  tokenAddress?: string;
}

interface Pair {
  baseToken?: { symbol?: string; name?: string };
  priceUsd?: string | number;
  volume?: { h24?: number };
  liquidity?: { usd?: number };
  priceChange?: { h24?: number };
}

const MAX_TOKENS = 8; // Rate-Limit schonen

export const dexscreener: SourceAdapter = {
  name: "dexscreener",
  async run(ctx): Promise<AdapterResult> {
    const capturedAt = ctx.now.toISOString();
    const boosts = await fetchJson<Boost[]>(
      "https://api.dexscreener.com/token-boosts/latest/v1",
    );

    const addresses = boosts
      .filter((b) => b.tokenAddress)
      .slice(0, MAX_TOKENS)
      .map((b) => b.tokenAddress as string);

    const signals: SignalRow[] = [];
    for (const addr of addresses) {
      try {
        const res = await fetchJson<{ pairs?: Pair[] }>(
          `https://api.dexscreener.com/latest/dex/tokens/${addr}`,
        );
        // Liquideste Pair als Repräsentant des Tokens wählen.
        const pair = (res.pairs ?? []).sort(
          (a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0),
        )[0];
        const symbol = pair?.baseToken?.symbol;
        if (!pair || !symbol) continue;

        signals.push({
          asset_symbol: String(symbol).toUpperCase(),
          asset_type: "crypto",
          source: "dexscreener",
          price: toNumber(pair.priceUsd),
          volume_24h: toNumber(pair.volume?.h24),
          price_change_24h: toNumber(pair.priceChange?.h24),
          captured_at: capturedAt,
        });
      } catch (_err) {
        // Einzelnen Token überspringen — best-effort.
        continue;
      }
    }

    return { signals };
  },
};
