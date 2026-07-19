-- Sonar — Ticker-Praezision (Datenbefunde 19.07. nach LLM-Entkopplung).
--
-- Das breitere Sentiment-Netz legte Kollisionen der Ticker-Erkennung offen:
-- englische News-Woerter/Kuerzel trafen Low-Cap-Symbole (ETF, FTX, CORE, BET,
-- BANK, HYPE, GPT). Die Extraktion selbst wird im Code per Stopwort-Guard
-- gefixt (sentiment/lib/lexicon.ts) + Universum auf scorefaehige Symbole
-- begrenzt (sentiment/index.ts).
--
-- Hier zusaetzlich: GPT aus dem SCORING ausschliessen. Dessen ApeWisdom-
-- "Mentions" stammen praktisch sicher aus ChatGPT-Chatter, nicht vom Token —
-- gleiche Kalibrier-Logik wie der Stablecoin-/Wrapped-Ausschluss (0005).
insert into public.score_exclude (symbol, reason) values
  ('GPT', 'ticker-kollision: ChatGPT-Rauschen in Mentions')
on conflict (symbol) do nothing;
