import type { LeaderboardRow } from "../types";
import { fmtNum, fmtPct, fmtPrice, fmtVolume, timeAgo, tone } from "../format";

function Chip({ label, value, title }: { label: string; value: number | undefined; title: string }) {
  return (
    <span className={`chip ${tone(value)}`} title={title}>
      {label} {value == null ? "–" : fmtNum(value, 2)}
    </span>
  );
}

// Neuester Score-Lauf, Top zuerst — mit Ping-Balken relativ zum Top-Score.
export function Leaderboard({ rows }: { rows: LeaderboardRow[] }) {
  if (rows.length === 0) return <p className="muted">Noch kein Score-Lauf vorhanden.</p>;
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.sonar_score)), 0.0001);

  return (
    <>
      <p className="muted small">
        Lauf {timeAgo(rows[0].run_at)} · mm Mentions-Momentum · sp Sentiment · pm Preis-Momentum ·
        vc Volumen-Bestätigung · hp Hype-Penalty (Abzug)
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Symbol</th>
              <th className="num">Score</th>
              <th className="ping-col">Ping</th>
              <th>Komponenten</th>
              <th className="num">Preis</th>
              <th className="num">24h</th>
              <th className="num">Volumen</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const c = r.components_json;
              const inp = c.inputs ?? {};
              const width = Math.abs(r.sonar_score) / maxAbs;
              return (
                <tr key={r.asset_symbol}>
                  <td className="muted">{i + 1}</td>
                  <td>
                    <strong>{r.asset_symbol}</strong>
                    {c.has_volume === false && (
                      <span className="chip warn" title="Keine Volumendaten — halbe Hype-Penalty">
                        ohne Vol
                      </span>
                    )}
                  </td>
                  <td className={`num score ${tone(r.sonar_score)}`}>{fmtNum(r.sonar_score, 4)}</td>
                  <td className="ping-col">
                    <div className="ping-bar">
                      <div
                        className={`ping-fill ${tone(r.sonar_score)}-bg`}
                        style={{ width: `${Math.max(3, width * 100)}%` }}
                      />
                    </div>
                  </td>
                  <td className="chips">
                    <Chip label="mm" value={c.mentions_momentum} title="MentionsMomentum (konfidenz-gedämpft)" />
                    <Chip label="sp" value={c.sentiment_polarity} title="SentimentPolarity (Lexikon + Claude, 48h)" />
                    <Chip label="pm" value={c.price_momentum} title="PriceMomentum (tanh 24h)" />
                    <Chip label="vc" value={c.volume_confirmation} title="VolumeConfirmation (log-skaliert)" />
                    <Chip label="hp" value={c.hype_penalty == null ? undefined : -c.hype_penalty} title="HypePenalty (wird abgezogen)" />
                  </td>
                  <td className="num">{fmtPrice(inp.price)}</td>
                  <td className={`num ${tone(inp.price_change_24h)}`}>{fmtPct(inp.price_change_24h)}</td>
                  <td className="num muted">{fmtVolume(inp.volume_24h)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
