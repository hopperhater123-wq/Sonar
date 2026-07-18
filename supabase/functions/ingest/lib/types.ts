// Gemeinsame Typen der Ingestion-Schicht (Sonar, Schicht 1).
// Jeder Adapter normalisiert die Rohantwort einer Quelle in genau diese
// Zeilentypen — "Strukturierte Daten = Source of Truth" (Spec §3).

export type AssetType = "crypto" | "stock";

// -> Tabelle `signals` (Zeitreihe, kein Dedup).
export interface SignalRow {
  asset_symbol: string;
  asset_type: AssetType;
  source: string;
  mentions?: number | null;
  mentions_delta?: number | null;
  sentiment_score?: number | null; // -1 .. +1
  price?: number | null;
  price_change_24h?: number | null; // Prozent
  volume_24h?: number | null;
  captured_at: string; // ISO-8601
}

// -> Tabelle `market_context` (Fear & Greed etc.).
export interface MarketContextRow {
  metric: string; // 'fear_greed'
  value: number; // 0 .. 100
  classification?: string | null;
  source: string;
  captured_at: string;
}

// -> Tabelle `news` (Dedup per url).
export interface NewsRow {
  url: string;
  title: string;
  source: string;
  published_at?: string | null;
  captured_at: string;
}

// -> Tabelle `social_posts` (Dedup per external_id).
export interface SocialPostRow {
  external_id: string; // z. B. Reddit 't3_abc123'
  platform: string; // 'reddit'
  subreddit?: string | null;
  title?: string | null;
  body?: string | null;
  score?: number | null;
  num_comments?: number | null;
  created_at?: string | null;
  captured_at: string;
}

// Rückgabe eines Adapter-Laufs. Ein Adapter darf in mehrere Zieltabellen
// schreiben (z. B. ApeWisdom nur signals, Reddit nur social_posts).
export interface AdapterResult {
  signals?: SignalRow[];
  marketContext?: MarketContextRow[];
  news?: NewsRow[];
  socialPosts?: SocialPostRow[];
}

// Laufkontext, den der Orchestrator jedem Adapter reicht.
export interface RunContext {
  now: Date;
  env: (key: string) => string | undefined;
}

// Einheitliches Adapter-Interface (Spec §3, "Adapter-Layer").
// Fällt eine Quelle weg (Paywall/Rate-Limit), tauscht man nur den Adapter.
export interface SourceAdapter {
  name: string;
  run: (ctx: RunContext) => Promise<AdapterResult>;
}
