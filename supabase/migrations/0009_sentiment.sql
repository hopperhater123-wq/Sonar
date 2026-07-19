-- Sonar — Sentiment-Schicht: SentimentPolarity aktivieren (Spec §5, bisher dormant).
--
-- Neue Edge Function `sentiment` (Cron :03/:33) schreibt eigene Sentiment-Zeilen
-- nach `signals` (source: sentiment_lexicon / sentiment_llm, sentiment_score -1..+1):
--   * Lexikon (keyless, immer): News-Schlagzeilen + social_posts-Titel (sobald
--     Reddit aktiv ist), bei Posts Engagement-gewichtet.
--   * Claude-LLM (optional): nur bei SENTIMENT_LLM_ENABLED=true + ANTHROPIC_API_KEY.
--
-- Hier: sonar_score_run() liest sp statt hartem 0 — neuester Wert je
-- Sentiment-Quelle (48h-Fenster), gemittelt ueber vorhandene Quellen.
-- Ohne Sentiment-Zeilen bleibt sp = 0 → Scores identisch zu vorher (kein
-- stiller Drift). w_sentiment (0.15) steht bereits in score_config und greift
-- jetzt automatisch.

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

  with sent as (
    -- neuester Wert je (Symbol, Sentiment-Quelle) im 48h-Fenster, dann Quellen-Mittel
    select regexp_replace(upper(s.asset_symbol), '\.X$', '') as symbol,
           avg(s.sentiment_score) as sentiment
    from (
      select distinct on (asset_symbol, source) asset_symbol, source, sentiment_score
      from public.signals
      where source in ('sentiment_lexicon', 'sentiment_llm')
        and sentiment_score is not null
        and captured_at > now() - interval '48 hours'
      order by asset_symbol, source, captured_at desc
    ) s
    group by 1
  ),
  feat as (
    select f.*
    from public.symbol_features f
    where f.mentions >= cfg.min_mentions
      and not exists (select 1 from public.score_exclude e where e.symbol = f.symbol)
  ),
  comp as (
    select
      f.symbol, f.mentions, f.mentions_delta, f.price, f.price_change_24h,
      f.volume_24h, f.price_source,
      (f.volume_24h is not null) as has_volume,
      least(1, f.mentions::double precision / nullif(cfg.mention_confidence_at, 0)) as confidence,
      tanh(
        case
          when f.mentions_delta is null then 0
          when (f.mentions - f.mentions_delta) <= 0 then case when f.mentions > 0 then 2 else 0 end
          else f.mentions_delta::double precision / (f.mentions - f.mentions_delta)
        end
      ) as mm_raw,
      -- SentimentPolarity: jetzt aktiv — 0 nur noch als Fallback ohne Daten
      coalesce(st.sentiment, 0) as sp,
      tanh(coalesce(f.price_change_24h, 0) / 20.0) as pm,
      case
        when f.volume_24h is null or f.volume_24h <= 0 then 0
        else least(1, greatest(0, (log(f.volume_24h::numeric)::double precision - 5) / 4))
      end as vc
    from feat f
    left join sent st on st.symbol = f.symbol
  ),
  eff as (
    select *, (mm_raw * confidence) as mm from comp
  ),
  scored as (
    select *,
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

-- Cron: Sentiment 3 Min nach jedem Ingest, 2 Min vor dem Score-Lauf
-- (ingest :00/:30 → sentiment :03/:33 → score :05/:35). Idempotent per Name.
select cron.schedule(
  'sonar-sentiment',
  '3,33 * * * *',
  $$select net.http_get(
      url := 'https://drwueulymfgfvgslxgay.supabase.co/functions/v1/sentiment',
      timeout_milliseconds := 90000
  )$$
);
