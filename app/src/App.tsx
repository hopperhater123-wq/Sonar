import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type {
  DashboardData,
  FearGreed,
  LeaderboardRow,
  PaperEquityRow,
  PaperStats,
  PaperTradeRow,
  ProposalRow,
  SentimentCoverage,
} from "./types";
import { Login } from "./components/Login";
import { MarketBar } from "./components/MarketBar";
import { Leaderboard } from "./components/Leaderboard";
import { Proposals } from "./components/Proposals";
import { Paper } from "./components/Paper";

async function loadData(): Promise<DashboardData> {
  const [lb, props, stats, eq, trades, fg, lastSig, cov] = await Promise.all([
    supabase.from("sonar_leaderboard").select("*"),
    supabase.from("proposals").select("*").order("created_at", { ascending: false }).limit(12),
    supabase.from("paper_stats").select("*").maybeSingle(),
    supabase.from("paper_equity").select("*").order("run_at", { ascending: true }),
    supabase.from("paper_trades").select("*").order("opened_at", { ascending: false }).limit(20),
    supabase
      .from("market_context")
      .select("value, classification, captured_at")
      .eq("metric", "fear_greed")
      .order("captured_at", { ascending: false })
      .limit(1),
    supabase.from("signals").select("captured_at").order("captured_at", { ascending: false }).limit(1),
    supabase
      .from("sentiment_coverage")
      .select("scored, with_sentiment")
      .order("run_at", { ascending: false })
      .limit(48),
  ]);

  const firstErr =
    lb.error ?? props.error ?? stats.error ?? eq.error ?? trades.error ?? fg.error ??
    lastSig.error ?? cov.error;
  if (firstErr) throw new Error(firstErr.message);

  const tradeRows = (trades.data ?? []) as PaperTradeRow[];

  // Letzter 1h-Close je offener Position — fuer unrealisierte PnL-Anzeige.
  const openSymbols = [...new Set(tradeRows.filter((t) => t.status === "open").map((t) => t.asset_symbol))];
  const lastCloses: Record<string, number> = {};
  await Promise.all(
    openSymbols.map(async (sym) => {
      const { data } = await supabase
        .from("klines")
        .select("close")
        .eq("symbol", sym)
        .eq("interval", "1h")
        .order("open_time", { ascending: false })
        .limit(1);
      const close = (data as { close: number }[] | null)?.[0]?.close;
      if (close != null) lastCloses[sym] = close;
    }),
  );

  const fgRow = (fg.data as { value: number; classification: string | null; captured_at: string }[] | null)?.[0];

  // Sentiment-Coverage: juengster Lauf + wie viele Laeufe in Folge ganz ohne Sentiment.
  const covRows = (cov.data ?? []) as { scored: number; with_sentiment: number }[];
  let sentiment: SentimentCoverage | null = null;
  if (covRows.length > 0) {
    let stillRuns = 0;
    for (const r of covRows) {
      if (r.with_sentiment === 0) stillRuns++;
      else break;
    }
    sentiment = { withSentiment: covRows[0].with_sentiment, scored: covRows[0].scored, stillRuns };
  }

  return {
    leaderboard: (lb.data ?? []) as LeaderboardRow[],
    proposals: (props.data ?? []) as ProposalRow[],
    paperStats: (stats.data ?? null) as PaperStats | null,
    equity: (eq.data ?? []) as PaperEquityRow[],
    trades: tradeRows,
    lastCloses,
    fearGreed: (fgRow ?? null) as FearGreed | null,
    sentiment,
    lastIngestAt: (lastSig.data as { captured_at: string }[] | null)?.[0]?.captured_at ?? null,
    fetchedAt: new Date().toISOString(),
  };
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    loadData()
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!session) {
      setData(null);
      return;
    }
    refresh();
    const timer = setInterval(refresh, 60_000);
    return () => clearInterval(timer);
  }, [session, refresh]);

  if (!authReady) return <div className="center-note">Lade…</div>;
  if (!session) return <Login />;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          🛰️ <strong>Sonar</strong> <span className="tag">Signal statt Auto-Execution</span>
        </div>
        <div className="topbar-right">
          {data && (
            <span className="muted small">
              Stand {new Date(data.fetchedAt).toLocaleTimeString("de-DE")}
            </span>
          )}
          <button onClick={refresh} disabled={loading}>
            {loading ? "lädt…" : "Aktualisieren"}
          </button>
          <button className="ghost" onClick={() => supabase.auth.signOut()}>
            Logout
          </button>
        </div>
      </header>

      {error && <div className="error-box">Fehler beim Laden: {error}</div>}

      {data && (
        <>
          <MarketBar
            fearGreed={data.fearGreed}
            lastIngestAt={data.lastIngestAt}
            sentiment={data.sentiment}
          />
          <main className="grid">
            <section className="card span2">
              <h2>SonarScore-Leaderboard</h2>
              <Leaderboard rows={data.leaderboard} />
            </section>
            <section className="card">
              <h2>Strategie-Vorschläge</h2>
              <Proposals rows={data.proposals} />
            </section>
            <section className="card">
              <h2>Paper-Forward-Test</h2>
              <Paper
                stats={data.paperStats}
                equity={data.equity}
                trades={data.trades}
                lastCloses={data.lastCloses}
              />
            </section>
          </main>
        </>
      )}

      <footer className="foot">
        Privates Analyse-Tool, ausschließlich Eigengebrauch. Signale — kein Finanzrat.
        Ausführung nur manuell; dieses Frontend kann nichts schreiben (RLS read-only).
      </footer>
    </div>
  );
}
