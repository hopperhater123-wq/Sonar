-- Sonar — Judge-Vorbereitung (Spec §6): Herkunft der Vorschlaege unterscheidbar.
-- 'rules'  = regelbasierte generate_proposals()
-- 'claude' = Urteils-Schicht (Edge Function `judge`, schreibt echtes Abwaegen)
alter table public.proposals add column if not exists origin text not null default 'rules';
alter table public.proposals add column if not exists model text;
