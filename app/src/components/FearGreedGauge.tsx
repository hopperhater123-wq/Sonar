import { motion } from "framer-motion";

// Fear&Greed als kompakter Kopf-Indikator (Motion-Layer aus der Chat-Session).
// Sonars marktweiter Daempfer: Extreme Fear boostet den Score, Extreme Greed daempft.

function classify(v: number): string {
  if (v >= 75) return "Extreme Greed";
  if (v >= 55) return "Greed";
  if (v >= 45) return "Neutral";
  if (v >= 25) return "Fear";
  return "Extreme Fear";
}

export function FearGreedGauge({ value }: { value: number | null }) {
  if (value == null) return null;
  const color =
    value >= 75 ? "#ff5c7a" : value >= 55 ? "#ffc24b" : value >= 45 ? "var(--accent)" : "var(--muted)";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 168 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span className="label">Market F&amp;G</span>
        <span className="num" style={{ fontWeight: 700, fontSize: 15, color }}>
          {value}
        </span>
      </div>
      <div
        style={{
          height: 5,
          borderRadius: 3,
          overflow: "hidden",
          background: "linear-gradient(90deg,#2b4a55,#38e1d0 45%,#ffc24b 72%,#ff5c7a)",
        }}
      >
        <div style={{ position: "relative", height: "100%" }}>
          <motion.div
            initial={{ left: 0 }}
            animate={{ left: `${value}%` }}
            transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
            style={{
              position: "absolute",
              top: -1,
              width: 2,
              height: 7,
              background: "var(--text)",
              boxShadow: "0 0 4px var(--text)",
            }}
          />
        </div>
      </div>
      <span className="label" style={{ color, textAlign: "right" }}>
        {classify(value)}
      </span>
    </div>
  );
}
