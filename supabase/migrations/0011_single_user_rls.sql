-- Sonar — Single-User-RLS: Lesen nur fuer DEN Eigentuemer-Account.
--
-- Befund 19.07.: Supabase-Signups sind standardmaessig offen. Mit den
-- 0010-Policies ("alle authenticated duerfen lesen") koennte sich theoretisch
-- ein Fremder mit URL + Publishable Key selbst registrieren und die Daten
-- lesen — relevant spaetestens beim Vercel-Deploy. Da Sonar ein
-- Ein-Personen-Tool ist (nur Eigengebrauch), binden wir alle Lese-Policies
-- an die Eigentuemer-E-Mail aus dem JWT. Fremd-Signups sehen: nichts.
--
-- Schreiben bleibt weiterhin Service-Role-only (keine Insert/Update-Policies).

do $$
declare
  owner_email constant text := 'hopperhater123@gmail.com';
  t text;
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
      'create policy %I on public.%I for select to authenticated
         using ((select auth.jwt() ->> ''email'') = %L)',
      t || '_read_authenticated', t, owner_email);
  end loop;
end $$;
