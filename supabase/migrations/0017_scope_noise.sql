-- Sonar — weiteres ApeWisdom-Rauschen ausschliessen (Datenbefund 19.07., Live-Scope).
--
-- Im Signal-Scope tauchten Symbole auf, deren "Mentions" praktisch sicher
-- Wort-Kollisionen in ApeWisdoms Reddit-Zaehlung sind (IT, OG, ID, SHA, MB, HD
-- = englische Alltagswoerter/Kuerzel) bzw. News-Rauschen ohne handelbares
-- Signal (FTX, kollabierte Boerse). Gleiche Kalibrier-Logik wie 0005/0014.
-- Rueckgaengig machen = eine DELETE-Zeile.
insert into public.score_exclude (symbol, reason) values
  ('IT',  'wort-kollision: apewisdom-rauschen'),
  ('OG',  'wort-kollision: apewisdom-rauschen'),
  ('ID',  'wort-kollision: apewisdom-rauschen'),
  ('SHA', 'wort-kollision: apewisdom-rauschen'),
  ('MB',  'wort-kollision: apewisdom-rauschen'),
  ('HD',  'wort-kollision: apewisdom-rauschen'),
  ('FTX', 'defunkte boerse: news-rauschen, kein handelbares signal')
on conflict (symbol) do nothing;
