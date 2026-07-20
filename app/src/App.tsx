import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { currentTheme, toggleTheme, type Theme } from "./theme";
import { store } from "./lib/store";
import { DEMO_DATA, demoBacktest, demoKlines, demoNewsDigest } from "./demo";
import { MotionConfig } from "framer-motion";
import { strengthPct } from "./lib/heat";
import type {
  BacktestResponse,
  Contact,
  DashboardData,
  FearGreed,
  Interval,
  KlineRow,
  LeaderboardRow,
  NewsDigestResponse,
  NewsRow,
  PaperEquityRow,
  PaperStats,
  PaperTradeRow,
  ProposalRow,
  SentimentCoverage,
  SentimentSourceRow,
} from "./types";
import { ScoreScope } from "./components/ScoreScope";
import { ContactCard } from "./components/ContactCard";
import { IntroPanel } from "./components/IntroPanel";
import { Login } from "./components/Login";
import { MarketBar } from "./components/MarketBar";
import { Briefing } from "./components/Briefing";
import { Chart } from "./components/Chart";
import { NewsFeed } from "./components/NewsFeed";
import { Leaderboard } from "./components/Leaderboard";
import { Proposals } from "./components/Proposals";
import { Paper } from "./components/Paper";

const DEMO = new URLSearchParams(window.location.search).has("demo");

// Symbole mit Kurshistorie (fest in der klines-Function definiert).
const KLINE_SYMBOLS = ["BTC", "ETH", "SOL", "XRP", "BONK", "BCH"];

async function fetchKlinesDb(symbol: string, interval: Interval): Promise<KlineRow[]> {
  const limit = interval === "1h" ? 96 : interval === "4h" ? 120 : 90;
  const { data, error } = await supabase
    .from("klines")
    .select("open_time, open, high, low, close, volume")
    .eq("symbol", symbol)
    .eq("interval", interval)
    .order("open_time", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as KlineRow[]).reverse();
}

async function loadData(): Promise<DashboardData> {
  const since48h = new Date(Date.now() - 48 * 3_600_000).toISOString();
  const [lb, props, stats, eq, trades, fg, lastSig, cov, news, sent, uni] = await Promise.all([
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
    supabase
      .from("news")
      .select("title, url, source, published_at, captured_at")
      .order("captured_at", { ascending: false })
      .limit(25),
    supabase
      .from("signals")
      .select("asset_symbol, source, sentiment_score, captured_at")
      .in("source", ["sentiment_lexicon", "sentiment_llm"])
      .gte("captured_at", since48h)
      .order("captured_at", { ascending: false })
      .limit(200),
    supabase.from("symbol_features").select("symbol"),
  ]);

  const firstErr =
    lb.error ?? props.error ?? stats.error ?? eq.error ?? trades.error ?? fg.error ??
    lastSig.error ?? cov.error ?? news.error ?? sent.error ?? uni.error;
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

  // Sentiment-Coverage: juengster Lauf + Laeufe in Folge ganz ohne Sentiment.
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
    news: (news.data ?? []) as NewsRow[],
    sentimentRows: (sent.data ?? []) as SentimentSourceRow[],
    universe: ((uni.data ?? []) as { symbol: string }[]).map((u) => u.symbol),
    lastIngestAt: (lastSig.data as { captured_at: string }[] | null)?.[0]?.captured_at ?? null,
    fetchedAt: new Date().toISOString(),
  };
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(DEMO);
  const [data, setData] = useState<DashboardData | null>(DEMO ? DEMO_DATA : null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(currentTheme());
  const [chartSymbol, setChartSymbol] = useState("BTC");
  const [scopeSel, setScopeSel] = useState(0);
  const [scopeExpanded, setScopeExpanded] = useState(0);
  const [leverage, setLeverage] = useState(() => {
    const v = Number(store.get("sonar-leverage"));
    return Number.isFinite(v) && v >= 1 && v <= 100 ? v : 1;
  });
  const [showIntro, setShowIntro] = useState(() => store.get("sonar-intro-seen") !== "1");
  const chartInitDone = useRef(false);

  const closeIntro = useCallback(() => {
    setShowIntro(false);
    store.set("sonar-intro-seen", "1");
  }, []);

  const changeLeverage = useCallback((v: number) => {
    const clamped = Math.max(1, Math.min(100, Math.round(v)));
    setLeverage(clamped);
    store.set("sonar-leverage", String(clamped));
  }, []);

  // Stabile Callbacks — sonst re-rendern die memoisierten Kinder bei jedem
  // Regler-Tick (INP-Jank). Funktionale Updates statt Closures ueber State.
  const selectBlip = useCallback((i: number) => {
    setScopeSel(i);
    setScopeExpanded(i);
  }, []);
  const toggleCard = useCallback((i: number) => {
    setScopeExpanded((prev) => (prev === i ? -1 : i));
    setScopeSel(i);
  }, []);

  const runBacktest = useCallback(
    async (proposalId: number, lev: number): Promise<BacktestResponse> => {
      if (DEMO) return demoBacktest(lev);
      const { data, error } = await supabase.functions.invoke("backtest", {
        body: { proposal_id: proposalId, leverage: lev },
      });
      if (error) {
        // supabase-js versteckt die echte Fehlermeldung im Response-Context —
        // rausholen, statt generisch "non-2xx" anzuzeigen.
        let msg = error.message;
        try {
          const ctx = (error as { context?: Response }).context;
          const parsed = ctx ? await ctx.json() : null;
          if (parsed?.error) msg = String(parsed.error);
        } catch {
          // Original-Message behalten
        }
        return { ok: false, error: msg };
      }
      return data as BacktestResponse;
    },
    [],
  );

  const runNewsDigest = useCallback(async (): Promise<NewsDigestResponse> => {
    if (DEMO) return demoNewsDigest();
    const { data, error } = await supabase.functions.invoke("news-digest", { body: {} });
    if (error) {
      let msg = error.message;
      try {
        const ctx = (error as { context?: Response }).context;
        const parsed = ctx ? await ctx.json() : null;
        if (parsed?.error) msg = String(parsed.error);
      } catch {
        // Original-Message behalten
      }
      return { ok: false, error: msg };
    }
    return data as NewsDigestResponse;
  }, []);

  useEffect(() => {
    if (DEMO) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const refresh = useCallback(() => {
    if (DEMO) return;
    setLoading(true);
    setError(null);
    loadData()
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (DEMO) return;
    if (!session) {
      setData(null);
      return;
    }
    refresh();
    const timer = setInterval(refresh, 60_000);
    return () => clearInterval(timer);
  }, [session, refresh]);

  // Chart initial auf das Symbol des juengsten Vorschlags stellen (einmalig).
  useEffect(() => {
    if (chartInitDone.current || !data) return;
    const top = data.proposals[0];
    if (top && KLINE_SYMBOLS.includes(top.asset_symbol)) setChartSymbol(top.asset_symbol);
    chartInitDone.current = true;
  }, [data]);

  // Motion-Layer: Leaderboard (max. 8 Blips) + juengster Vorschlag je Symbol.
  // Memoisiert auf `data` — beim Hebel-Ziehen bleibt die Referenz stabil, damit
  // der animierte Scope nicht neu aufgesetzt wird.
  // WICHTIG: dieser Hook MUSS vor den fruehen return-Statements stehen, sonst
  // aendert sich die Hook-Anzahl beim Login-Uebergang (React-Fehler #310).
  const contacts: Contact[] = useMemo(
    () =>
      (data?.leaderboard ?? []).slice(0, 8).map((r) => ({
        symbol: r.asset_symbol,
        strength: strengthPct(r.sonar_score),
        score: r.sonar_score,
        components: r.components_json,
        hasVolume: r.components_json.has_volume !== false,
        proposal: data?.proposals.find((p) => p.asset_symbol === r.asset_symbol) ?? null,
      })),
    [data],
  );

  if (!authReady) return <div className="center-note">Lade…</div>;
  if (!DEMO && !session) return <Login />;

  const topProposal = data?.proposals[0] ?? null;
  const fetchKlines = DEMO ? demoKlines : fetchKlinesDb;

  return (
    <div className="shell">
      <div className="sonar-bg" aria-hidden="true" />
      <header className="topbar">
        <div className="brand">
          <span className="ping-dot" aria-hidden="true" />
          <strong>SONAR</strong>
          <span className="tag">Signal statt Auto-Execution</span>
          {DEMO && <span className="badge demo">DEMO-DATEN</span>}
        </div>
        <div className="topbar-right">
          {data && (
            <span className="muted small">
              Stand {new Date(data.fetchedAt).toLocaleTimeString("de-DE")}
            </span>
          )}
          <button
            className="ghost icon"
            title="Was ist Sonar?"
            aria-label="Was ist Sonar?"
            onClick={() => setShowIntro((v) => !v)}
          >
            ?
          </button>
          <button
            className="ghost icon"
            title={theme === "dark" ? "Hellmodus" : "Dunkelmodus"}
            onClick={() => setTheme(toggleTheme())}
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
          {!DEMO && (
            <>
              <button onClick={refresh} disabled={loading}>
                {loading ? "lädt…" : "Aktualisieren"}
              </button>
              <button className="ghost" onClick={() => supabase.auth.signOut()}>
                Logout
              </button>
            </>
          )}
        </div>
      </header>

      {error && <div className="error-box">Fehler beim Laden: {error}</div>}

      {showIntro && <IntroPanel onClose={closeIntro} />}

      {data && (
        <>
          <MarketBar
            fearGreed={data.fearGreed}
            lastIngestAt={data.lastIngestAt}
            sentiment={data.sentiment}
          />
          <Briefing
            proposal={topProposal}
            chartable={topProposal != null && KLINE_SYMBOLS.includes(topProposal.asset_symbol)}
            leverage={leverage}
            onLeverageChange={changeLeverage}
            onShowChart={() => {
              if (topProposal) setChartSymbol(topProposal.asset_symbol);
              document.getElementById("chart")?.scrollIntoView({ behavior: "smooth" });
            }}
          />
          {contacts.length > 0 && (
            <MotionConfig reducedMotion="user">
              <div className="grid two scope-row">
                <ScoreScope contacts={contacts} selected={scopeSel} onSelect={selectBlip} />
                <div>
                  {contacts.map((c, i) => (
                    <ContactCard
                      key={c.symbol}
                      index={i}
                      contact={c}
                      expanded={scopeExpanded === i}
                      leverage={leverage}
                      runBacktest={runBacktest}
                      onToggle={toggleCard}
                    />
                  ))}
                </div>
              </div>
            </MotionConfig>
          )}
          <div className="grid two">
            <Chart
              symbols={KLINE_SYMBOLS}
              symbol={chartSymbol}
              onSymbolChange={setChartSymbol}
              fetchKlines={fetchKlines}
              proposals={data.proposals}
            />
            <NewsFeed
              news={data.news}
              universe={data.universe}
              sentimentRows={data.sentimentRows}
              runDigest={runNewsDigest}
            />
          </div>
          <section className="card">
            <div className="card-head">
              <h2>SonarScore-Leaderboard</h2>
            </div>
            <Leaderboard rows={data.leaderboard} />
          </section>
          <div className="grid two">
            <section className="card">
              <div className="card-head">
                <h2>Strategie-Vorschläge</h2>
              </div>
              <Proposals rows={data.proposals} />
            </section>
            <section className="card">
              <div className="card-head">
                <h2>Paper-Forward-Test</h2>
              </div>
              <Paper
                stats={data.paperStats}
                equity={data.equity}
                trades={data.trades}
                lastCloses={data.lastCloses}
              />
            </section>
          </div>
        </>
      )}

      <footer className="foot">
        Privates Analyse-Tool, ausschließlich Eigengebrauch. Signale — kein Finanzrat.
        Ausführung nur manuell; dieses Frontend kann nichts schreiben (RLS read-only).
      </footer>
    </div>
  );
}
