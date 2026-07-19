// Row-Typen — Spiegel der Supabase-Tabellen/Views (nur gelesene Felder).

export interface ComponentsJson {
  mentions_momentum: number;
  mentions_momentum_raw?: number;
  confidence?: number;
  sentiment_polarity: number;
  price_momentum: number;
  volume_confirmation: number;
  has_volume?: boolean;
  hype_penalty: number;
  raw?: number;
  fear_greed?: number | null;
  fg_factor?: number;
  inputs?: {
    mentions?: number | null;
    mentions_delta?: number | null;
    price?: number | null;
    price_change_24h?: number | null;
    volume_24h?: number | null;
    price_source?: string | null;
  };
}

export interface LeaderboardRow {
  asset_symbol: string;
  sonar_score: number;
  components_json: ComponentsJson;
  run_at: string;
}

export interface ProposalRow {
  id: number;
  asset_symbol: string;
  entry_zone: string | null;
  stop_loss: number | null;
  take_profit: number | null;
  position_size_pct: number | null;
  confidence: number | null;
  rationale: string | null;
  counterpoints: string | null;
  sonar_score: number | null;
  status: string;
  origin?: string | null;
  model?: string | null;
  created_at: string;
}

export interface PaperStats {
  trades: number;
  open: number;
  wins: number;
  losses: number;
  expired: number;
  avg_pnl_pct: number | null;
  realized_equity_pct: number | null;
}

export interface PaperEquityRow {
  run_at: string;
  equity: number;
  realized_pct: number;
  unrealized_pct: number;
  open_count: number;
  closed_count: number;
}

export interface PaperTradeRow {
  id: number;
  asset_symbol: string;
  entry_price: number;
  stop_loss: number | null;
  take_profit: number | null;
  position_size_pct: number;
  opened_at: string;
  status: string;
  closed_at: string | null;
  close_price: number | null;
  pnl_pct: number | null;
}

export interface FearGreed {
  value: number;
  classification: string | null;
  captured_at: string;
}

export interface SentimentCoverage {
  withSentiment: number; // Symbole mit sp != 0 im juengsten Lauf
  scored: number; // insgesamt gescorte Symbole im juengsten Lauf
  stillRuns: number; // Anzahl juengster Laeufe in Folge ganz ohne Sentiment
}

export interface NewsRow {
  title: string;
  url: string;
  source: string;
  published_at: string | null;
  captured_at: string;
}

export interface KlineRow {
  open_time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SentimentSourceRow {
  asset_symbol: string;
  source: string; // sentiment_lexicon | sentiment_llm
  sentiment_score: number;
  captured_at: string;
}

export type Interval = "1h" | "4h" | "1d";

// View-Model fuer den Motion-Layer (ScoreScope + ContactCard):
// ein Leaderboard-Eintrag plus sein juengster Vorschlag.
export interface Contact {
  symbol: string;
  strength: number; // 0..100, normiert fuer Scope-Geometrie und Heat-Farbe
  score: number; // roher sonar_score
  components: ComponentsJson;
  hasVolume: boolean;
  proposal: ProposalRow | null;
}

export interface DashboardData {
  leaderboard: LeaderboardRow[];
  proposals: ProposalRow[];
  paperStats: PaperStats | null;
  equity: PaperEquityRow[];
  trades: PaperTradeRow[];
  lastCloses: Record<string, number>;
  fearGreed: FearGreed | null;
  sentiment: SentimentCoverage | null;
  news: NewsRow[];
  sentimentRows: SentimentSourceRow[];
  universe: string[]; // bekannte Symbole (fuer Ticker-Annotation im Feed)
  lastIngestAt: string | null;
  fetchedAt: string;
}
