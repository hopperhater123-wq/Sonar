import { memo, useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { heat } from "../lib/heat";
import type { Contact } from "../types";

// Sonar-Sweep-Scope (Motion-Layer aus der Chat-Session, portiert auf Live-Daten).
// Blip-Geometrie aus der Signalstaerke: staerker -> naeher zur Mitte, groesser,
// heisser. Der Scope bleibt in beiden Themes bewusst dunkel — ein Radar ist dunkel.
// prefers-reduced-motion: Sweep + Ping-Aufleuchten aus.

interface Props {
  contacts: Contact[];
  selected: number;
  onSelect: (i: number) => void;
}

interface Geo {
  x: number;
  y: number;
  size: number;
  color: string;
  angle: number; // Grad, 0..360
}

function geometry(contacts: Contact[]): Geo[] {
  return contacts.map((c, i) => {
    const angleDeg = -58 + i * 47;
    const rad = (angleDeg * Math.PI) / 180;
    const radius = 46 - (c.strength / 100) * 33;
    return {
      x: 50 + Math.cos(rad) * radius,
      y: 50 + Math.sin(rad) * radius,
      size: 7 + (c.strength / 100) * 13,
      color: heat(c.strength),
      angle: ((angleDeg % 360) + 360) % 360,
    };
  });
}

// memo: der animierte Scope (rAF + Framer-Blips) haengt nur an contacts/selected,
// nicht am Hebel — sonst wuerde jeder Regler-Tick die Animation neu aufsetzen.
export const ScoreScope = memo(function ScoreScope({ contacts, selected, onSelect }: Props) {
  const geo = useMemo(() => geometry(contacts), [contacts]);
  const sweepRef = useRef<HTMLDivElement>(null);
  const dotRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Ambienter Sweep + "Ping"-Aufleuchten, wenn der Strahl einen Blip passiert.
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const start = performance.now();
    const period = 6000;
    const loop = (now: number) => {
      const angle = (((now - start) / period) * 360) % 360;
      if (sweepRef.current) sweepRef.current.style.transform = `rotate(${angle}deg)`;
      geo.forEach((g, i) => {
        const el = dotRefs.current[i];
        if (!el) return;
        const diff = Math.abs(((angle - g.angle + 540) % 360) - 180);
        if (diff < 16) {
          const boost = 1 - diff / 16;
          el.style.boxShadow = `0 0 ${10 + boost * 16}px ${g.color}, 0 0 ${4 + boost * 8}px ${g.color}`;
          el.style.filter = `brightness(${1 + boost * 0.9})`;
        } else {
          el.style.boxShadow = `0 0 10px ${g.color}88, 0 0 4px ${g.color}`;
          el.style.filter = "brightness(1)";
        }
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [geo]);

  return (
    <div className="scope-shell">
      <div className="scope-head">
        <span className="scope-title">SIGNAL SCOPE</span>
        <span className="scope-sub">RANGE · SONARSCORE</span>
      </div>

      <div className="scope-dish">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0 }}>
          <g fill="none" stroke="rgba(56,225,208,0.14)" strokeWidth="0.3">
            <circle cx="50" cy="50" r="48" />
            <circle cx="50" cy="50" r="34" />
            <circle cx="50" cy="50" r="20" />
            <circle cx="50" cy="50" r="7" />
            <line x1="2" y1="50" x2="98" y2="50" />
            <line x1="50" y1="2" x2="50" y2="98" />
          </g>
        </svg>

        <div
          ref={sweepRef}
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            transformOrigin: "50% 50%",
            willChange: "transform",
            background:
              "conic-gradient(from 0deg, rgba(56,225,208,.34) 0deg, rgba(56,225,208,.10) 26deg, rgba(56,225,208,0) 64deg, rgba(56,225,208,0) 360deg)",
          }}
        />

        <motion.div
          style={{ position: "absolute", inset: 0 }}
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.13, delayChildren: 0.5 } } }}
        >
          {geo.map((g, i) => (
            <div
              key={contacts[i].symbol}
              style={{ position: "absolute", left: `${g.x}%`, top: `${g.y}%`, transform: "translate(-50%,-50%)" }}
            >
              <motion.div
                variants={{ hidden: { scale: 0, opacity: 0 }, visible: { scale: 1, opacity: 1 } }}
                transition={{ type: "spring", stiffness: 500, damping: 18 }}
                onClick={() => onSelect(i)}
                style={{ width: g.size, height: g.size, cursor: "pointer", position: "relative" }}
              >
                <div
                  ref={(el) => {
                    dotRefs.current[i] = el;
                  }}
                  style={{
                    width: "100%",
                    height: "100%",
                    borderRadius: "50%",
                    background: g.color,
                    boxShadow: `0 0 10px ${g.color}88, 0 0 4px ${g.color}`,
                  }}
                />
                {selected === i && (
                  <span style={{ position: "absolute", inset: -5, borderRadius: "50%", border: `1px solid ${g.color}` }} />
                )}
                <span className={`scope-label ${selected === i ? "on" : ""}`}>{contacts[i].symbol}</span>
              </motion.div>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
});
