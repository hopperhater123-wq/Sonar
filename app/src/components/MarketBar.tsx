import type { FearGreed } from "../types";
import { timeAgo } from "../format";

// Fear & Greed wirkt im Score contrarian: Extreme Fear boostet, Extreme Greed dämpft.
export function MarketBar({
  fearGreed,
  lastIngestAt,
}: {
  fearGreed: FearGreed | null;
  lastIngestAt: string | null;
}) {
  const v = fearGreed?.value ?? null;
  return (
    <div className="marketbar card">
      <div className="fg">
        <span className="label">Fear &amp; Greed</span>
        {v == null ? (
          <span className="muted">keine Daten</span>
        ) : (
          <>
            <div className="fg-bar" title={`${v}/100 — ${fearGreed?.classification ?? ""}`}>
              <div className="fg-marker" style={{ left: `${v}%` }} />
            </div>
            <span className="fg-value">
              {v} <span className="muted">· {fearGreed?.classification ?? "?"}</span>
            </span>
          </>
        )}
      </div>
      <div className="muted small">
        Letzter Ingest: {timeAgo(lastIngestAt)} · Kette: ingest → sentiment → score alle 30 Min
      </div>
    </div>
  );
}
