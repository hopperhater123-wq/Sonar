// Hebel-Mathematik fuers Frontend — Spiegel der Server-Logik (backtest/lib/sim.ts).
// Hebel verschiebt NICHT Einstieg/Ausstieg, sondern Risiko und Liquidation.

export const LIQ_BUFFER = 0.95; // konservativ: echte Boersen liquidieren frueher als die Theorie

export function parseEntryMid(zone: string | null): number | null {
  const nums = (zone?.match(/\d+(?:\.\d+)?(?:e-?\d+)?/gi) ?? [])
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);
  if (nums.length >= 2) return (nums[0] + nums[1]) / 2;
  if (nums.length === 1) return nums[0];
  return null;
}

export function liqPrice(entry: number, leverage: number): number {
  return entry * (1 - LIQ_BUFFER / leverage);
}

// Ab welchem Hebel die Liquidation vor dem Stop greift — darueber ist das Setup kaputt.
export function maxViableLeverage(entryMid: number, stop: number): number {
  const stopDist = (entryMid - stop) / entryMid;
  if (!Number.isFinite(stopDist) || stopDist <= 0) return 1;
  return Math.max(1, Math.min(100, Math.floor(LIQ_BUFFER / stopDist)));
}

// Verlust in % des Einsatzes, wenn der Stop ausloest.
export function riskAtStopPct(entryMid: number, stop: number, leverage: number): number {
  return Math.min(100, ((entryMid - stop) / entryMid) * 100 * leverage);
}
