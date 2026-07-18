-- Sonar — Schicht 2: SonarScore v1 (Spec §5).
--
-- Aggregiert pro Krypto-Symbol die neuesten Signale über alle Quellen und
-- rechnet einen Trend-Score aus fünf Komponenten:
--   SonarScore = w1·MentionsMomentum + w2·SentimentPolarity + w3·PriceMomentum
--              + w4·VolumeConfirmation − w5·HypePenalty
-- Fear & Greed wirkt als Gesamtfilter (contrarian): Extreme Greed dämpft,
-- Extreme Fear boostet.
--
-- Fokus v1 = KRYPTO (Spec-Entscheidung: beste Gratis-Quellen). Für Aktien
-- fehlt aktuell eine Preis/Volumen-Quelle → bewusst ausgeklammert.
--
-- Wichtiger Datenbefund aus echten Läufen: ApeWisdom liefert Krypto-Ticker mit
-- Suffix (BTC.X), Preisquellen ohne (BTC) → hier per regexp normalisiert, damit
-- Mentions und Volumen desselben Symbols joinen (Pflicht für VolumeConfirmation).

-- ── Konfiguration: Gewichte kalibrierbar ohne Codeänderung ──────────────────
create table if not exists public.score_config (
  id           int primary key default 1,
  w_mentions   double precision not null default 0.30,
  w_sentiment  double precision not null default 0.15,  -- dormant bis Sentiment-Quelle aktiv
  w_price      double precision not null default 0.20,
  w_volume     double precision not null default 0.25,
  w_hype       double precision not null default 0.40,
  fg_strength  double precision not null default 0.5,   -- Stärke des Fear&Greed-Filters
  updated_at   timestamptz not null default now(),
  constraint score_config_singleton check (id = 1)
);
insert into public.score_config (id) values (1) on conflict (id) do nothing;
alter table public.score_config enable row level security;

-- ── Feature-View: neueste Kennzahlen je (normalisiertem) Krypto-Symbol ──────
create or replace view public.symbol_features as
with norm as (
  select
    regexp_replace(upper(asset_symbol), '\.X$', '') as symbol,
    source, mentions, mentions_delta, price, price_change_24h, volume_24h, captured_at
  from public.signals
  where asset_type = 'crypto'
),
-- neuester Mentions-Datensatz je Symbol (Quelle: apewisdom)
mentions_latest as (
  select distinct on (symbol) symbol, mentions, mentions_delta, captured_at
  from norm
  where mentions is not null
  order by symbol, captured_at desc
),
-- neuester Preis/Volumen-Datensatz je Symbol (coingecko/coinpaprika/dexscreener)
price_latest as (
  select distinct on (symbol) symbol, price, price_change_24h, volume_24h, source, captured_at
  from norm
  where price is not null
  order by symbol, captured_at desc
)
select
  coalesce(m.symbol, p.symbol)               as symbol,
  m.mentions, m.mentions_delta,
  p.price, p.price_change_24h, p.volume_24h,
  p.source                                   as price_source,
  greatest(coalesce(m.captured_at, p.captured_at),
           coalesce(p.captured_at, m.captured_at)) as as_of
from mentions_latest m
full outer join price_latest p on m.symbol = p.symbol;

-- ── Scoring-Funktion: schreibt eine Zeile je Kandidat nach `scores` ─────────
create or replace function public.sonar_score_run()
returns integer
language plpgsql
as $fn$
declare
  cfg public.score_config%rowtype;
  fg  double precision;
  n   integer;
  run timestamptz := now();
begin
  select * into cfg from public.score_config where id = 1;
  -- aktuellster Fear & Greed als Gesamtfilter
  select value into fg from public.market_context
    where metric = 'fear_greed' order by captured_at desc limit 1;

  with feat as (
    -- Kandidaten = Symbole mit Erwähnungen (mention-getriebene Entdeckung)
    select * from public.symbol_features where mentions is not null
  ),
  comp as (
    select
      symbol, mentions, mentions_delta, price, price_change_24h, volume_24h, price_source,
      -- MentionsMomentum: 24h-Wachstum (mentions vs. Vortag), gedämpft mit tanh
      tanh(
        case
          when mentions_delta is null then 0
          when (mentions - mentions_delta) <= 0 then case when mentions > 0 then 2 else 0 end
          else mentions_delta::double precision / (mentions - mentions_delta)
        end
      ) as mm,
      -- SentimentPolarity: noch keine Quelle aktiv → 0 (dormant, Reddit/News folgen)
      0::double precision as sp,
      -- PriceMomentum: gedämpfte 24h-Preisänderung (±20% ≈ ±0.76)
      tanh(coalesce(price_change_24h, 0) / 20.0) as pm,
      -- VolumeConfirmation: log-skalierte Volumenstärke [0,1] ($100k→0, $1B→1)
      case
        when volume_24h is null or volume_24h <= 0 then 0
        else least(1, greatest(0, (log(volume_24h::numeric)::double precision - 5) / 4))
      end as vc
    from feat
  ),
  scored as (
    select *,
      -- HypePenalty: viel Mentions-Momentum bei wenig Volumen → künstlicher Hype
      greatest(0, mm) * (1 - vc) as hp
    from comp
  )
  insert into public.scores (asset_symbol, sonar_score, components_json, run_at)
  select
    symbol,
    (1 + (50 - coalesce(fg, 50)) / 100.0 * cfg.fg_strength) *
    (cfg.w_mentions*mm + cfg.w_sentiment*sp + cfg.w_price*pm + cfg.w_volume*vc - cfg.w_hype*hp)
      as sonar_score,
    jsonb_build_object(
      'mentions_momentum',   round(mm::numeric, 4),
      'sentiment_polarity',  round(sp::numeric, 4),
      'price_momentum',      round(pm::numeric, 4),
      'volume_confirmation', round(vc::numeric, 4),
      'hype_penalty',        round(hp::numeric, 4),
      'raw', round((cfg.w_mentions*mm + cfg.w_sentiment*sp + cfg.w_price*pm
                    + cfg.w_volume*vc - cfg.w_hype*hp)::numeric, 4),
      'fear_greed', fg,
      'fg_factor', round((1 + (50 - coalesce(fg,50)) / 100.0 * cfg.fg_strength)::numeric, 4),
      'inputs', jsonb_build_object(
        'mentions', mentions, 'mentions_delta', mentions_delta,
        'price', price, 'price_change_24h', price_change_24h,
        'volume_24h', volume_24h, 'price_source', price_source
      ),
      'weights', jsonb_build_object(
        'mentions', cfg.w_mentions, 'sentiment', cfg.w_sentiment, 'price', cfg.w_price,
        'volume', cfg.w_volume, 'hype', cfg.w_hype
      )
    ),
    run
  from scored;

  get diagnostics n = row_count;
  return n;
end
$fn$;

-- ── Leaderboard: Ergebnis des jüngsten Laufs, Top zuerst ────────────────────
create or replace view public.sonar_leaderboard as
select asset_symbol,
       round(sonar_score::numeric, 4) as sonar_score,
       components_json,
       run_at
from public.scores
where run_at = (select max(run_at) from public.scores)
order by sonar_score desc;

-- ── Zeitplan: Scoring 5 Min nach jedem Ingest (Ingest läuft :00/:30) ────────
create extension if not exists pg_cron;
select cron.schedule('sonar-score', '5,35 * * * *', $$select public.sonar_score_run()$$);
