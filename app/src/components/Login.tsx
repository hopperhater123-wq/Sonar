import { type FormEvent, useState } from "react";
import { supabase } from "../supabase";

// Magic-Link-Login (Supabase Auth, built-in Mailer — wenige Links pro Stunde).
// Kein Passwort im Spiel; der erste Login legt den Account an.
export function Login() {
  const [email, setEmail] = useState("hopperhater123@gmail.com");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <h1>🛰️ Sonar</h1>
        <p className="muted">Privates Signal- &amp; Analyse-Dashboard. Login per Magic-Link.</p>
        {sent ? (
          <p className="ok-box">
            Link verschickt an <strong>{email}</strong> — Postfach öffnen und klicken.
            Der Link führt zurück hierher.
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
            <button type="submit" disabled={busy}>
              {busy ? "sende…" : "Login-Link senden"}
            </button>
          </form>
        )}
        {error && <div className="error-box">{error}</div>}
      </div>
    </div>
  );
}
