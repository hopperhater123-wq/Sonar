# Sonar — Dashboard (`app/`)

Read-only-Ansicht auf Leaderboard, Strategie-Vorschläge und Paper-Forward-Test.
React + Vite + TypeScript, keine UI-Frameworks.

## Lokal starten

```bash
cd app
npm install
npm run dev        # http://localhost:3000
```

Port 3000 ist Absicht: das ist die Default-„Site URL" der Supabase-Auth, damit
Magic-Link-Redirects ohne Extra-Konfiguration zurück in die App führen.

**Login:** E-Mail eingeben → Magic-Link kommt per Supabase-Auth (built-in
Mailer, nur wenige Links pro Stunde). Der erste Login legt den Account an.

## Sicherheitsmodell

- Das Frontend kennt nur Projekt-URL + Publishable Key — **public by design**,
  keine echten Secrets (Spec §3).
- Daten liefert die DB erst nach Login: RLS-Read-Policies gelten nur für
  `authenticated` (Migration `0010`). Ohne Login: leere Antworten.
- Schreiben kann das Frontend nichts — es existieren keine Insert/Update-Policies.

## Deploy (Vercel)

1. Vercel-Projekt anlegen, **Root Directory: `app/`** (Framework: Vite,
   Build `npm run build`, Output `dist`).
2. Env-Variablen optional (`VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY`) — ohne sie
   greifen die Defaults im Code.
3. **Wichtig:** Supabase Dashboard → Authentication → URL Configuration → die
   Vercel-Domain als Redirect-URL eintragen (sonst führt der Magic-Link auf
   `localhost:3000`).
