// Sonar — klines: holt OHLCV-Kerzen (kostenlos, keyless) und schreibt sie in
// public.klines. Dient der Chartanzeige und später dem Backtest (Spec §13).
//
// Primärquelle Binance, Fallback Bybit (falls Binance Cloud-IPs blockt).
// Aufruf: /klines?interval=1h&limit=96  — idempotent per Upsert auf PK.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "BONKUSDT"];

// Bybit nutzt andere Intervall-Codes als Binance.
const BYBIT_INTERVAL: Record<string, string> = {
  "15m": "15", "1h": "60", "4h": "240", "1d": "D",
};

interface Candle {
  open_time: string;
  open: number; high: number; low: number; close: number; volume: number;
}

async function fromBinance(sym: string, interval: string, limit: number): Promise<Candle[]> {
  const res = await fetch(
    `https://api.binance.com/api/v3/klines?symbol=${sym}&interval=${interval}&limit=${limit}`,
  );
  if (!res.ok) throw new Error(`binance HTTP ${res.status}`);
  const raw: unknown[][] = await res.json();
  return raw.map((k) => ({
    open_time: new Date(k[0] as number).toISOString(),
    open: parseFloat(k[1] as string), high: parseFloat(k[2] as string),
    low: parseFloat(k[3] as string), close: parseFloat(k[4] as string),
    volume: parseFloat(k[5] as string),
  }));
}

async function fromBybit(sym: string, interval: string, limit: number): Promise<Candle[]> {
  const iv = BYBIT_INTERVAL[interval];
  if (!iv) throw new Error(`bybit: Intervall ${interval} nicht gemappt`);
  const res = await fetch(
    `https://api.bybit.com/v5/market/kline?category=spot&symbol=${sym}&interval=${iv}&limit=${limit}`,
  );
  if (!res.ok) throw new Error(`bybit HTTP ${res.status}`);
  const json = await res.json();
  if (json.retCode !== 0) throw new Error(`bybit retCode ${json.retCode}`);
  // Bybit liefert neueste zuerst — umdrehen.
  return (json.result?.list ?? []).reverse().map((k: string[]) => ({
    open_time: new Date(parseInt(k[0])).toISOString(),
    open: parseFloat(k[1]), high: parseFloat(k[2]),
    low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5]),
  }));
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const interval = url.searchParams.get("interval") ?? "1h";
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "96", 10) || 96, 500);

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const errors: Record<string, string> = {};
  const counts: Record<string, number> = {};

  for (const sym of SYMBOLS) {
    try {
      let candles: Candle[];
      let source = "binance";
      try {
        candles = await fromBinance(sym, interval, limit);
      } catch (_e) {
        source = "bybit";
        candles = await fromBybit(sym, interval, limit);
      }
      const short = sym.replace("USDT", "");
      const rows = candles.map((c) => ({ symbol: short, interval, ...c }));
      const { error } = await db.from("klines")
        .upsert(rows, { onConflict: "symbol,interval,open_time" });
      if (error) throw new Error(error.message);
      counts[`${short}:${source}`] = rows.length;
    } catch (e) {
      errors[sym] = e instanceof Error ? e.message : String(e);
    }
  }

  return Response.json({
    ok: Object.keys(errors).length === 0,
    interval, limit, counts, errors,
  });
});
