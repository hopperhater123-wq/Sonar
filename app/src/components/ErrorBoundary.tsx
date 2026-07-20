import { Component, type ErrorInfo, type ReactNode } from "react";

// Fangnetz gegen den "schwarzen Bildschirm": ein Render-Fehler in irgendeinem
// Dashboard-Teil wuerde sonst den GESAMTEN Baum abwerfen (React unmountet ->
// nur Hintergrund bleibt). Hier zeigen wir stattdessen die konkrete Meldung an
// — bedienbar, abfotografierbar, und der Rest der App bleibt am Leben.

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Sonar UI-Fehler:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="shell">
          <div className="error-box" style={{ margin: "24px 0" }}>
            <strong>Etwas ist beim Anzeigen schiefgelaufen.</strong>
            <div
              className="small"
              style={{ marginTop: 8, fontFamily: '"JetBrains Mono", monospace', whiteSpace: "pre-wrap", wordBreak: "break-word" }}
            >
              {this.state.error.message}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button onClick={() => location.reload()}>Neu laden</button>
              <button
                className="ghost"
                onClick={() => {
                  try {
                    localStorage.clear();
                  } catch { /* egal */ }
                  location.reload();
                }}
                title="Lokale Einstellungen zurücksetzen und neu laden"
              >
                Zurücksetzen &amp; neu laden
              </button>
            </div>
            <p className="muted small" style={{ marginTop: 12 }}>
              Bitte diese Meldung abfotografieren — damit lässt sich die Ursache exakt finden.
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
