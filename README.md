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

## Nächster Schritt

**SonarScore v1** (Schicht 2): pro Symbol über alle Quellen aggregieren
(Mentions von ApeWisdom + Volumen von CoinGecko/Coinpaprika joinen), die fünf
Komponenten aus Spec §5 rechnen (MentionsMomentum, SentimentPolarity,
PriceMomentum, VolumeConfirmation, − HypePenalty), mit Fear & Greed als
Gesamtfilter → `scores`.
