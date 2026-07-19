import type { ReactNode } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { heat } from "../lib/heat";
import type { Contact } from "../types";
import { fmtNum, fmtPrice, timeAgo } from "../format";

// Signal-Karte (Motion-Layer aus der Chat-Session, portiert):
// Spring-Press, Expand mit gestaggertem Blur-In. Statt des alten Grid-Panels
// zeigt die Karte den juengsten VORSCHLAG (Einstieg/SL/TP, Konfidenz,
// Gegenargumente). Pionex-Pill wurde ersatzlos gestrichen (Vorgabe).

interface Props {
  contact: Contact;
  expanded: boolean;
  onToggle: () => void;
}

const reveal: Variants = {
  hidden: { opacity: 0, y: 6, filter: "blur(6px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)" },
};

function Pill({ tone, children }: { tone?: "ok" | "flag"; children: ReactNode }) {
  return <span className={`scope-pill ${tone ?? ""}`}>{children}</span>;
}

// Signierte Komponente (-1..1) bzw. Anteil (0..1) als Balken 0..100 %.
function CompBar({
  label,
  value,
  signed,
  color,
}: {
  label: string;
  value: number | null | undefined;
  signed: boolean;
  color: string;
}) {
  const v = value ?? 0;
  const width = Math.min(100, Math.abs(v) * 100);
  const barColor = signed && v < 0 ? "var(--neg)" : color;
  return (
    <motion.div variants={reveal}>
      <div className="compbar-head">
        <span>{label}</span>
        <b style={{ color: signed && v < 0 ? "var(--neg)" : undefined }}>
          {value == null ? "—" : fmtNum(v, 2)}
        </b>
      </div>
      <div className="compbar-track">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${width}%` }}
          transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1], delay: 0.1 }}
          className="compbar-fill"
          style={{ background: barColor }}
        />
      </div>
    </motion.div>
  );
}

function ProposalPanel({ c }: { c: Contact }) {
  const p = c.proposal;
  if (!p) {
    return (
      <div className="scope-proposal muted small">
        Kein aktiver Vorschlag für dieses Symbol — <code>judge</code> oder{" "}
        <code>generate_proposals()</code> erzeugen neue.
      </div>
    );
  }
  return (
    <div className="scope-proposal">
      <div className="scope-proposal-head">
        <span className="scope-title small-title">VORSCHLAG</span>
        <span className="scope-sub">
          {p.origin === "claude" ? `🤖 ${p.model ?? "Claude"}` : "Regelwerk"} · {timeAgo(p.created_at)}
        </span>
      </div>
      <div className="scope-cells">
        <div className="scope-cell">
          <span className="label">Einstieg</span>
          <strong>{p.entry_zone ?? "–"}</strong>
        </div>
        <div className="scope-cell">
          <span className="label">Stop</span>
          <strong className="neg">{fmtPrice(p.stop_loss)}</strong>
        </div>
        <div className="scope-cell">
          <span className="label">TP</span>
          <strong className="pos">{fmtPrice(p.take_profit)}</strong>
        </div>
        <div className="scope-cell">
          <span className="label">Größe</span>
          <strong>{fmtNum(p.position_size_pct, 2)} %</strong>
        </div>
      </div>
      {p.confidence != null && (
        <div className="conf" title={`Konfidenz ${Math.round(p.confidence * 100)} %`}>
          <motion.div
            className="conf-fill"
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, p.confidence * 100)}%` }}
            transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
          />
        </div>
      )}
      {p.rationale && <p className="small" style={{ marginTop: 8 }}>{p.rationale}</p>}
      {p.counterpoints && (
        <p className="small muted" style={{ marginTop: 6 }}>
          <span className="label neg">Gegenargumente</span> {p.counterpoints}
        </p>
      )}
      <p className="small muted" style={{ marginTop: 6 }}>
        Nur Vorschlag, kein Finanzrat — du entscheidest manuell.
      </p>
    </div>
  );
}

export function ContactCard({ contact: c, expanded, onToggle }: Props) {
  const col = heat(c.strength);

  return (
    <motion.div layout className="scope-card">
      <motion.button
        layout
        onClick={onToggle}
        whileTap={{ scale: 0.985 }}
        transition={{ type: "spring", stiffness: 600, damping: 20 }}
        className="scope-card-btn"
      >
        <div className="scope-card-sym">
          {c.symbol}
          <small>CRYPTO</small>
        </div>

        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {c.hasVolume ? <Pill tone="ok">volume ok</Pill> : <Pill tone="flag">no volume</Pill>}
            {(c.components.hype_penalty ?? 0) > 0 && <Pill tone="flag">hype flag</Pill>}
            {c.proposal && <Pill tone="ok">vorschlag</Pill>}
          </div>
          <div className="scope-strength">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${c.strength}%` }}
              transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
              style={{ height: "100%", borderRadius: 3, background: col }}
            />
          </div>
        </div>

        <div className="scope-card-score" style={{ color: col }}>
          {fmtNum(c.score, 3)}
          <small>SONARSCORE</small>
        </div>
      </motion.button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.section
            key="detail"
            layout
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
            style={{ overflow: "hidden" }}
          >
            <motion.div
              initial="hidden"
              animate="visible"
              variants={{ visible: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } } }}
              className="scope-detail"
            >
              <div className="scope-comps">
                <CompBar label="Mentions Momentum" value={c.components.mentions_momentum} signed color={col} />
                <CompBar label="Sentiment Polarity" value={c.components.sentiment_polarity} signed color={col} />
                <CompBar label="Price Momentum" value={c.components.price_momentum} signed color={col} />
                <CompBar label="Volume Confirmation" value={c.components.volume_confirmation} signed={false} color={col} />
                {(c.components.hype_penalty ?? 0) > 0 && (
                  <CompBar label="Hype Penalty" value={-(c.components.hype_penalty ?? 0)} signed color={col} />
                )}
              </div>
              <motion.div variants={reveal}>
                <ProposalPanel c={c} />
              </motion.div>
            </motion.div>
          </motion.section>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
