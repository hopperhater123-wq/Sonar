import { type FormEvent, useEffect, useState } from "react";
import { supabase } from "../supabase";

// Passwort-Login als Standard: zuverlässig, ohne Mailer. Das Konto legst du
// EINMALIG selbst im Supabase-Dashboard an (Authentication → Users → "Add user",
// Haken bei "Auto Confirm User") — so kommt kein Passwort je durch Dritte.
// Magic-Link bleibt als Fallback, ist aber fragil: der built-in Mailer schafft
// nur ~2 Mails/Stunde und Mail-Scanner entwerten Einmal-Links gern vorab.
export function Login() {
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [email, setEmail] = useState("hopperhater123@gmail.com");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fehler aus dem Magic-Link-Redirect sichtbar machen (z.B. otp_expired) —
  // vorher landete man wortlos wieder auf dem Login.
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const desc = hash.get("error_description") ?? hash.get("error_code");
    if (desc) {
      setError(`Login-Link fehlgeschlagen: ${desc.replace(/\+/g, " ")}`);
      history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    if (mode === "password") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } else {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) setError(error.message);
      else setSent(true);
    }
    setBusy(false);
  }

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <h1>🛰️ Sonar</h1>
        <p className="muted">Privates Signal- &amp; Analyse-Dashboard.</p>
        <div className="mode-row">
          <button
            type="button"
            className={mode === "password" ? "" : "ghost"}
            onClick={() => setMode("password")}
          >
            Passwort
          </button>
          <button
            type="button"
            className={mode === "magic" ? "" : "ghost"}
            onClick={() => setMode("magic")}
          >
            Magic-Link
          </button>
        </div>
        {sent && mode === "magic" ? (
          <p className="ok-box">
            Link verschickt an <strong>{email}</strong> — Postfach öffnen und den
            NEUESTEN Link klicken (ältere sind entwertet).
          </p>
        ) : (
          <form onSubmit={submit}>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="E-Mail"
              autoComplete="email"
            />
            {mode === "password" && (
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Passwort"
                autoComplete="current-password"
              />
            )}
            <button type="submit" disabled={busy}>
              {busy ? "…" : mode === "password" ? "Login" : "Login-Link senden"}
            </button>
          </form>
        )}
        {mode === "password" && (
          <p className="muted small">
            Noch kein Konto? Einmalig im Supabase-Dashboard anlegen: Authentication
            → Users → <em>Add user</em> (E-Mail + eigenes Passwort, Haken bei
            <em> Auto Confirm User</em>).
          </p>
        )}
        {error && <div className="error-box">{error}</div>}
      </div>
    </div>
  );
}
