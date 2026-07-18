-- Sonar — Schicht 2, v1.1: Kalibrierung nach dem ersten echten Scoring-Lauf.
--
-- Befunde aus echten Daten:
--  (1) Stablecoins/Wrapped (USDT, USDC, WETH, WBTC, PAXG) dominierten die Spitze
--      über Volumen + zufällige Mini-Mentions — keine Trade-Signale.
--  (2) 1–5 Erwähnungen erzeugten instabiles Extrem-Momentum (USDT: 5 → mm≈1.0).
--  (3) Fehlende Volumendaten wurden als Hype missdeutet (AAVE): fehlende Daten
--      sind NICHT dasselbe wie flaches Volumen.

-- (1) Ausschlussliste: keine Trade-Signale.
create table if not exists public.score_exclude (
  symbol text primary key,
  reason text
);
insert into public.score_exclude (symbol, reason) values
  ('USDT','stablecoin'), ('USDC','stablecoin'), ('DAI','stablecoin'),
  ('TUSD','stablecoin'), ('FDUSD','stablecoin'), ('USDS','stablecoin'),
  ('USDE','stablecoin'), ('BUSD','stablecoin'), ('PYUSD','stablecoin'),
  ('GUSD','stablecoin'), ('LUSD','stablecoin'),
  ('WETH','wrapped'), ('WBTC','wrapped'), ('WBETH','wrapped'), ('WEETH','wrapped'),
  ('STETH','wrapped'), ('WSTETH','wrapped'), ('RETH','wrapped'), ('CBBTC','wrapped'),
  ('PAXG','pegged-gold'), ('XAUT','pegged-gold')
on conflict (symbol) do nothing;
alter table public.score_exclude enable row level security;

-- (2)+(3) Konfig erweitern: Mindest-Mentions + Konfidenz-Skala.
alter table public.score_config add column if not exists min_mentions int not null default 2;
alter table public.score_config add column if not exists mention_confidence_at int not null default 10;

-- Neue Scoring-Funktion mit den drei Fixes.
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
  select value into fg from public.market_context
    where metric = 'fear_greed' order by captured_at desc limit 1;

  with feat as (
    select f.*
    from public.symbol_features f
    where f.mentions >= cfg.min_mentions                                   -- (2) Mindest-Mentions
      and not exists (select 1 from public.score_exclude e where e.symbol = f.symbol)  -- (1) Ausschluss
  ),
  comp as (
    select
      symbol, mentions, mentions_delta, price, price_change_24h, volume_24h, price_source,
      (volume_24h is not null) as has_volume,
      -- (2) Konfidenz: dämpft Momentum bei wenig absoluten Mentions
      least(1, mentions::double precision / nullif(cfg.mention_confidence_at, 0)) as confidence,
      tanh(
        case
          when mentions_delta is null then 0
          when (mentions - mentions_delta) <= 0 then case when mentions > 0 then 2 else 0 end
          else mentions_delta::double precision / (mentions - mentions_delta)
        end
      ) as mm_raw,
      0::double precision as sp,
      tanh(coalesce(price_change_24h, 0) / 20.0) as pm,
      case
        when volume_24h is null or volume_24h <= 0 then 0
        else least(1, greatest(0, (log(volume_24h::numeric)::double precision - 5) / 4))
      end as vc
    from feat
  ),
  eff as (
    select *, (mm_raw * confidence) as mm from comp
  ),
  scored as (
    select *,
      -- (3) fehlendes Volumen (has_volume=false) nur halbe HypePenalty:
      --     wir wissen es nicht, statt es als flaches Volumen zu bestrafen.
      greatest(0, mm) * (1 - vc) * (case when has_volume then 1.0 else 0.5 end) as hp
    from eff
  )
  insert into public.scores (asset_symbol, sonar_score, components_json, run_at)
  select
    symbol,
    (1 + (50 - coalesce(fg, 50)) / 100.0 * cfg.fg_strength) *
    (cfg.w_mentions*mm + cfg.w_sentiment*sp + cfg.w_price*pm + cfg.w_volume*vc - cfg.w_hype*hp)
      as sonar_score,
    jsonb_build_object(
      'mentions_momentum',     round(mm::numeric, 4),
      'mentions_momentum_raw', round(mm_raw::numeric, 4),
      'confidence',            round(confidence::numeric, 4),
      'sentiment_polarity',    round(sp::numeric, 4),
      'price_momentum',        round(pm::numeric, 4),
      'volume_confirmation',   round(vc::numeric, 4),
      'has_volume',            has_volume,
      'hype_penalty',          round(hp::numeric, 4),
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
