// Privates Intro-Panel — Orientierung NACH dem Login (kein oeffentliches
// Schaufenster: Sonar bleibt Eigengebrauch). Erklaert in 20 Sekunden, was das
// Tool ist, in vier Schichten. Beim ersten Besuch offen, dann wegklickbar
// (localStorage), jederzeit ueber das "?" oben wieder aufrufbar.

const LAYERS = [
  { n: "1", t: "Ingestion", d: "Sammelt Trends aus 7 Gratis-Quellen (Preise, Mentions, News, Fear & Greed)." },
  { n: "2", t: "SonarScore", d: "Verrechnet alles zu einer Punktzahl — Volumen ist Pflicht, Hype wird bestraft." },
  { n: "3", t: "Strategie", d: "Macht daraus Vorschläge (Einstieg/Stop/TP) — immer mit Gegenargumenten." },
  { n: "4", t: "Prüfung", d: "Backtest mit Hebel + Paper-Test gegen echte Kerzen. Du entscheidest, nicht der Bot." },
];

export function IntroPanel({ onClose }: { onClose: () => void }) {
  return (
    <section className="card intro-card">
      <button className="intro-close" onClick={onClose} title="Schließen" aria-label="Schließen">
        ✕
      </button>
      <div className="intro-head">
        <span className="ping-dot" aria-hidden="true" />
        <h2 style={{ margin: 0 }}>Was ist Sonar?</h2>
      </div>
      <p className="lead" style={{ margin: "6px 0 4px" }}>
        Dein privates Fernglas für Krypto-Trends: Es hört das Rauschen aus News und Foren ab,
        erkennt Signale und macht dir nachvollziehbare Vorschläge — <strong>die du selbst
        entscheidest</strong>. Kein Autopilot, keine echten Orders, kein Finanzrat.
      </p>
      <div className="intro-layers">
        {LAYERS.map((l) => (
          <div className="intro-layer" key={l.n}>
            <span className="intro-num">{l.n}</span>
            <div>
              <strong>{l.t}</strong>
              <div className="muted small">{l.d}</div>
            </div>
          </div>
        ))}
      </div>
      <p className="muted small" style={{ margin: "10px 0 0" }}>
        Ausschließlich Eigengebrauch · „Signal statt Auto-Execution" · jederzeit über das{" "}
        <strong>?</strong> oben wieder aufrufbar.
      </p>
    </section>
  );
}
