// Heat-Skala aus dem Motion-Layer (Chat-Session), portiert auf die Live-Scores.
// Die Farbe bedeutet Signalstaerke, sie dekoriert nicht.
//
// Live liegen SonarScores grob bei -0.1 .. 0.5 (nicht 0..100 wie im Chat-Code).
// Normierung: 0.5 = "sehr stark" (voll ausgeschlagen). Dieselbe Groessenordnung
// nutzt auch generate_proposals (Konfidenz = score/0.30, gekappt).

export function strengthPct(sonarScore: number): number {
  return Math.max(0, Math.min(1, sonarScore / 0.5)) * 100;
}

export function heat(strength: number): string {
  if (strength >= 75) return "#ff5c7a"; // coral — peak
  if (strength >= 60) return "#ffc24b"; // amber — strong
  if (strength >= 40) return "#38e1d0"; // cyan — mid
  if (strength >= 20) return "#5c93b0"; // steel — weak
  return "#7d8b98"; // slate — noise
}
