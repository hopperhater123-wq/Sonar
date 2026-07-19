-- Sonar — Proposal-Backtest (Spec §13). Jeder Lauf ein Snapshot.
-- Params/Result als JSONB (Format kann sich weiterentwickeln, ohne Migrationen
-- zu erzwingen — Idee aus dem Chat-Entwurf uebernommen). Neu gegenueber dem
-- Chat-Entwurf: proposal_id-Bezug und leverage als eigene Spalte (Filter),
-- RLS im Single-User-Stil (0011): Lesen nur Eigentuemer, Schreiben Service-Role.

create table if not exists public.backtests (
  id           bigint generated always as identity primary key,
  proposal_id  bigint references public.proposals(id) on delete set null,
  asset_symbol text not null,
  interval     text not null default '1h',
  leverage     double precision not null default 1,
  train_from   timestamptz,
  train_to     timestamptz,
  test_from    timestamptz,
  test_to      timestamptz,
  params       jsonb not null,  -- entry_low/high, stop, tp, fee_pct, liq_buffer, liquidation_price
  result       jsonb not null,  -- { train: SimOutcome, test: SimOutcome, max_viable_leverage }
  created_at   timestamptz not null default now()
);

create index if not exists backtests_symbol_time_idx on public.backtests (asset_symbol, created_at desc);
create index if not exists backtests_proposal_idx on public.backtests (proposal_id, created_at desc);

alter table public.backtests enable row level security;
drop policy if exists "backtests_read_authenticated" on public.backtests;
create policy "backtests_read_authenticated" on public.backtests
  for select to authenticated
  using ((select auth.jwt() ->> 'email') = 'hopperhater123@gmail.com');
