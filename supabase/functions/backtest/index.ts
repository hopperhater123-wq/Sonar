// Sonar — backtest: simuliert einen Vorschlag (Einstieg/Stop/TP) mit Hebel
// ueber die vorhandenen klines (Spec §13). On-demand, KEIN Cron.
//
// Warum Edge Function statt SQL-Funktion: der Kerzenpfad-Sweep mit Zustands-
// maschine (Entry-Zone, Liquidation vor Stop, Re-Entry) ist in TS klar und
// testbar — als plpgsql wuerde er unlesbar. Die Engine (lib/sim.ts) bleibt pure.
//
// verify_jwt=true: Aufruf braucht ein JWT (Dashboard-Session oder anon-Key als
// Bearer) — sonst koennte jede fremde Anfrage Junk-Zeilen in backtests erzeugen.
//
// Aufruf:  POST /functions/v1/backtest  Body: { proposal_id, leverage?, interval? }
//
// ⚠️ Ein Backtest ist KEINE Vorhersage — steht auch im Output.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { type Candle, liquidationPrice, maxViableLeverage, simulate, splitCandles } from "./lib/sim.ts";

const LIQ_BUFFER = 0.95;
const DEFAULT_FEE_PCT = 0.05;
const HINT = "⚠️ Backtest ≠ Vorhersage: zeigt nur, wie sich die Mechanik in der Vergangenheit verhalten haette.";

interface ProposalRow {
  id: number;
  asset_symbol: string;
  entry_zone: string | null;
  stop_loss: number | null;
  take_profit: number | null;
}

function parseEntryZone(zone: string | null, fallback: number): { low: number; high: number } {
  const nums = (zone?.match(/\d+(?:\.\d+)?(?:e-?\d+)?/gi) ?? [])
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);
  if (nums.length >= 2) return { low: Math.min(nums[0], nums[1]), high: Math.max(nums[0], nums[1]) };
  if (nums.length === 1) return { low: nums[0], high: nums[0] };
  return { low: fallback, high: fallback };
}

Deno.serve(async (req) => {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // leer erlaubt — dann fehlt proposal_id und wir antworten unten sauber
  }
  const proposalId = Number(body.proposal_id);
  const leverage = Math.max(1, Math.min(100, Number(body.leverage) || 1));
  const interval = typeof body.interval === "string" ? body.interval : "1h";
  const feePct = Number(body.fee_pct) || DEFAULT_FEE_PCT;

  if (!Number.isFinite(proposalId)) {
    return Response.json({ ok: false, error: "proposal_id fehlt" }, { status: 400 });
  }

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: prop, error: propErr } = await db
    .from("proposals")
    .select("id, asset_symbol, entry_zone, stop_loss, take_profit")
    .eq("id", proposalId)
    .maybeSingle<ProposalRow>();
  if (propErr) return Response.json({ ok: false, error: propErr.message }, { status: 500 });
  if (!prop) return Response.json({ ok: false, error: `Proposal ${proposalId} nicht gefunden` }, { status: 404 });
  if (prop.stop_loss == null || prop.take_profit == null) {
    return Response.json({ ok: false, error: "Proposal hat keinen Stop/TP" }, { status: 422 });
  }

  const { data: rows, error: klErr } = await db
    .from("klines")
    .select("open_time, open, high, low, close")
    .eq("symbol", prop.asset_symbol)
    .eq("interval", interval)
    .order("open_time", { ascending: true })
    .limit(1000);
  if (klErr) return Response.json({ ok: false, error: klErr.message }, { status: 500 });

  const candles: Candle[] = (rows ?? []).map((k) => ({
    t: new Date(k.open_time as string).getTime(),
    o: k.open as number,
    h: k.high as number,
    l: k.low as number,
    c: k.close as number,
  }));
  if (candles.length < 40) {
    return Response.json({
      ok: false,
      error: `Nur ${candles.length} ${interval}-Kerzen fuer ${prop.asset_symbol} — zu wenig. Chart-Symbole (BTC/ETH/SOL/XRP/BONK/BCH) haben Historie.`,
    }, { status: 422 });
  }

  const fallbackEntry = candles[candles.length - 1].c;
  const zone = parseEntryZone(prop.entry_zone, fallbackEntry);
  const entryMid = (zone.low + zone.high) / 2;

  const params = {
    entryLow: zone.low,
    entryHigh: zone.high,
    stop: prop.stop_loss,
    tp: prop.take_profit,
    leverage,
    feePct,
    liqBufferPct: LIQ_BUFFER,
  };

  const { train, test } = splitCandles(candles, 0.6);
  const trainResult = simulate(train, params);
  const testResult = simulate(test, params);
  const maxLev = maxViableLeverage(entryMid, prop.stop_loss, LIQ_BUFFER);
  const liqPrice = Number(liquidationPrice(entryMid, leverage, LIQ_BUFFER).toFixed(8));

  const iso = (t: number) => new Date(t).toISOString();
  const { error: insErr } = await db.from("backtests").insert({
    proposal_id: prop.id,
    asset_symbol: prop.asset_symbol,
    interval,
    leverage,
    train_from: iso(train[0].t),
    train_to: iso(train[train.length - 1].t),
    test_from: iso(test[0].t),
    test_to: iso(test[test.length - 1].t),
    params: { ...params, liquidation_price: liqPrice },
    result: { train: trainResult, test: testResult, max_viable_leverage: maxLev },
  });

  return Response.json({
    ok: insErr == null,
    symbol: prop.asset_symbol,
    interval,
    leverage,
    liquidation_price: liqPrice,
    max_viable_leverage: maxLev,
    // Test ist die ehrliche Zahl (ungesehener Zeitraum); Train nur zur Einordnung.
    train: trainResult,
    test: testResult,
    hint: HINT,
    dbError: insErr?.message ?? null,
  }, { status: insErr == null ? 200 : 500 });
});
