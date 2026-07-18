// Quelle: ApeWisdom (keyless) — Reddit-Erwähnungen + Ranking, für Krypto UND
// Aktien. FÜLLT DIE ENTSCHEIDENDE `mentions`-SPALTE und liefert mentions_delta
// (24h vs. Vortag) — damit werden MentionsMomentum & VolumeConfirmation
// (Spec §5) überhaupt erst berechenbar.
// Endpoint: /api/v1.0/filter/{filter}/page/1

import { fetchJson, toNumber } from "../lib/http.ts";
import type { AdapterResult, AssetType, SignalRow, SourceAdapter } from "../lib/types.ts";

interface ApeResult {
  ticker?: string;
  mentions?: number | string;
  mentions_24h_ago?: number | string;
  upvotes?: number | string;
}

interface ApeResponse {
  results?: ApeResult[];
}

// filter -> asset_type
const FILTERS: Array<{ filter: string; type: AssetType }> = [
  { filter: "all-crypto", type: "crypto" },
  { filter: "all-stocks", type: "stock" },
];

export const apewisdom: SourceAdapter = {
  name: "apewisdom",
  async run(ctx): Promise<AdapterResult> {
    const capturedAt = ctx.now.toISOString();
    const signals: SignalRow[] = [];

    for (const { filter, type } of FILTERS) {
      const json = await fetchJson<ApeResponse>(
        `https://apewisdom.io/api/v1.0/filter/${filter}/page/1`,
      );
      for (const r of json.results ?? []) {
        if (!r.ticker) continue;
        const mentions = toNumber(r.mentions);
        const prev = toNumber(r.mentions_24h_ago);
        signals.push({
          asset_symbol: String(r.ticker).toUpperCase(),
          asset_type: type,
          source: "apewisdom",
          mentions,
          mentions_delta: mentions !== null && prev !== null ? mentions - prev : null,
          captured_at: capturedAt,
        });
      }
    }

    return { signals };
  },
};
