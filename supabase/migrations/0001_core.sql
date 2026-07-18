-- Sonar — Schicht 1, Kern-Tabellen: signals, market_context, scores
-- Datenmodell nach Spec §9. Konvention: additive Migrationen, RLS an,
-- Schreiben nur über die Service-Role (Edge Function). Kein anon-Zugriff.

-- signals: reine ZEITREIHE je (Symbol, Quelle, Zeitpunkt).
-- Kein Dedup — MentionsMomentum/PriceMomentum brauchen die Historie.
create table if not exists public.signals (
  id                bigint generated always as identity primary key,
  asset_symbol      text not null,
  asset_type        text not null check (asset_type in ('crypto', 'stock')),
  source            text not null,               -- 'coingecko' | 'coinpaprika' | 'apewisdom' | ...
  mentions          integer,                     -- Erwähnungen (z. B. ApeWisdom)
  mentions_delta    integer,                     -- Erwähnungen 24h vs. Vortag
  sentiment_score   double precision,            -- -1 .. +1 (falls Quelle liefert)
  price             double precision,
  price_change_24h  double precision,            -- Prozent
  volume_24h        double precision,
  captured_at       timestamptz not null default now(),
  inserted_at       timestamptz not null default now()
);
create index if not exists signals_symbol_time_idx on public.signals (asset_symbol, captured_at desc);
create index if not exists signals_source_time_idx on public.signals (source, captured_at desc);

-- market_context: marktweite Kennzahlen (Fear & Greed als Gesamtfilter, Spec §5).
create table if not exists public.market_context (
  id                bigint generated always as identity primary key,
  metric            text not null,               -- 'fear_greed'
  value             double precision not null,   -- 0 .. 100
  classification    text,                        -- 'Extreme Fear' ... 'Extreme Greed'
  source            text not null,
  captured_at       timestamptz not null default now(),
  inserted_at       timestamptz not null default now()
);
create index if not exists market_context_metric_time_idx on public.market_context (metric, captured_at desc);

-- scores: Ergebnis der Scoring-Schicht (Schicht 2). Hier nur angelegt,
-- damit das Schema vollständig ist; befüllt wird sie von SonarScore v1.
create table if not exists public.scores (
  id                bigint generated always as identity primary key,
  asset_symbol      text not null,
  sonar_score       double precision not null,
  components_json   jsonb,                        -- Breakdown der Teilsignale
  run_at            timestamptz not null default now()
);
create index if not exists scores_symbol_time_idx on public.scores (asset_symbol, run_at desc);

-- RLS: an, ohne Policies. Die Service-Role (Edge Function) umgeht RLS und darf
-- schreiben; anon/authenticated haben KEINEN Zugriff. Lese-Policies fürs
-- spätere Dashboard kommen in einer eigenen Migration.
alter table public.signals        enable row level security;
alter table public.market_context enable row level security;
alter table public.scores         enable row level security;
