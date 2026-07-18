-- Sonar — Paper-Trading-Engine (Forward-Test, Spec §13).
--
-- Misst die Qualität der Strategie-Vorschläge OHNE echtes Geld: jeder Vorschlag
-- wird als virtueller Trade gegen die echten Kerzen (public.klines) simuliert.
-- Stop-Loss/Take-Profit werden Kerze für Kerze geprüft (beide in derselben
-- Kerze getroffen → konservativ: Stop zählt). Ergebnis: Trefferquote, PnL,
-- Equity-Kurve — damit wird der SonarScore erstmals messbar.
--
-- WICHTIG (Spec §6): proposals.status bleibt unberührt — die Engine ist ein
-- MESSINSTRUMENT und beobachtet alle Vorschläge, sie „akzeptiert" keine.

create table if not exists public.paper_config (
  id              int primary key default 1 check (id = 1),
  start_equity    double precision not null default 10000,   -- virtuelles Kapital
  max_hold_hours  int not null default 168,                  -- 7 Tage, dann 'expired'
  updated_at      timestamptz not null default now()
);
insert into public.paper_config (id) values (1) on conflict (id) do nothing;

create table if not exists public.paper_trades (
  id                 bigint generated always as identity primary key,
  proposal_id        bigint unique references public.proposals(id),
  asset_symbol       text not null,
  entry_price        double precision not null,   -- Kerzen-Close zum Vorschlagszeitpunkt
  stop_loss          double precision,
  take_profit        double precision,
  position_size_pct  double precision not null,   -- % vom virtuellen Kapital
  opened_at          timestamptz not null,
  status             text not null default 'open'
                       check (status in ('open','stopped','target','expired')),
  closed_at          timestamptz,
  close_price        double precision,
  pnl_pct            double precision,            -- Preis-PnL der Position in %
  equity_impact_pct  double precision             -- Beitrag zum Gesamtkapital in %
);
create index if not exists paper_trades_status_idx on public.paper_trades (status, opened_at);

create table if not exists public.paper_equity (
  id              bigint generated always as identity primary key,
  run_at          timestamptz not null default now(),
  equity          double precision not null,
  realized_pct    double precision,
  unrealized_pct  double precision,
  open_count      int,
  closed_count    int
);

alter table public.paper_config  enable row level security;
alter table public.paper_trades  enable row level security;
alter table public.paper_equity  enable row level security;

-- Öffnet für jeden noch nicht simulierten Vorschlag einen virtuellen Trade.
-- Einstieg = Close der Kerze zum Vorschlagszeitpunkt (ehrlich: kein Blick in
-- die Zukunft). Ohne Kerzendaten für das Symbol wird der Vorschlag übersprungen.
create or replace function public.paper_open_from_proposals()
returns integer
language plpgsql
as $fn$
declare n integer;
begin
  insert into public.paper_trades
    (proposal_id, asset_symbol, entry_price, stop_loss, take_profit, position_size_pct, opened_at)
  select p.id, p.asset_symbol, k.close, p.stop_loss, p.take_profit,
         coalesce(p.position_size_pct, 0), p.created_at
  from public.proposals p
  join lateral (
    select close from public.klines k
    where k.symbol = p.asset_symbol and k.interval = '1h'
      and k.open_time <= p.created_at
    order by k.open_time desc
    limit 1
  ) k on true
  where not exists (select 1 from public.paper_trades t where t.proposal_id = p.id);
  get diagnostics n = row_count;
  return n;
end
$fn$;

-- Prüft offene Trades Kerze für Kerze: Stop / Take-Profit / Zeitablauf.
create or replace function public.paper_evaluate()
returns integer
language plpgsql
as $fn$
declare
  cfg        public.paper_config%rowtype;
  t          record;
  c          record;
  n          integer := 0;
  new_status text;
  exit_p     double precision;
  last_close double precision;
  last_time  timestamptz;
begin
  select * into cfg from public.paper_config where id = 1;

  for t in select * from public.paper_trades where status = 'open' loop
    new_status := null;

    for c in
      select open_time, high, low from public.klines
      where symbol = t.asset_symbol and interval = '1h' and open_time > t.opened_at
      order by open_time
    loop
      if t.stop_loss is not null and c.low <= t.stop_loss then
        new_status := 'stopped'; exit_p := t.stop_loss;
      elsif t.take_profit is not null and c.high >= t.take_profit then
        new_status := 'target'; exit_p := t.take_profit;
      end if;

      if new_status is not null then
        update public.paper_trades set
          status = new_status,
          closed_at = c.open_time + interval '1 hour',
          close_price = exit_p,
          pnl_pct = (exit_p - entry_price) / entry_price * 100,
          equity_impact_pct = (exit_p - entry_price) / entry_price * position_size_pct
        where id = t.id;
        n := n + 1;
        exit;
      end if;
    end loop;

    if new_status is null and now() - t.opened_at > make_interval(hours => cfg.max_hold_hours) then
      select k.close, k.open_time into last_close, last_time
      from public.klines k
      where k.symbol = t.asset_symbol and k.interval = '1h'
      order by k.open_time desc limit 1;

      if last_close is not null then
        update public.paper_trades set
          status = 'expired',
          closed_at = last_time + interval '1 hour',
          close_price = last_close,
          pnl_pct = (last_close - entry_price) / entry_price * 100,
          equity_impact_pct = (last_close - entry_price) / entry_price * position_size_pct
        where id = t.id;
        n := n + 1;
      end if;
    end if;
  end loop;

  return n;
end
$fn$;

-- Ein Takt: öffnen + bewerten + Equity-Snapshot. Läuft stündlich per Cron.
create or replace function public.paper_tick()
returns jsonb
language plpgsql
as $fn$
declare
  cfg      public.paper_config%rowtype;
  opened   integer;
  closed   integer;
  realized double precision;
  unreal   double precision;
begin
  opened := public.paper_open_from_proposals();
  closed := public.paper_evaluate();

  select coalesce(sum(equity_impact_pct), 0) into realized
  from public.paper_trades where status <> 'open';

  select coalesce(sum((k.close - t.entry_price) / t.entry_price * t.position_size_pct), 0)
  into unreal
  from public.paper_trades t
  join lateral (
    select close from public.klines
    where symbol = t.asset_symbol and interval = '1h'
    order by open_time desc limit 1
  ) k on true
  where t.status = 'open';

  select * into cfg from public.paper_config where id = 1;

  insert into public.paper_equity (equity, realized_pct, unrealized_pct, open_count, closed_count)
  values (
    cfg.start_equity * (1 + (realized + unreal) / 100),
    realized, unreal,
    (select count(*) from public.paper_trades where status = 'open'),
    (select count(*) from public.paper_trades where status <> 'open')
  );

  return jsonb_build_object(
    'opened', opened, 'closed', closed,
    'realized_pct', round(realized::numeric, 4),
    'unrealized_pct', round(unreal::numeric, 4)
  );
end
$fn$;

-- Kennzahlen auf einen Blick.
create or replace view public.paper_stats as
select
  count(*)                                          as trades,
  count(*) filter (where status = 'open')           as open,
  count(*) filter (where status = 'target')         as wins,
  count(*) filter (where status = 'stopped')        as losses,
  count(*) filter (where status = 'expired')        as expired,
  round(avg(pnl_pct) filter (where status <> 'open')::numeric, 2)          as avg_pnl_pct,
  round(sum(equity_impact_pct) filter (where status <> 'open')::numeric, 4) as realized_equity_pct
from public.paper_trades;

-- Zeitplan: Kerzen stündlich auffrischen (:10), danach Paper-Takt (:20).
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('sonar-klines', '10 * * * *',
  $$select net.http_get(
      url := 'https://drwueulymfgfvgslxgay.supabase.co/functions/v1/klines?interval=1h&limit=48',
      timeout_milliseconds := 60000)$$);
select cron.schedule('sonar-paper', '20 * * * *', $$select public.paper_tick()$$);
