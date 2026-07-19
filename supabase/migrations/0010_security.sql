-- Sonar — Security-Hardening (Befunde der Supabase-Advisors, 19.07.2026).
--
-- (1) Views auf security_invoker: Zugriffe via PostgREST unterliegen damit der
--     RLS der Basistabellen. Vorher waren die Views SECURITY DEFINER und damit
--     per anon-Key an RLS vorbei lesbar (Advisor: ERROR).
-- (2) Lese-Policies fuer `authenticated` auf allen Datentabellen — Vorarbeit
--     fuers Dashboard (RLS war ueberall an, aber ohne Policy konnte ausser der
--     Service-Role niemand lesen). anon bleibt draussen, Schreiben bleibt
--     Service-Role-only (keine Insert/Update-Policies).
-- (3) search_path der SQL-Funktionen gepinnt (Schutz vor search_path-Hijack;
--     alle Tabellenzugriffe sind ohnehin public-qualifiziert).
--
-- Bewusst NICHT angefasst: Extension pg_net bleibt in `public` (Advisor: WARN).
-- Ein Schema-Umzug riskiert die aktiven net.http_get-Crons — akzeptiert.
--
-- Wirkt NICHT auf den Betrieb: pg_cron laeuft als Tabellen-Owner (postgres,
-- RLS greift nicht), Edge Functions nutzen die Service-Role (BYPASSRLS).

-- ── (1) Views: Rechte des Aufrufers statt des Erstellers ────────────────────
alter view public.symbol_features   set (security_invoker = true);
alter view public.sonar_leaderboard set (security_invoker = true);
alter view public.paper_stats       set (security_invoker = true);

-- ── (2) Read-Policies: authenticated darf lesen, sonst niemand ──────────────
do $$
declare t text;
begin
  foreach t in array array[
    'signals', 'market_context', 'news', 'social_posts', 'scores',
    'klines', 'proposals', 'paper_trades', 'paper_equity',
    'paper_config', 'score_config', 'strategy_config', 'score_exclude'
  ]
  loop
    execute format('drop policy if exists %I on public.%I',
                   t || '_read_authenticated', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t || '_read_authenticated', t);
  end loop;
end $$;

-- ── (3) Funktionen: search_path festnageln ──────────────────────────────────
alter function public.sonar_score_run()           set search_path = public, pg_temp;
alter function public.generate_proposals()        set search_path = public, pg_temp;
alter function public.paper_open_from_proposals() set search_path = public, pg_temp;
alter function public.paper_evaluate()            set search_path = public, pg_temp;
alter function public.paper_tick()                set search_path = public, pg_temp;
