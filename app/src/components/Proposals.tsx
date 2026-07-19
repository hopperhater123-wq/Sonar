import type { ProposalRow } from "../types";
import { fmtNum, fmtPrice, timeAgo } from "../format";

// Strukturierte Vorschläge (Schicht 3) — Status `proposed` heißt: NUR ein
// Vorschlag. Bestätigung/Ausführung passiert ausschließlich manuell.
export function Proposals({ rows }: { rows: ProposalRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="muted">
        Keine Vorschläge. On-demand erzeugen: <code>select generate_proposals();</code>
      </p>
    );
  }

  return (
    <div className="proposal-list">
      {rows.map((p) => (
        <article className="proposal" key={p.id}>
          <header>
            <strong>{p.asset_symbol}</strong>
            <span className={`badge ${p.status === "proposed" ? "" : "muted"}`}>{p.status}</span>
            <span className="muted small">{timeAgo(p.created_at)}</span>
          </header>
          <div className="proposal-nums">
            <span title="Einstiegszone">Einstieg {p.entry_zone ?? "–"}</span>
            <span title="Stop-Loss" className="neg">SL {fmtPrice(p.stop_loss)}</span>
            <span title="Take-Profit" className="pos">TP {fmtPrice(p.take_profit)}</span>
            <span title="Positionsgröße in % des Risiko-Budgets">Größe {fmtNum(p.position_size_pct, 2)} %</span>
          </div>
          {p.confidence != null && (
            <div className="conf" title={`Konfidenz ${fmtNum(p.confidence * 100, 0)} %`}>
              <div className="conf-fill" style={{ width: `${Math.min(100, p.confidence * 100)}%` }} />
            </div>
          )}
          {p.rationale && <p className="small">{p.rationale}</p>}
          {p.counterpoints && (
            <details>
              <summary className="small">Gegenargumente</summary>
              <p className="small muted">{p.counterpoints}</p>
            </details>
          )}
        </article>
      ))}
    </div>
  );
}
