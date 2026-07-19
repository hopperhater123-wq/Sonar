// Proposal-Simulation — pure, kein I/O. Simuliert eine Long-Strategie
// (Einstiegszone / Stop-Loss / Take-Profit) MIT HEBEL ueber historische Kerzen.
//
// Kern-Ideen aus dem Grid-Backtest der Chat-Session uebernommen: konservativer
// Kerzenpfad (gruene Kerze o->l->h->c, rote o->h->l->c), Fees pro Seite,
// Max-Drawdown auf der Equity-Kurve, Buy&Hold-Vergleich, splitCandles
// (Train/Test-Pflicht aus Spec §13). Die Grid-Mechanik wurde ersetzt.
//
// HEBEL, ehrlich gerechnet:
//  * Liquidation (vereinfacht, konservativ): Long wird liquidiert, wenn der
//    Preis um liqBufferPct * (1/Hebel) unter den Einstieg faellt. Der Buffer
//    (< 1) bildet Maintenance-Margin/Fees grob ab — echte Boersen liquidieren
//    frueher als die Theorie.
//  * Liegt der Stop UNTER der Liquidation, greift der Stop nie: die Position
//    stirbt vorher. Genau dieser Fall wird simuliert und gewarnt.
//  * PnL je Trade = Preisbewegung x Hebel - Fees (auf Notional, also x Hebel);
//    Liquidation = -100 % des Einsatzes.
//
// ⚠️ Ein Backtest ist KEINE Vorhersage. Er zeigt nur, wie sich die Mechanik in
// der Vergangenheit verhalten haette — Overfitting-Gefahr ist real.

export interface Candle {
  t: number; // ms
  o: number;
  h: number;
  l: number;
  c: number;
}

export interface TradeParams {
  entryLow: number;
  entryHigh: number;
  stop: number;
  tp: number;
  leverage: number; // 1..100
  feePct: number; // pro Seite auf Notional, z.B. 0.05
  liqBufferPct: number; // Anteil der theoretischen Liq-Distanz, z.B. 0.95
}

export interface SimOutcome {
  candles: number;
  trades: number;
  wins: number;
  losses: number;
  liquidations: number;
  openAtEnd: boolean;
  hitRatePct: number | null;
  pnlPct: number; // kumuliert, fixer Einsatz (Margin=100) je Trade
  buyHoldPct: number; // ungehebelt, zum Vergleich
  maxDrawdownPct: number;
  warnings: string[];
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const r2 = (x: number) => Number(x.toFixed(2));

// Ab welchem Hebel wuerde die Liquidation vor dem Stop greifen?
export function maxViableLeverage(entryMid: number, stop: number, liqBufferPct: number): number {
  const stopDist = (entryMid - stop) / entryMid;
  if (!Number.isFinite(stopDist) || stopDist <= 0) return 1;
  return clamp(Math.floor(liqBufferPct / stopDist), 1, 100);
}

export function liquidationPrice(entry: number, leverage: number, liqBufferPct: number): number {
  return entry * (1 - liqBufferPct / leverage);
}

export function simulate(candles: Candle[], p: TradeParams): SimOutcome {
  const warnings: string[] = [];
  const lev = clamp(p.leverage, 1, 100);
  const feeRoundTripPct = p.feePct * 2 * lev; // %-Punkte auf den Einsatz (Margin)

  if (candles.length < 20) {
    return {
      candles: candles.length, trades: 0, wins: 0, losses: 0, liquidations: 0,
      openAtEnd: false, hitRatePct: null, pnlPct: 0, buyHoldPct: 0, maxDrawdownPct: 0,
      warnings: ["Zu wenige Kerzen fuer eine aussagekraeftige Simulation."],
    };
  }

  const entryMid = (p.entryLow + p.entryHigh) / 2;
  const maxLev = maxViableLeverage(entryMid, p.stop, p.liqBufferPct);
  if (lev > maxLev) {
    warnings.push(
      `Bei ${lev}x liegt die Liquidation VOR dem Stop-Loss — der Stop greift nie. ` +
        `Max. sinnvoller Hebel fuer dieses Setup: ~${maxLev}x.`,
    );
  }

  let equity = 100;
  let peak = 100;
  let maxDd = 0;
  let inPos = false;
  let entry = 0;
  let exitDown = 0;
  let exitIsLiq = false;
  let trades = 0;
  let wins = 0;
  let losses = 0;
  let liqs = 0;

  const enter = (price: number) => {
    inPos = true;
    entry = price;
    const liq = liquidationPrice(entry, lev, p.liqBufferPct);
    exitDown = Math.max(p.stop, liq);
    exitIsLiq = liq >= p.stop;
  };

  const closeTrade = (exitPrice: number, kind: "tp" | "stop" | "liq") => {
    let pnl: number;
    if (kind === "liq") {
      pnl = -100; // Einsatz weg
    } else {
      pnl = ((exitPrice - entry) / entry) * 100 * lev - feeRoundTripPct;
      pnl = Math.max(pnl, -100);
    }
    equity += pnl;
    trades++;
    if (kind === "tp") wins++;
    else {
      losses++;
      if (kind === "liq") liqs++;
    }
    inPos = false;
  };

  for (const k of candles) {
    const segments: [number, number][] =
      k.c >= k.o ? [[k.o, k.l], [k.l, k.h], [k.h, k.c]] : [[k.o, k.h], [k.h, k.l], [k.l, k.c]];

    for (const [a, b] of segments) {
      if (!inPos) {
        // Limit-Kauf in der Einstiegszone.
        if (a >= p.entryLow && a <= p.entryHigh) {
          enter(a); // Segment beginnt in der Zone
        } else if (b < a && b <= p.entryHigh && a > p.entryHigh) {
          enter(p.entryHigh); // faellt von oben in die Zone
        } else if (b > a && a < p.entryLow && b >= p.entryLow) {
          enter(p.entryLow); // steigt von unten in die Zone
        }
      }
      if (inPos) {
        if (b < a) {
          if (exitDown <= a && exitDown >= b) {
            closeTrade(exitDown, exitIsLiq ? "liq" : "stop");
          }
        } else if (b > a) {
          if (p.tp >= a && p.tp <= b) {
            closeTrade(p.tp, "tp");
          }
        }
      }
    }

    // Mark-to-market fuer die Drawdown-Kurve.
    const mtm = inPos ? ((k.c - entry) / entry) * 100 * lev : 0;
    const eq = Math.max(0, equity + mtm);
    if (eq > peak) peak = eq;
    if (peak > 0) maxDd = Math.max(maxDd, ((peak - eq) / peak) * 100);
  }

  const last = candles[candles.length - 1];
  const openAtEnd = inPos;
  const finalEquity = Math.max(0, equity + (inPos ? ((last.c - entry) / entry) * 100 * lev : 0));
  const pnlPct = finalEquity - 100;
  const buyHoldPct = (last.c / candles[0].o - 1) * 100;
  const hitRatePct = trades > 0 ? (wins / trades) * 100 : null;

  if (trades === 0 && !openAtEnd) {
    warnings.push("Einstiegszone wurde im Zeitraum nie erreicht — kein Trade simuliert.");
  }
  if (openAtEnd) {
    warnings.push("Position am Ende noch offen — zum letzten Schlusskurs bewertet.");
  }

  return {
    candles: candles.length,
    trades,
    wins,
    losses,
    liquidations: liqs,
    openAtEnd,
    hitRatePct: hitRatePct == null ? null : r2(hitRatePct),
    pnlPct: r2(pnlPct),
    buyHoldPct: r2(buyHoldPct),
    maxDrawdownPct: r2(maxDd),
    warnings,
  };
}

// Pflicht aus der Spec (§13): Regeln auf einem Zeitraum entwickeln (train),
// auf einem anderen, ungesehenen testen (test). Unveraendert aus dem Chat-Kern.
export function splitCandles(
  candles: Candle[],
  trainRatio = 0.6,
): { train: Candle[]; test: Candle[] } {
  const cut = Math.max(1, Math.min(candles.length - 1, Math.floor(candles.length * trainRatio)));
  return { train: candles.slice(0, cut), test: candles.slice(cut) };
}
