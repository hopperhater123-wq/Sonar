-- Sonar — Schicht 3, v1: Strategie-Vorschläge (Spec §6/§9).
--
-- Wandelt die Top-Kandidaten des jüngsten Score-Laufs in strukturierte
-- Vorschläge um (KEIN Freitext, Spec §6). v1 ist REGELBASIERT und transparent:
-- Levels aus `strategy_config`, Begründung/Gegenargumente aus den echten
-- Score-Komponenten. Die Claude-Urteils-Schicht (Spec: „Claude via MCP") ist
-- der Aufsatz darauf und folgt separat (braucht Anthropic-Key).
--
-- Kern-Regeln aus der Spec:
--  • Volumen-Bestätigung ist PFLICHT → nur Kandidaten mit has_volume.
--  • Jeder Vorschlag = nur Vorschlag, Status 'proposed', manuelle Bestätigung.
--  • Positionsgröße als % vom Risiko-Budget (Absolutbetrag entscheidest du).

create table if not exists public.proposals (
  id                bigint generated always as identity primary key,
  asset_symbol      text not null,
  entry_zone        text,
  stop_loss         double precision,
  take_profit       double precision,
  position_size_pct double precision,          -- % vom Risiko-Budget
  confidence        double precision,          -- 0 .. 1
  rationale         text,
  counterpoints     text,
  sonar_score       double precision,
  components_json   jsonb,
  status            text not null default 'proposed'
                      check (status in ('proposed','accepted','rejected','expired')),
  created_at        timestamptz not null default now()
);
create index if not exists proposals_status_time_idx on public.proposals (status, created_at desc);
alter table public.proposals enable row level security;

create table if not exists public.strategy_config (
  id               int primary key default 1,
  top_n            int  not null default 6,
  min_score        double precision not null default 0.05,
  stop_pct         double precision not null default 0.08,   -- Stop 8% unter Einstieg
  tp_pct           double precision not null default 0.16,   -- Take-Profit 16% (R:R 2:1)
  max_position_pct double precision not null default 3.0,    -- max % vom Risiko-Budget
  require_volume   boolean not null default true,            -- Volumen-Bestätigung Pflicht
  updated_at       timestamptz not null default now(),
  constraint strategy_config_singleton check (id = 1)
);
insert into public.strategy_config (id) values (1) on conflict (id) do nothing;
alter table public.strategy_config enable row level security;

-- On-demand: erzeugt Vorschläge aus dem jüngsten Leaderboard.
-- Bewusst NICHT per Cron (sonst Vorschlags-Spam) — läuft, wenn du entscheidest.
create or replace function public.generate_proposals()
returns integer
language plpgsql
as $fn$
declare
  cfg public.strategy_config%rowtype;
  n   integer;
  run timestamptz := now();
begin
  select * into cfg from public.strategy_config where id = 1;

  with cand as (
    select asset_symbol as symbol, sonar_score::double precision as score, components_json as c
    from public.sonar_leaderboard
    where sonar_score >= cfg.min_score
      and (not cfg.require_volume or (components_json->>'has_volume')::boolean)
      and (components_json->'inputs'->>'price') is not null
    order by sonar_score desc
    limit cfg.top_n
  ),
  built as (
    select symbol, score, c,
      (c->'inputs'->>'price')::double precision      as price,
      (c->>'volume_confirmation')::double precision  as vc,
      (c->>'mentions_momentum')::double precision    as mm,
      (c->>'mentions_momentum_raw')::double precision as mm_raw,
      (c->>'price_momentum')::double precision       as pm,
      (c->>'confidence')::double precision           as conf
    from cand
  )
  insert into public.proposals
    (asset_symbol, entry_zone, stop_loss, take_profit, position_size_pct,
     confidence, rationale, counterpoints, sonar_score, components_json, status, created_at)
  select
    symbol,
    '≈ ' || price::text,
    round((price * (1 - cfg.stop_pct))::numeric, 8),
    round((price * (1 + cfg.tp_pct))::numeric, 8),
    round((cfg.max_position_pct * least(1, score / 0.30) * greatest(0.2, conf))::numeric, 2),
    round(least(1, score / 0.30)::numeric, 2),
    concat_ws('; ',
      'SonarScore ' || round(score::numeric, 3),
      case when mm_raw > 0.2 then 'Mentions steigend (' || round(mm_raw::numeric, 2) || ')' end,
      case when vc >= 0.5  then 'Volumen bestätigt (vc ' || round(vc::numeric, 2) || ')' end,
      case when pm > 0.05  then 'Preis-Momentum positiv' end
    ),
    concat_ws('; ',
      case when mm <= 0        then 'kein Mentions-Momentum (rückläufig/flach)' end,
      case when pm < -0.05     then 'Preis fällt trotz Mentions (Divergenz)' end,
      case when conf < 0.5     then 'wenige Mentions → niedrige Konfidenz' end,
      'SentimentPolarity noch inaktiv (keine Sentiment-Quelle)',
      'Gesamtmarkt in Extreme Fear — nervös',
      'nur Vorschlag, du bestätigst manuell — kein Finanzrat'
    ),
    score, c, 'proposed', run
  from built;

  get diagnostics n = row_count;
  return n;
end
$fn$;
