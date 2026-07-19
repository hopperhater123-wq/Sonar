import type { FearGreed, SentimentCoverage } from "../types";
import { timeAgo } from "../format";

function SentimentBadge({ s }: { s: SentimentCoverage | null }) {
  if (!s) return null;
  const active = s.withSentiment > 0;
  return (
    <span
      className={`chip ${active ? "pos" : "mut"}`}
      title={
        active
          ? `${s.withSentiment} von ${s.scored} Symbolen bekamen im letzten Lauf ein Sentiment-Signal`
          : `Kein Symbol mit Sentiment seit ${s.stillRuns} Läufen — LLM/Reddit füllen die Quelle`
      }
    >
      Sentiment {active ? `${s.withSentiment}/${s.scored} aktiv` : `still · ${s.stillRuns} Läufe`}
    </span>
  );
}

// Fear & Greed wirkt im Score contrarian: Extreme Fear boostet, Extreme Greed dämpft.
export function MarketBar({
  fearGreed,
  lastIngestAt,
  sentiment,
}: {
  fearGreed: FearGreed | null;
  lastIngestAt: string | null;
  sentiment: SentimentCoverage | null;
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
      <div className="market-right">
        <SentimentBadge s={sentiment} />
        <span className="muted small">Letzter Ingest: {timeAgo(lastIngestAt)}</span>
      </div>
    </div>
  );
}
