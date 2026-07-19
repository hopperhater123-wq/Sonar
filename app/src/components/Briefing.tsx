import type { ProposalRow } from "../types";
import { fmtNum, fmtPrice, timeAgo } from "../format";
import { liqPrice, maxViableLeverage, parseEntryMid, riskAtStopPct } from "../lib/leverage";

// Tagesbriefing: der juengste Systemvorschlag als Hero — mit Gegenargumenten
// IMMER sichtbar (Spec: ehrliches Abwaegen, kein Verkaufsprospekt).
// Der Hebel-Regler gilt global (localStorage) — er verschiebt NICHT die Level,
// sondern Risiko + Liquidationspreis, und das Briefing zeigt beides ehrlich an.
export function Briefing({
  proposal,
  chartable,
  leverage,
  onLeverageChange,
  onShowChart,
}: {
  proposal: ProposalRow | null;
  chartable: boolean;
  leverage: number;
  onLeverageChange: (v: number) => void;
  onShowChart: () => void;
}) {
  if (!proposal) {
    return (
      <section className="card briefing">
        <div className="briefing-head">
          <span className="label">Tagesbriefing</span>
        </div>
        <p className="muted">
          Kein aktiver Vorschlag. On-demand erzeugen: <code>judge</code> aufrufen oder{" "}
          <code>select generate_proposals();</code>
        </p>
      </section>
    );
  }
  const p = proposal;
  const entryMid = parseEntryMid(p.entry_zone);
  const canRisk = entryMid != null && p.stop_loss != null;
  const maxLev = canRisk ? maxViableLeverage(entryMid, p.stop_loss!) : null;
  const overLev = maxLev != null && leverage > maxLev;
  return (
    <section className="card briefing">
      <div className="briefing-head">
        <span className="label">Tagesbriefing · Systemvorschlag {timeAgo(p.created_at)}</span>
        <span className="badge">{p.origin === "claude" ? `🤖 ${p.model ?? "Claude"}` : "Regelwerk"}</span>
      </div>

      <div className="briefing-main">
        <div className="briefing-symbol">
          <span className="sym">{p.asset_symbol}</span>
          <span className="muted small">Long-Setup · Score {fmtNum(p.sonar_score, 3)}</span>
        </div>
        <div className="briefing-stats">
          <div className="bstat">
            <span className="label">Einstieg</span>
            <strong>{p.entry_zone ?? "–"}</strong>
          </div>
          <div className="bstat neg">
            <span className="label">Stop-Loss</span>
            <strong>{fmtPrice(p.stop_loss)}</strong>
          </div>
          <div className="bstat pos">
            <span className="label">Take-Profit</span>
            <strong>{fmtPrice(p.take_profit)}</strong>
          </div>
          <div className="bstat">
            <span className="label">Größe</span>
            <strong>{fmtNum(p.position_size_pct, 2)} %</strong>
          </div>
          <div className="bstat">
            <span className="label">Konfidenz</span>
            <strong>{p.confidence == null ? "–" : `${Math.round(p.confidence * 100)} %`}</strong>
            {p.confidence != null && (
              <div className="conf">
                <div className="conf-fill" style={{ width: `${Math.min(100, p.confidence * 100)}%` }} />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="lever-row">
        <span className="label">Hebel</span>
        <input
          type="range"
          min={1}
          max={100}
          step={1}
          value={leverage}
          onChange={(e) => onLeverageChange(Number(e.target.value))}
          aria-label="Hebel 1 bis 100x"
        />
        <span className={`lever-value num ${overLev ? "neg" : ""}`}>{leverage}x</span>
        {canRisk && (
          <span className="muted small lever-info">
            Liq {leverage > 1 ? `≈ ${fmtPrice(liqPrice(entryMid!, leverage))}` : "—"} · Risiko am
            Stop ≈ {fmtNum(riskAtStopPct(entryMid!, p.stop_loss!, leverage), 0)} % des Einsatzes ·
            max. sinnvoll ~{maxLev}x
          </span>
        )}
      </div>
      {overLev && (
        <p className="small neg" style={{ margin: "4px 0 0" }}>
          ⚠ Bei {leverage}x liegt die Liquidation VOR dem Stop — der Stop greift nie. Über ~{maxLev}x
          ist dieses Setup kaputt.
        </p>
      )}

      {p.rationale && <p className="briefing-why">{p.rationale}</p>}
      {p.counterpoints && (
        <p className="briefing-counter">
          <span className="label neg">Gegenargumente</span> {p.counterpoints}
        </p>
      )}

      <div className="briefing-foot">
        {chartable && (
          <button className="ghost" onClick={onShowChart}>
            Im Chart ansehen ↓
          </button>
        )}
        <span className="muted small">
          Vorschlag des Systems, kein Finanzrat — du prüfst und entscheidest manuell.
        </span>
      </div>
    </section>
  );
}
