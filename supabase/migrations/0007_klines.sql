-- Sonar — Kurshistorie: OHLCV-Kerzen (Chartanzeige jetzt, Backtest später, Spec §13).
-- Befüllt von der Edge Function `klines` (Binance Public API, keyless & kostenlos).

create table if not exists public.klines (
  symbol      text not null,               -- 'BTC', 'ETH', ...
  interval    text not null,               -- '1h', '15m', '1d'
  open_time   timestamptz not null,
  open        double precision not null,
  high        double precision not null,
  low         double precision not null,
  close       double precision not null,
  volume      double precision not null,
  inserted_at timestamptz not null default now(),
  primary key (symbol, interval, open_time)
);
create index if not exists klines_sym_int_time_idx on public.klines (symbol, interval, open_time desc);
alter table public.klines enable row level security;
