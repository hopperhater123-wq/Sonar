-- Sonar — Schicht 1, Teil 2: news + social_posts (deduplizierte Rohdaten).
-- news: Schlagzeilen als Narrativ-Signal (Spec §4). Dedup per URL.
-- social_posts: rohe Posts (z. B. Reddit) für EIGENE Sentiment-Berechnung
--   (Spec §4/§5 "poor man's sentiment"). Dedup per external_id.

create table if not exists public.news (
  id            bigint generated always as identity primary key,
  url           text not null unique,
  title         text not null,
  source        text not null,               -- Feed-Name / Domain
  published_at  timestamptz,
  captured_at   timestamptz not null default now()
);
create index if not exists news_captured_idx on public.news (captured_at desc);

create table if not exists public.social_posts (
  id            bigint generated always as identity primary key,
  external_id   text not null unique,        -- z. B. Reddit-Fullname 't3_abc123'
  platform      text not null,               -- 'reddit'
  subreddit     text,
  title         text,
  body          text,
  score         integer,                     -- Upvotes
  num_comments  integer,
  created_at    timestamptz,                 -- Erstellzeit auf der Plattform
  captured_at   timestamptz not null default now()
);
create index if not exists social_posts_platform_time_idx on public.social_posts (platform, captured_at desc);

alter table public.news         enable row level security;
alter table public.social_posts enable row level security;
