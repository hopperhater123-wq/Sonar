# 🛰️ Sonar — Ingestion (Schicht 1)

Privates Signal- & Analyse-Tool. Diese Repo enthält **Schicht 1** aus der
[Sonar-Spec](https://app.notion.com/p/3a1ec04ad98281b1bb7cc5b6b37db847):
liest öffentliche Finanz-Trends aus kostenlosen Quellen und legt sie
normalisiert in Supabase ab. **Ausschließlich Eigengebrauch** (Spec §11).

> Architektur (Spec §3): `[1] INGESTION → [2] SCORING → [3] STRATEGIE → [4] AUSFÜHRUNG`.
> Jede Quelle steckt hinter einem austauschbaren **Adapter**. Fällt eine weg
> (Paywall, Rate-Limit), tauscht man nur den Adapter.

## Quellen (Stand: Schicht 1)

| Adapter | Ziel-Tabelle | Liefert | Key? |
|---|---|---|---|
| `coingecko` | `signals` | Trending-Coins: Preis, Volumen, 24h | keyless |
| `coinpaprika` | `signals` | Top-50 Preis/Volumen (Cross-Check/Fallback) | keyless |
| `dexscreener` | `signals` | Geboostete Frühphase-Token + Liquidität ⚠️ best-effort | keyless |
| `apewisdom` | `signals` | **Mentions + Delta** (Krypto & Aktien) — entblockt Scoring | keyless |
| `alternativeme` | `market_context` | Fear & Greed Index (0–100) | keyless |
| `rss` | `news` | Finanz-Schlagzeilen ⚠️ best-effort | keyless |
| `reddit` | `social_posts` | Rohe Posts für eigene Sentiment-Berechnung | **Creds nötig** |

Bewusst zurückgestellt (jederzeit als Adapter nachrüstbar): CoinMarketCap
(redundant zum Preis), Adanos (nur Aktien, 250 Calls/Monat).

## Datenmodell

- `signals` — Zeitreihe je (Symbol, Quelle, Zeit). **Kein Dedup** (Momentum
  braucht Historie).
- `market_context` — marktweite Kennzahlen (Fear & Greed als Gesamtfilter).
- `news` — Schlagzeilen, dedupliziert per `url`.
- `social_posts` — rohe Posts, dedupliziert per `external_id`.
- `scores` — leer angelegt; befüllt später von SonarScore v1 (Schicht 2).

## Deploy

```bash
# 1) Repo mit Supabase-Projekt verknüpfen
supabase link --project-ref <PROJECT_REF>

# 2) Migrationen anwenden
supabase db push

# 3) Reddit-Secrets setzen (optional — ohne läuft der Rest weiter)
supabase secrets set REDDIT_CLIENT_ID=... REDDIT_CLIENT_SECRET=... \
  REDDIT_USER_AGENT="SonarIngest/0.1 (privat; by u/DEINNAME)"

# 4) Function deployen und einmal auslösen
supabase functions deploy ingest
supabase functions invoke ingest
```

`SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` stellt Supabase der Function
automatisch bereit — nur für lokales `supabase functions serve` in `.env`.

Die Function antwortet mit einer Summary:

```json
{
  "ok": true,
  "durationMs": 1234,
  "counts": { "signals": 115, "marketContext": 1, "news": 60, "socialPosts": 50 },
  "sourceErrors": {}
}
```

## Betrieb (Scheduler & Secrets)

**Scheduler:** läuft bereits im Projekt `drwueulymfgfvgslxgay` — pg_cron ruft
`ingest` alle 30 Minuten auf (Migration `0003_schedule.sql`). Alle Quellen
bleiben dabei bequem in ihren Gratis-Rate-Limits.

```sql
-- Läufe prüfen
select * from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'sonar-ingest')
order by start_time desc limit 10;
```

**Reddit aktivieren** (optional, füllt `social_posts`):
1. App anlegen: https://www.reddit.com/prefs/apps → *create app* → Typ
   `script`, beliebige `redirect uri` (z. B. `http://localhost:8080`).
   `client_id` steht unter dem App-Namen, `secret` daneben.
2. Secrets setzen (kein MCP-Tool dafür — Dashboard oder CLI):
   ```bash
   supabase secrets set \
     REDDIT_CLIENT_ID=... REDDIT_CLIENT_SECRET=... \
     REDDIT_USER_AGENT="SonarIngest/0.1 (privat; by u/DEINNAME)" \
     --project-ref drwueulymfgfvgslxgay
   ```
   Dashboard: *Project → Edge Functions → Secrets*.
3. Ab dem nächsten Lauf zieht Reddit automatisch mit; `reddit` verschwindet
   aus `sourceErrors`.

## Ehrliche Hinweise

- **`rss` und `dexscreener` sind best-effort.** Der erste echte Lauf zeigt die
  realen Feldnamen; bei Abweichung passt man nur den betroffenen Adapter an.
- **`reddit` braucht App-Credentials.** Fehlen sie, erscheint `reddit` in
  `sourceErrors`, alle anderen Quellen laufen normal.
- **Keine Secrets im Frontend / im Repo.** Alles serverseitig (Spec §3).

## Schicht 2 — SonarScore v1 (gebaut)

Reines Postgres (Migrationen `0004`/`0005`), läuft in der DB, per pg_cron 5 Min
nach jedem Ingest (`sonar-score`, `:05/:35`).

- **`symbol_features`** (View): neueste Kennzahlen je Krypto-Symbol, Symbole
  normalisiert (`BTC.X`→`BTC`), Mentions (ApeWisdom) mit Preis/Volumen
  (CoinGecko/Coinpaprika/DexScreener) gejoint.
- **`sonar_score_run()`** (Funktion): rechnet die fünf Komponenten aus Spec §5
  und schreibt nach `scores`.
- **`sonar_leaderboard`** (View): Top-N des jüngsten Laufs.
- **`score_config`** / **`score_exclude`**: Gewichte + Schwellen bzw. Ausschluss
  (Stablecoins/Wrapped) — kalibrierbar ohne Codeänderung.

```
SonarScore = fg_factor · ( w1·MentionsMomentum + w2·SentimentPolarity
                         + w3·PriceMomentum + w4·VolumeConfirmation − w5·HypePenalty )
```

Fear & Greed wirkt contrarian als `fg_factor` (Extreme Greed dämpft, Extreme
Fear boostet). Abfrage: `select * from sonar_leaderboard;`

**Ehrliche Grenzen von v1** (Spec: „Kein Wahrsager"):
- **SentimentPolarity aktiv, aber dünn** (seit `0009`): Lexikon auf
  News-Schlagzeilen, Posts folgen mit Reddit-Creds, LLM optional. Symbole
  ohne Texte bleiben bei sp=0.
- **MentionsMomentum** nutzt ApeWisdoms 24h-Delta, noch nicht den eigenen
  7-Tage-Schnitt — wird schärfer, sobald mehr Historie gesammelt ist.
- **VolumeConfirmation** ist eine Volumen-*Stärke* (log-skaliert), noch kein
  Volumen-*Anstieg* gegen den eigenen Schnitt (braucht Historie).
- **Konfidenz-Dämpfung** bei wenig absoluten Mentions; `has_volume=false` →
  nur halbe HypePenalty (fehlende Daten ≠ flaches Volumen).

## Sentiment-Schicht (gebaut) — füllt SentimentPolarity

Edge Function `sentiment` (Migration `0009`, Cron `:03/:33` — nach Ingest, vor
Score). Zwei Quellen, beide schreiben normale `signals`-Zeilen mit
`sentiment_score` (−1..+1); `sonar_score_run()` nimmt je Quelle den neuesten
Wert im 48h-Fenster und mittelt über vorhandene Quellen:

- **`sentiment_lexicon`** (keyless, läuft immer): Krypto-Lexikon mit Emoji-,
  Phrasen- und Negations-Handling über News-Schlagzeilen und — sobald Reddit
  aktiv ist — Post-Titel (Engagement-gewichtet). Ticker-Extraktion nur gegen
  das bekannte Universum aus `symbol_features` (kein Symbol-Müll).
- **`sentiment_llm`** (optional): Claude Haiku als kontextsensitiver
  Klassifikator (versteht Sarkasmus/Slang). Nur bei
  `SENTIMENT_LLM_ENABLED=true` + `ANTHROPIC_API_KEY` als Function Secrets,
  sonst still.

`w_sentiment` steht in `score_config` (Default 0.15). Ohne Sentiment-Zeilen
ist `sp=0` — Scores wie zuvor, kein stiller Drift.

## Schicht 3 — Strategie-Vorschläge v1 (gebaut)

Migration `0006`. Wandelt die Top-Kandidaten des jüngsten Score-Laufs in
strukturierte Vorschläge (Spec §6): Einstieg, Stop-Loss, Take-Profit,
Positionsgröße (% vom Risiko-Budget), Konfidenz, Begründung, **explizite
Gegenargumente** → Tabelle `proposals`, Status `proposed`.

- **`generate_proposals()`**: on-demand (bewusst nicht per Cron → kein Spam).
  `select public.generate_proposals();` erzeugt Vorschläge; ansehen mit
  `select * from proposals where status='proposed' order by created_at desc;`.
- **`strategy_config`**: `top_n`, `min_score`, `stop_pct`, `tp_pct`,
  `max_position_pct`, `require_volume` — kalibrierbar ohne Code.
- **Volumen-Bestätigung ist Pflicht** (Spec §5): nur Kandidaten mit Volumen
  bekommen einen Vorschlag. Positionsgröße/Konfidenz skalieren mit dem Score.

**v1 ist regelbasiert** (transparent, deterministisch, kein Key). Die
Claude-Urteils-Schicht (Spec: „Claude via MCP" — reichere Begründung, echtes
Abwägen) ist der nächste Aufsatz und braucht einen Anthropic-Key.

## Nächster Schritt

1. **Claude-Urteils-Schicht:** Edge Function reicht Top-N + Kontext an die
   Claude-API → ersetzt die regelbasierte Begründung durch echtes Abwägen.
2. **Historie → Kalibrierung:** Momentum/Volumen auf eigene 7-Tage-Schnitte
   umstellen, Gewichte per Forward-Test kalibrieren (Spec §13).
3. **Mini-Dashboard:** Read-only-Ansicht von `sonar_leaderboard` + `proposals`.
