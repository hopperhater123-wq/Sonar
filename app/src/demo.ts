// Demo-Modus (?demo in der URL): rendert das komplette Dashboard mit
// FIKTIVEN, deterministischen Daten — ohne Login, ohne echte DB-Zugriffe.
// Zweck: UI entwickeln/reviewen (Screenshots), ohne Datenfreigabe.

import type { BacktestResponse, DashboardData, Interval, KlineRow, NewsDigestResponse, ProposalRow } from "./types";

export function demoNewsDigest(): Promise<NewsDigestResponse> {
  return Promise.resolve({
    ok: true,
    model: "claude-sonnet-5",
    headlines: 40,
    fearGreed: 28,
    hint: "Einordnung, kein Finanzrat — du entscheidest.",
    digest: {
      summary:
        "Bitcoin ringt mit der 65K-Marke, während ein Selloff bei AI-Aktien auf den Kryptomarkt übergreift und institutionelle Käufer (Strategy, Bitmine) ihre BTC/ETH-Zukäufe pausieren. Parallel laufen Infrastruktur-Themen: Cardano-Hardfork, CBDC-Pilotprojekte, ein paar Sicherheitsvorfälle.",
      sentiment: "bearish",
      themes: ["BTC-Schwäche unter 65K", "Institutionelle Käufe pausiert", "AI-Aktien-Kopplung", "Sicherheitsvorfälle", "CBDC & Regulierung"],
      fazit:
        "Kurzfristig schwaches Bild mit nachlassendem institutionellem Momentum — passt zur Fear-Stimmung, ohne klaren bullischen Katalysator.",
      analysis:
        "Der Fear&Greed-Wert von 28 deckt sich mit den Schlagzeilen: BTC unter Druck, dünne ETF-Zuflüsse, Käufe pausiert. Deine hohen ETH/BTC-Signale könnten eine antizyklische Chance andeuten, falls sich die Lage stabilisiert — stehen aber im Kontrast zur schwachen Nachrichtenlage. Risiken: Übergreifen des AI-Selloffs und die Sicherheitsvorfälle. Chancen eher strukturell (CBDC, Stablecoin-Adoption). Insgesamt mixed-bis-bearish, kein kurzfristiger Trendwechsel erkennbar.",
    },
  });
}

// Kleiner deterministischer Zufall (LCG) — gleiche Charts bei jedem Render.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

const BASE: Record<string, number> = {
  BTC: 64500, ETH: 1860, SOL: 76, XRP: 1.09, BONK: 0.0000028, BCH: 221,
};

export function demoKlines(symbol: string, interval: Interval): Promise<KlineRow[]> {
  const base = BASE[symbol] ?? 100;
  const n = interval === "1d" ? 90 : interval === "4h" ? 120 : 96;
  const stepMs = interval === "1d" ? 86_400_000 : interval === "4h" ? 14_400_000 : 3_600_000;
  const r = rng(symbol.length * 7919 + interval.length * 104729);
  const rows: KlineRow[] = [];
  let price = base * 0.94;
  const start = Date.now() - n * stepMs;
  for (let i = 0; i < n; i++) {
    const drift = (r() - 0.48) * base * 0.012;
    const open = price;
    const close = Math.max(base * 0.7, open + drift);
    const high = Math.max(open, close) * (1 + r() * 0.006);
    const low = Math.min(open, close) * (1 - r() * 0.006);
    rows.push({
      open_time: new Date(start + i * stepMs).toISOString(),
      open, high, low, close,
      volume: 100 + r() * 900,
    });
    price = close;
  }
  return Promise.resolve(rows);
}

const now = Date.now();
const iso = (minAgo: number) => new Date(now - minAgo * 60_000).toISOString();

// Kanonische Demo-Antwort des Backtests (Werte an einen echten Lauf angelehnt).
export function demoBacktest(lev: number): Promise<BacktestResponse> {
  const over = lev > 22;
  const liqWarn = `Bei ${lev}x liegt die Liquidation VOR dem Stop-Loss — der Stop greift nie. Max. sinnvoller Hebel fuer dieses Setup: ~22x.`;
  const openWarn = "Position am Ende noch offen — zum letzten Schlusskurs bewertet.";
  return Promise.resolve({
    ok: true,
    symbol: "ETH",
    interval: "1h",
    leverage: lev,
    liquidation_price: Number((1867 * (1 - 0.95 / lev)).toFixed(2)),
    max_viable_leverage: 22,
    train: {
      candles: 70, trades: over ? 1 : 0, wins: 0, losses: over ? 1 : 0,
      liquidations: over ? 1 : 0, openAtEnd: true, hitRatePct: over ? 0 : null,
      pnlPct: over ? -100 : -1.5 * lev, buyHoldPct: -1.52,
      maxDrawdownPct: over ? 100 : Math.min(100, 5.8 * lev),
      warnings: over ? [liqWarn, openWarn] : [openWarn],
    },
    test: {
      candles: 48, trades: 0, wins: 0, losses: 0, liquidations: 0,
      openAtEnd: true, hitRatePct: null, pnlPct: Number((0.37 * lev).toFixed(2)),
      buyHoldPct: 0.81, maxDrawdownPct: Math.min(100, Number((0.68 * lev).toFixed(2))),
      warnings: over ? [liqWarn, openWarn] : [openWarn],
    },
    hint: "⚠️ Backtest ≠ Vorhersage: zeigt nur, wie sich die Mechanik in der Vergangenheit verhalten haette.",
  });
}

const demoProposals: ProposalRow[] = [
  {
    id: 2,
    asset_symbol: "ETH",
    entry_zone: "1855–1880",
    stop_loss: 1790,
    take_profit: 1975,
    position_size_pct: 1.5,
    confidence: 0.42,
    rationale:
      "Volumen-Bestätigung vorhanden (1.0), Mentions-Momentum positiv (+8 Delta), leicht positiver Preis-Trend (+1.4% 24h). Setup passt in ein enges Long-Fenster mit moderatem Risiko.",
    counterpoints:
      "Sentiment neutral (0) — kein echter Frühindikator. Nur 26 Mentions absolut = dünne Datenbasis. Fear-Index bei 28 mahnt zur Vorsicht, Ausbruch könnte Fehlsignal sein.",
    sonar_score: 0.3839,
    status: "proposed",
    origin: "claude",
    model: "claude-sonnet-5",
    created_at: iso(22),
  },
  {
    id: 1,
    asset_symbol: "BTC",
    entry_zone: "≈ 64510",
    stop_loss: 59349,
    take_profit: 74831,
    position_size_pct: 1.3,
    confidence: 0.44,
    rationale: "SonarScore 0.424; Volumen bestätigt (vc 1.00)",
    counterpoints:
      "Kein Mentions-Momentum; Sentiment leicht bearish (−0.30); Gesamtmarkt in Fear — nur Vorschlag, du bestätigst manuell.",
    sonar_score: 0.4242,
    status: "proposed",
    origin: "rules",
    model: null,
    created_at: iso(160),
  },
];

export const DEMO_DATA: DashboardData = {
  leaderboard: [
    { asset_symbol: "BTC", sonar_score: 0.4242, run_at: iso(9), components_json: { mentions_momentum: 0.07, sentiment_polarity: -0.3, price_momentum: 0.06, volume_confirmation: 1, hype_penalty: 0, has_volume: true, inputs: { price: 64512, price_change_24h: 1.1, volume_24h: 1.4e10, mentions: 50 } } },
    { asset_symbol: "ETH", sonar_score: 0.3839, run_at: iso(9), components_json: { mentions_momentum: 0.09, sentiment_polarity: 0, price_momentum: 0.07, volume_confirmation: 1, hype_penalty: 0, has_volume: true, inputs: { price: 1857, price_change_24h: 1.4, volume_24h: 4.2e9, mentions: 26 } } },
    { asset_symbol: "XRP", sonar_score: 0.2403, run_at: iso(9), components_json: { mentions_momentum: -0.12, sentiment_polarity: 0.07, price_momentum: 0.03, volume_confirmation: 0.95, hype_penalty: 0, has_volume: true, inputs: { price: 1.087, price_change_24h: -0.2, volume_24h: 5.2e8, mentions: 9 } } },
    { asset_symbol: "SOL", sonar_score: 0.1922, run_at: iso(9), components_json: { mentions_momentum: 0.02, sentiment_polarity: -0.4, price_momentum: 0.01, volume_confirmation: 0.96, hype_penalty: 0, has_volume: true, inputs: { price: 75.3, price_change_24h: 0.1, volume_24h: 6.7e8, mentions: 12 } } },
    { asset_symbol: "MSTR", sonar_score: 0.0777, run_at: iso(9), components_json: { mentions_momentum: 0.7, sentiment_polarity: 0, price_momentum: 0, volume_confirmation: 0, hype_penalty: 0.35, has_volume: false, inputs: { price: null, mentions: 31 } } },
  ],
  proposals: demoProposals,
  paperStats: { trades: 6, open: 6, wins: 0, losses: 0, expired: 0, avg_pnl_pct: null, realized_equity_pct: null },
  equity: Array.from({ length: 16 }, (_, i) => ({
    run_at: iso((16 - i) * 60),
    equity: 10000 + Math.sin(i / 3) * 28 + i * 4,
    realized_pct: 0,
    unrealized_pct: Math.sin(i / 3) * 0.4,
    open_count: 6,
    closed_count: 0,
  })),
  trades: [
    { id: 3, asset_symbol: "ETH", entry_price: 1857.5, stop_loss: 1697, take_profit: 2140, position_size_pct: 1.99, opened_at: iso(1100), status: "open", closed_at: null, close_price: null, pnl_pct: null },
    { id: 5, asset_symbol: "BTC", entry_price: 64512, stop_loss: 59096, take_profit: 74513, position_size_pct: 1.32, opened_at: iso(1100), status: "open", closed_at: null, close_price: null, pnl_pct: null },
    { id: 1, asset_symbol: "SOL", entry_price: 75.29, stop_loss: 69.04, take_profit: 87.05, position_size_pct: 0.54, opened_at: iso(1100), status: "open", closed_at: null, close_price: null, pnl_pct: null },
  ],
  lastCloses: { ETH: 1868.2, BTC: 64890, SOL: 75.9 },
  fearGreed: { value: 28, classification: "Fear", captured_at: iso(300) },
  sentiment: { withSentiment: 3, scored: 8, stillRuns: 0 },
  news: [
    { title: "Bitcoin steadies near $64.5K as ETF inflows resume", url: "#", source: "coindesk", published_at: iso(35), captured_at: iso(30) },
    { title: "Ethereum devs schedule next upgrade — staking withdrawals surge", url: "#", source: "cointelegraph", published_at: iso(70), captured_at: iso(60) },
    { title: "XRP slips after exchange delisting rumor, analysts see support", url: "#", source: "decrypt", published_at: iso(95), captured_at: iso(90) },
    { title: "Solana network activity cools, fees drop to monthly low", url: "#", source: "coindesk", published_at: iso(130), captured_at: iso(120) },
    { title: "Traders eye 'buy the dip' setups as fear index hits 28", url: "#", source: "cointelegraph", published_at: iso(170), captured_at: iso(150) },
  ],
  sentimentRows: [
    { asset_symbol: "BTC", source: "sentiment_llm", sentiment_score: -0.3, captured_at: iso(12) },
    { asset_symbol: "SOL", source: "sentiment_llm", sentiment_score: -0.4, captured_at: iso(12) },
    { asset_symbol: "XRP", source: "sentiment_lexicon", sentiment_score: 0.33, captured_at: iso(12) },
    { asset_symbol: "XRP", source: "sentiment_llm", sentiment_score: -0.2, captured_at: iso(12) },
  ],
  universe: ["BTC", "ETH", "XRP", "SOL", "BONK", "BCH", "DOGE", "ADA"],
  lastIngestAt: iso(14),
  fetchedAt: new Date(now).toISOString(),
};
