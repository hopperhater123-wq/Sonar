-- Sonar — Betrieb: geplanter Ingest-Lauf via pg_cron + pg_net.
-- Ruft die Edge Function `ingest` alle 30 Minuten auf. So wächst `signals`
-- als Zeitreihe (Basis für MentionsMomentum/PriceMomentum in Schicht 2).
--
-- HINWEIS: Die URL enthält die Projekt-Ref und ist damit umgebungsspezifisch.
-- Bei neuem Projekt die Ref anpassen. cron.schedule ist idempotent (per Name).

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'sonar-ingest',
  '*/30 * * * *',
  $$select net.http_get(
      url := 'https://drwueulymfgfvgslxgay.supabase.co/functions/v1/ingest',
      timeout_milliseconds := 90000
  )$$
);

-- Deaktivieren:  select cron.unschedule('sonar-ingest');
-- Läufe prüfen:  select * from cron.job_run_details where jobid =
--                  (select jobid from cron.job where jobname = 'sonar-ingest')
--                order by start_time desc limit 10;
