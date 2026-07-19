import { type FormEvent, useEffect, useState } from "react";
import { supabase } from "../supabase";

// Passwort-Login — bewusst der EINZIGE Weg. Der Magic-Link wurde entfernt:
// der built-in Mailer ist auf ~2 Mails/Stunde limitiert und der Bestaetigungs-
// link leitet auf die Supabase-"Site URL" (Default localhost:3000) um und
// laeuft schnell ab — das sorgte wiederholt fuer "Seite nicht erreichbar".
// Das Konto legt man einmalig im Supabase-Dashboard an
// (Authentication -> Users -> Add user, Haken "Auto Confirm User").
export function Login() {
  const [email, setEmail] = useState("hopperhater123@gmail.com");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Falls noch ein alter Magic-Link-Redirect im URL-Hash haengt: sichtbar machen
  // und aufraeumen, statt den Nutzer wortlos auf dem Login zu lassen.
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const desc = hash.get("error_description") ?? hash.get("error_code");
    if (desc) {
      setError(`Alter E-Mail-Link ungültig (${desc.replace(/\+/g, " ")}). Bitte mit Passwort anmelden.`);
      history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError(error.message);
  }

  return (
    <div className="login-wrap">
      <div className="sonar-bg" aria-hidden="true" />
      <div className="card login-card">
        <div className="brand" style={{ marginBottom: 6 }}>
          <span className="ping-dot" aria-hidden="true" />
          <strong>SONAR</strong>
        </div>
        <p className="muted">Privates Signal- &amp; Analyse-Dashboard.</p>
        <form onSubmit={submit}>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-Mail"
            autoComplete="email"
          />
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Passwort"
            autoComplete="current-password"
          />
          <button type="submit" disabled={busy}>
            {busy ? "…" : "Login"}
          </button>
        </form>
        <p className="muted small">
          Kein Konto? Einmalig im Supabase-Dashboard: Authentication → Users →
          <em> Add user</em> (E-Mail + Passwort, Haken <em>Auto Confirm User</em>).
        </p>
        {error && <div className="error-box">{error}</div>}
      </div>
    </div>
  );
}
