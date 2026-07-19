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

export interface DashboardData {
  leaderboard: LeaderboardRow[];
  proposals: ProposalRow[];
  paperStats: PaperStats | null;
  equity: PaperEquityRow[];
  trades: PaperTradeRow[];
  lastCloses: Record<string, number>;
  fearGreed: FearGreed | null;
  lastIngestAt: string | null;
  fetchedAt: string;
}
