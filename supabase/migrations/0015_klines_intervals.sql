-- Sonar — Chart-Daten: 4h- und Tages-Kerzen zusaetzlich zur 1h-Reihe.
-- Fuer die Chart-Ansicht im Dashboard (1h/4h/1d-Umschalter) und spaetere
-- Backtests. Backfill lief manuell (200x 4h ≈ 33 Tage, 120x 1d).
select cron.schedule(
  'sonar-klines-4h',
  '12 */4 * * *',
  $$select net.http_get(
      url := 'https://drwueulymfgfvgslxgay.supabase.co/functions/v1/klines?interval=4h&limit=48',
      timeout_milliseconds := 60000
  )$$
);
select cron.schedule(
  'sonar-klines-1d',
  '18 6 * * *',
  $$select net.http_get(
      url := 'https://drwueulymfgfvgslxgay.supabase.co/functions/v1/klines?interval=1d&limit=30',
      timeout_milliseconds := 60000
  )$$
);
