-- Sonar — Sentiment-Coverage: messbar machen, WIE VIEL Sentiment ein Score-Lauf
-- ueberhaupt sieht. Motivation (19.07.): Lexikon auf reinen News-Schlagzeilen
-- deckte 0 von 7 Board-Symbolen ab. Diese View zeigt je Score-Lauf, fuer wie
-- viele Symbole SentimentPolarity != 0 war — so wird sichtbar, ob LLM/Reddit
-- die Abdeckung anheben.
--
-- security_invoker: respektiert die RLS von `scores` (nur Eigentuemer liest).

create or replace view public.sentiment_coverage
with (security_invoker = true) as
select
  run_at,
  count(*) as scored,
  count(*) filter (where (components_json->>'sentiment_polarity')::double precision <> 0) as with_sentiment,
  round(avg((components_json->>'sentiment_polarity')::double precision)::numeric, 4) as sp_avg,
  round(
    (count(*) filter (where (components_json->>'sentiment_polarity')::double precision <> 0))::numeric
    / nullif(count(*), 0), 3
  ) as coverage_ratio
from public.scores
group by run_at
order by run_at desc;

grant select on public.sentiment_coverage to anon, authenticated;
