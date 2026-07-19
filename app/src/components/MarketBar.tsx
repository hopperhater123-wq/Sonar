import { memo } from "react";
import type { FearGreed, SentimentCoverage } from "../types";
import { timeAgo } from "../format";
import { FearGreedGauge } from "./FearGreedGauge";

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

// memo: enthaelt die animierte F&G-Anzeige (Framer) — nicht am Hebel haengen.
export const MarketBar = memo(function MarketBar({
  fearGreed,
  lastIngestAt,
  sentiment,
}: {
  fearGreed: FearGreed | null;
  lastIngestAt: string | null;
  sentiment: SentimentCoverage | null;
}) {
  return (
    <div className="marketbar card">
      <FearGreedGauge value={fearGreed?.value ?? null} />
      <div className="market-right">
        <SentimentBadge s={sentiment} />
        <span className="muted small">Letzter Ingest: {timeAgo(lastIngestAt)}</span>
      </div>
    </div>
  );
});
