import type { PaperEquityRow, PaperStats, PaperTradeRow } from "../types";
import { fmtNum, fmtPct, fmtPrice, timeAgo, tone } from "../format";

function EquitySpark({ rows }: { rows: PaperEquityRow[] }) {
  if (rows.length < 2) return <p className="muted small">Equity-Kurve braucht mehr Läufe.</p>;
  const w = 560;
  const h = 80;
  const vals = rows.map((r) => r.equity);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const pts = vals
    .map((v, i) => `${((i / (vals.length - 1)) * w).toFixed(1)},${(h - 6 - ((v - min) / span) * (h - 12)).toFixed(1)}`)
    .join(" ");
  const last = rows[rows.length - 1];
  const up = last.equity >= rows[0].equity;
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="spark" preserveAspectRatio="none">
        <polyline points={pts} fill="none" className={up ? "pos-stroke" : "neg-stroke"} strokeWidth={2} />
      </svg>
      <div className="muted small">
        Equity {fmtNum(last.equity, 2)} (Start 10.000) · realisiert {fmtPct(last.realized_pct, 2)} ·
        unrealisiert {fmtPct(last.unrealized_pct, 2)} · {timeAgo(last.run_at)}
      </div>
    </div>
  );
}

export function Paper({
  stats,
  equity,
  trades,
  lastCloses,
}: {
  stats: PaperStats | null;
  equity: PaperEquityRow[];
  trades: PaperTradeRow[];
  lastCloses: Record<string, number>;
}) {
  return (
    <>
      {stats && (
        <div className="stat-row">
          <span className="chip mut">Trades {stats.trades}</span>
          <span className="chip mut">offen {stats.open}</span>
          <span className="chip pos">Ziel {stats.wins}</span>
          <span className="chip neg">Stop {stats.losses}</span>
          <span className="chip mut">abgelaufen {stats.expired}</span>
          <span className={`chip ${tone(stats.avg_pnl_pct)}`}>Ø PnL {fmtPct(stats.avg_pnl_pct)}</span>
        </div>
      )}
      <EquitySpark rows={equity} />
      {trades.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Status</th>
                <th className="num">Einstieg</th>
                <th className="num">Aktuell/Exit</th>
                <th className="num">PnL</th>
                <th className="num">Größe</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => {
                const current = t.status === "open" ? lastCloses[t.asset_symbol] : t.close_price;
                const pnl =
                  t.pnl_pct ??
                  (current != null ? ((current - t.entry_price) / t.entry_price) * 100 : null);
                return (
                  <tr key={t.id}>
                    <td>
                      <strong>{t.asset_symbol}</strong>
                    </td>
                    <td>
                      <span className={`badge ${t.status === "open" ? "" : "muted"}`}>{t.status}</span>
                    </td>
                    <td className="num">{fmtPrice(t.entry_price)}</td>
                    <td className="num">{fmtPrice(current)}</td>
                    <td className={`num ${tone(pnl)}`}>{fmtPct(pnl)}</td>
                    <td className="num muted">{fmtNum(t.position_size_pct, 2)} %</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">Reine Simulation gegen 1h-Kerzen — es wird nie eine echte Order erzeugt.</p>
    </>
  );
}
