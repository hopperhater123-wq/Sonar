import { useEffect, useState } from "react";
import type { Interval, KlineRow, ProposalRow } from "../types";
import { fmtPrice, timeAgo } from "../format";

// Candle-Chart, handgerollt als SVG (keine Chart-Lib): Kerzen + SMA20 +
// Einstieg/Stop/TP-Linien aus dem juengsten Vorschlag des gewaehlten Symbols.

const W = 760;
const H = 300;
const PAD = { l: 6, r: 58, t: 10, b: 22 };

function sma(rows: KlineRow[], n: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < rows.length; i++) {
    sum += rows[i].close;
    if (i >= n) sum -= rows[i - n].close;
    out.push(i >= n - 1 ? sum / n : null);
  }
  return out;
}

function parseEntry(zone: string | null): number[] {
  if (!zone) return [];
  return (zone.match(/\d+(?:\.\d+)?(?:e-?\d+)?/gi) ?? [])
    .map(Number)
    .filter(Number.isFinite)
    .slice(0, 2);
}

function xLabel(iso: string, interval: Interval): string {
  const d = new Date(iso);
  return interval === "1d"
    ? d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })
    : d.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit" }) + "h";
}

export function Chart({
  symbols,
  symbol,
  onSymbolChange,
  fetchKlines,
  proposals,
}: {
  symbols: string[];
  symbol: string;
  onSymbolChange: (s: string) => void;
  fetchKlines: (symbol: string, interval: Interval) => Promise<KlineRow[]>;
  proposals: ProposalRow[];
}) {
  const [interval, setIntervalV] = useState<Interval>("4h");
  const [rows, setRows] = useState<KlineRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetchKlines(symbol, interval)
      .then((r) => alive && setRows(r))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [symbol, interval, fetchKlines]);

  const proposal = proposals.find((p) => p.asset_symbol === symbol) ?? null;

  let body = null;
  if (rows.length > 1) {
    // Preis-Domain: Kerzen + (nahe) Vorschlags-Level einbeziehen.
    let lo = Math.min(...rows.map((r) => r.low));
    let hi = Math.max(...rows.map((r) => r.high));
    const levels: { v: number; cls: string; label: string }[] = [];
    if (proposal) {
      const near = (v: number | null): v is number =>
        v != null && Number.isFinite(v) && v > lo * 0.75 && v < hi * 1.25;
      if (near(proposal.stop_loss)) levels.push({ v: proposal.stop_loss, cls: "lvl-neg", label: "Stop" });
      if (near(proposal.take_profit)) levels.push({ v: proposal.take_profit, cls: "lvl-pos", label: "TP" });
      for (const e of parseEntry(proposal.entry_zone)) {
        if (near(e)) levels.push({ v: e, cls: "lvl-entry", label: "Einstieg" });
      }
      for (const l of levels) {
        lo = Math.min(lo, l.v);
        hi = Math.max(hi, l.v);
      }
    }
    const pad = (hi - lo) * 0.03 || hi * 0.01;
    lo -= pad;
    hi += pad;

    const iw = W - PAD.l - PAD.r;
    const ih = H - PAD.t - PAD.b;
    const x = (i: number) => PAD.l + (i / rows.length) * iw;
    const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * ih;
    const cw = Math.max(1.5, (iw / rows.length) * 0.62);

    const smaVals = sma(rows, 20);
    const smaPts = smaVals
      .map((v, i) => (v == null ? null : `${(x(i) + cw / 2).toFixed(1)},${y(v).toFixed(1)}`))
      .filter(Boolean)
      .join(" ");

    const yTicks = [0, 1, 2, 3, 4].map((i) => lo + ((hi - lo) * i) / 4);
    const xIdx = [0, 1, 2, 3, 4].map((i) => Math.min(rows.length - 1, Math.round((rows.length - 1) * i / 4)));
    const last = rows[rows.length - 1];

    body = (
      <>
        <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img">
          {yTicks.map((t) => (
            <g key={t}>
              <line className="gridline" x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} />
              <text className="axis" x={W - PAD.r + 4} y={y(t) + 3}>{fmtPrice(t)}</text>
            </g>
          ))}
          {xIdx.map((i) => (
            <text key={i} className="axis" x={x(i)} y={H - 6}>{xLabel(rows[i].open_time, interval)}</text>
          ))}
          {smaPts && <polyline className="sma" points={smaPts} fill="none" />}
          {rows.map((r, i) => {
            const up = r.close >= r.open;
            const bx = x(i);
            const top = y(Math.max(r.open, r.close));
            const bh = Math.max(1, Math.abs(y(r.open) - y(r.close)));
            return (
              <g key={r.open_time} className={up ? "candle-up" : "candle-down"}>
                <line x1={bx + cw / 2} x2={bx + cw / 2} y1={y(r.high)} y2={y(r.low)} />
                <rect x={bx} y={top} width={cw} height={bh} />
              </g>
            );
          })}
          {levels.map((l) => (
            <g key={`${l.label}${l.v}`} className={l.cls}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(l.v)} y2={y(l.v)} />
              <text x={PAD.l + 4} y={y(l.v) - 3}>{l.label} {fmtPrice(l.v)}</text>
            </g>
          ))}
        </svg>
        <div className="muted small chart-meta">
          Letzte Kerze {timeAgo(last.open_time)} · Schluss {fmtPrice(last.close)} · Linie = SMA20
          {proposal && " · Level aus dem jüngsten Vorschlag"}
        </div>
      </>
    );
  }

  return (
    <section className="card chart-card" id="chart">
      <div className="card-head">
        <h2>Chart</h2>
        <div className="seg">
          {symbols.map((s) => (
            <button key={s} className={s === symbol ? "seg-on" : ""} onClick={() => onSymbolChange(s)}>
              {s}
            </button>
          ))}
        </div>
        <div className="seg">
          {(["1h", "4h", "1d"] as Interval[]).map((iv) => (
            <button key={iv} className={iv === interval ? "seg-on" : ""} onClick={() => setIntervalV(iv)}>
              {iv}
            </button>
          ))}
        </div>
      </div>
      {error && <div className="error-box">{error}</div>}
      {loading && rows.length === 0 ? <p className="muted">lädt…</p> : body}
    </section>
  );
}
