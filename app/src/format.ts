// Kleine Format-Helfer — deutsch, kompakt, ohne Abhängigkeiten.

export function fmtPrice(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "–";
  if (v >= 1000) return v.toLocaleString("de-DE", { maximumFractionDigits: 0 });
  if (v >= 1) return v.toLocaleString("de-DE", { maximumFractionDigits: 2 });
  if (v >= 0.01) return v.toLocaleString("de-DE", { maximumFractionDigits: 4 });
  return v.toExponential(2).replace(".", ",");
}

export function fmtPct(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "–";
  const s = v.toLocaleString("de-DE", { maximumFractionDigits: digits, minimumFractionDigits: digits });
  return `${v > 0 ? "+" : ""}${s} %`;
}

export function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "–";
  return v.toLocaleString("de-DE", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function fmtVolume(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "–";
  if (v >= 1e9) return `${fmtNum(v / 1e9, 1)} Mrd $`;
  if (v >= 1e6) return `${fmtNum(v / 1e6, 1)} Mio $`;
  if (v >= 1e3) return `${fmtNum(v / 1e3, 0)} k $`;
  return `${fmtNum(v, 0)} $`;
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "–";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "gerade eben";
  if (mins < 60) return `vor ${mins} Min`;
  const h = Math.round(mins / 60);
  if (h < 48) return `vor ${h} Std`;
  return `vor ${Math.round(h / 24)} Tagen`;
}

export type Tone = "pos" | "neg" | "mut";

export function tone(v: number | null | undefined, eps = 1e-9): Tone {
  if (v == null || !Number.isFinite(v) || Math.abs(v) < eps) return "mut";
  return v > 0 ? "pos" : "neg";
}
