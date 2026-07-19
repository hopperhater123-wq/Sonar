import { memo } from "react";
import type { NewsRow, SentimentSourceRow } from "../types";
import { analyzeText, extractTickers } from "../lib/lexicon";
import { fmtNum, timeAgo, tone } from "../format";

// News-Feed mit Analyse-Transparenz: fuer jede Schlagzeile zeigt der Feed,
// WOHER sie kommt (Quelle/Link), WELCHE Ticker erkannt wurden und wie das
// Lexikon sie einstuft — dieselbe Logik, die serverseitig ins Scoring fliesst.
// Darunter: aktuelle Sentiment-Werte je Symbol (Lexikon vs. Claude).

// memo: fuehrt Lexikon-Analyse je Schlagzeile aus — nicht bei jedem Regler-Tick.
export const NewsFeed = memo(function NewsFeed({
  news,
  universe,
  sentimentRows,
}: {
  news: NewsRow[];
  universe: string[];
  sentimentRows: SentimentSourceRow[];
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
        {news.map((n) => {
          const tickers = extractTickers(n.title, known);
          const lex = analyzeText(n.title);
          return (
            <li key={n.url} className="feed-item">
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
