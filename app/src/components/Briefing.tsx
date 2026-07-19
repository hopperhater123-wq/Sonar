import type { ProposalRow } from "../types";
import { fmtNum, fmtPrice, timeAgo } from "../format";

// Tagesbriefing: der juengste Systemvorschlag als Hero — mit Gegenargumenten
// IMMER sichtbar (Spec: ehrliches Abwaegen, kein Verkaufsprospekt).
export function Briefing({
  proposal,
  chartable,
  onShowChart,
}: {
  proposal: ProposalRow | null;
  chartable: boolean;
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
