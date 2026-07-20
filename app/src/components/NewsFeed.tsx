import { memo, useState } from "react";
import type { NewsDigestResponse, NewsRow, SentimentSourceRow } from "../types";
import { analyzeText, extractTickers } from "../lib/lexicon";
import { fmtNum, timeAgo, tone } from "../format";

const SENT_LABEL: Record<string, { t: string; cls: string }> = {
  bullish: { t: "bullish", cls: "pos" },
  bearish: { t: "bearish", cls: "neg" },
  neutral: { t: "neutral", cls: "mut" },
  mixed: { t: "gemischt", cls: "mut" },
};

// Claude-Zusammenfassung + Fazit + Einordnung der aktuellen Nachrichtenlage.
function DigestPanel({ runDigest }: { runDigest: () => Promise<NewsDigestResponse> }) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<NewsDigestResponse | null>(null);

  const run = async () => {
    setBusy(true);
    setRes(null);
    setRes(await runDigest());
    setBusy(false);
  };

  return (
    <div className="digest">
      <div className="digest-bar">
        <button onClick={run} disabled={busy}>
          {busy ? "Claude analysiert…" : res ? "Neu analysieren" : "🧠 Zusammenfassung & Analyse"}
        </button>
        {res?.ok && res.digest && (
          <span className={`chip ${SENT_LABEL[res.digest.sentiment]?.cls ?? "mut"}`}>
            News-Sentiment: {SENT_LABEL[res.digest.sentiment]?.t ?? res.digest.sentiment}
          </span>
        )}
      </div>

      {res && !res.ok && <div className="error-box" style={{ marginTop: 10 }}>{res.error}</div>}

      {res?.ok && res.digest && (
        <div className="digest-body">
          <div className="digest-section">
            <span className="label">Zusammenfassung</span>
            <p>{res.digest.summary}</p>
          </div>
          {res.digest.themes.length > 0 && (
            <div className="digest-themes">
              {res.digest.themes.map((t) => (
                <span className="chip tick" key={t}>{t}</span>
              ))}
            </div>
          )}
          <div className="digest-section">
            <span className="label">Fazit</span>
            <p className="digest-fazit">{res.digest.fazit}</p>
          </div>
          <div className="digest-section">
            <span className="label">Einordnung</span>
            <p className="muted">{res.digest.analysis}</p>
          </div>
          <p className="muted small">
            {res.headlines} Schlagzeilen · {res.model} · {res.hint}
          </p>
        </div>
      )}
    </div>
  );
}

// News-Feed mit Analyse-Transparenz: fuer jede Schlagzeile zeigt der Feed,
// WOHER sie kommt (Quelle/Link), WELCHE Ticker erkannt wurden und wie das
// Lexikon sie einstuft — dieselbe Logik, die serverseitig ins Scoring fliesst.
// Darunter: aktuelle Sentiment-Werte je Symbol (Lexikon vs. Claude).

// memo: fuehrt Lexikon-Analyse je Schlagzeile aus — nicht bei jedem Regler-Tick.
export const NewsFeed = memo(function NewsFeed({
  news,
  universe,
  sentimentRows,
  runDigest,
}: {
  news: NewsRow[];
  universe: string[];
  sentimentRows: SentimentSourceRow[];
  runDigest: () => Promise<NewsDigestResponse>;
}) {
  const known = new Set(universe);

  // Neuester Wert je (Symbol, Quelle), dann pivotiert.
  const latest = new Map<string, { lex?: number; llm?: number }>();
  for (const r of sentimentRows) {
    const e = latest.get(r.asset_symbol) ?? {};
    if (r.source === "sentiment_lexicon" && e.lex === undefined) e.lex = r.sentiment_score;
    if (r.source === "sentiment_llm" && e.llm === undefined) e.llm = r.sentiment_score;
    latest.set(r.asset_symbol, e);
  }
  const pivot = [...latest.entries()]
    .map(([sym, v]) => {
      const vals = [v.lex, v.llm].filter((x): x is number => x !== undefined);
      return { sym, ...v, avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0 };
    })
    .sort((a, b) => Math.abs(b.avg) - Math.abs(a.avg));

  return (
    <section className="card feed-card">
      <div className="card-head">
        <h2>News-Feed &amp; Analyse</h2>
      </div>
      <p className="muted small feed-pipeline">
        RSS (CoinDesk · Cointelegraph · Decrypt) → Ticker-Erkennung → Lexikon (keyless) +
        Claude Haiku (Kontext) → <code>signals</code> → SentimentPolarity im Score.
      </p>

      <DigestPanel runDigest={runDigest} />

      {pivot.length > 0 && (
        <div className="table-wrap feed-sent">
          <table>
            <thead>
              <tr>
                <th>Symbol</th>
                <th className="num">Lexikon</th>
                <th className="num">Claude</th>
                <th className="num">Mittel → Score</th>
              </tr>
            </thead>
            <tbody>
              {pivot.map((r) => (
                <tr key={r.sym}>
                  <td><strong>{r.sym}</strong></td>
                  <td className={`num ${tone(r.lex)}`}>{r.lex === undefined ? "–" : fmtNum(r.lex, 2)}</td>
                  <td className={`num ${tone(r.llm)}`}>{r.llm === undefined ? "–" : fmtNum(r.llm, 2)}</td>
                  <td className={`num ${tone(r.avg)}`}><strong>{fmtNum(r.avg, 2)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ul className="feed-list">
        {news.map((n, i) => {
          const tickers = extractTickers(n.title, known);
          const lex = analyzeText(n.title);
          return (
            <li key={`${n.url}-${i}`} className="feed-item">
              <a href={n.url} target="_blank" rel="noreferrer" className="feed-title">
                {n.title}
              </a>
              <div className="feed-meta">
                <span className="chip src">{n.source}</span>
                <span className="muted small">{timeAgo(n.published_at ?? n.captured_at)}</span>
                {tickers.map((t) => (
                  <span key={t} className="chip tick">{t}</span>
                ))}
                {lex.hits > 0 ? (
                  <span className={`chip ${tone(lex.score)}`} title={`${lex.hits} Stimmungs-Treffer`}>
                    Lexikon {fmtNum(lex.score, 2)}
                  </span>
                ) : (
                  <span className="chip mut" title="Kein Stimmungswort — nur Claude bewertet solche Titel">
                    kein Stichwort
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
});
