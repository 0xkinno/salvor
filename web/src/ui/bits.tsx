import { motion, useMotionTemplate, useMotionValue, useInView, animate, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";

export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" style={{ color: "currentColor" }}>
      <path d="M7 4h13l5 5v19l-3.5-2.5L18 28l-3.5-2.5L11 28l-4-2.5V4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M20 4v5h5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M11 20c4 0 7.5-1.8 9.5-6.2m0 0H16.6m3.9 0V18" stroke="#6A4BE0" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2 text-ink">
      <Mark />
      <span className="font-display text-[26px] font-medium leading-none tracking-tight">Salvor</span>
    </span>
  );
}

export function GlowCard({ children, className = "", as = "div", dark = false }: { children: ReactNode; className?: string; as?: "div" | "li" | "article"; dark?: boolean }) {
  const x = useMotionValue(-300), y = useMotionValue(-300);
  const border = useMotionTemplate`radial-gradient(320px circle at ${x}px ${y}px, rgba(106,75,224,0.95), rgba(201,164,92,0.55) 38%, transparent 68%)`;
  const spot = useMotionTemplate`radial-gradient(280px circle at ${x}px ${y}px, ${dark ? "rgba(191,174,246,0.20)" : "rgba(106,75,224,0.13)"}, transparent 70%)`;
  const Tag = motion[as];
  // Padding utilities written on a card are moved to its inner surface so the 1px glow border stays intact.
  const parts = className.split(/\s+/).filter(Boolean);
  const padCls = parts.filter((c) => /^((sm|md|lg|xl):)?(p|px|py|pt|pb|pl|pr)-/.test(c)).join(" ");
  className = parts.filter((c) => !/^((sm|md|lg|xl):)?(p|px|py|pt|pb|pl|pr)-/.test(c)).join(" ");
  return (
    <Tag
      onMouseMove={(e: React.MouseEvent<HTMLElement>) => { const r = e.currentTarget.getBoundingClientRect(); x.set(e.clientX - r.left); y.set(e.clientY - r.top); }}
      onMouseLeave={() => { x.set(-300); y.set(-300); }}
      whileHover={{ y: -3 }} transition={{ type: "spring", stiffness: 300, damping: 26 }}
      className={`group relative rounded-[22px] p-px shadow-[0_18px_44px_-24px_rgba(23,19,43,.35)] transition-shadow duration-300 hover:shadow-[0_28px_70px_-22px_rgba(106,75,224,.55)] ${dark ? "bg-[#2A2160]" : "bg-hair"} ${className}`}
    >
      <motion.div aria-hidden className="pointer-events-none absolute inset-0 rounded-[22px] opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ background: border }} />
      <div className={`relative h-full rounded-[21px] ${dark ? "glass-dark" : "glass"}`}>
        <motion.div aria-hidden className="pointer-events-none absolute inset-0 rounded-[21px]" style={{ background: spot }} />
        <div className={`relative h-full ${padCls}`}>{children}</div>
      </div>
    </Tag>
  );
}

export function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  useEffect(() => {
    if (!inView) return;
    if (reduce) { setShown(value); return; }
    const c = animate(0, value, { duration: 1.1, ease: "easeOut", onUpdate: (v) => setShown(v) });
    return () => c.stop();
  }, [inView, value, reduce]);
  return <span ref={ref} className="num">{format(shown)}</span>;
}

export function Eyebrow({ n, children, light = false }: { n?: string; children: ReactNode; light?: boolean }) {
  return (
    <p className={`flex items-center gap-3 ${light ? "eyebrow !text-lilac-200" : "eyebrow-gold"}`}>
      <span aria-hidden className="inline-block h-px w-8 bg-gradient-to-r from-gold to-transparent" />
      <span>{n ? `${n} / ` : ""}{children}</span>
    </p>
  );
}

export function Source({ kind }: { kind: "real public data" | "unattended run" | "platform meter" | "example" | "measured now" }) {
  const cls = kind === "example" ? "chip chip-mute" : "chip chip-violet";
  return <span className={cls}>{kind}</span>;
}

const STATUS: Record<string, [string, string]> = {
  new: ["Queued", "chip chip-mute"], watching: ["Asleep", "chip"], awake: ["Awake", "chip chip-violet"], owed: ["Owed", "chip chip-owed"],
  asking: ["Asking you", "chip chip-ember"], claimed: ["Claimed", "chip chip-owed"], retired: ["Retired", "chip chip-mute"], no_window: ["No window", "chip chip-mute"],
};
export function StatusChip({ status }: { status: string }) {
  const [label, cls] = STATUS[status] ?? [status, "chip"];
  return <span className={cls}>{label}</span>;
}

const LIFE: Record<string, string> = { "Born": "chip chip-violet", "Asleep": "chip", "Awake": "chip chip-violet", "Owed": "chip chip-owed", "Asking you": "chip chip-ember", "Claimed": "chip chip-owed", "Retired": "chip chip-mute", "Waiting for a computer": "chip chip-gold" };
export function LifeChip({ life }: { life: { label: string; reason: string } }) {
  return <span className={LIFE[life.label] ?? "chip"} title={life.reason}>{life.label}</span>;
}

export function DaysRing({ days, total = 45 }: { days: number; total?: number }) {
  const pct = Math.max(0, Math.min(1, days / total));
  const r = 16, c = 2 * Math.PI * r;
  const urgent = days <= 2;
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" role="img" aria-label={`${Math.ceil(days)} days left`}>
      <circle cx="22" cy="22" r={r} fill="none" stroke="#E2DCD2" strokeWidth="4" />
      <circle cx="22" cy="22" r={r} fill="none" stroke={urgent ? "#C2410C" : "#6A4BE0"} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} transform="rotate(-90 22 22)" />
      <text x="22" y="26" textAnchor="middle" fontSize="12" fontWeight="600" fill="#17132B" fontFamily="Switzer">{Math.ceil(days)}</text>
    </svg>
  );
}

export function Loading({ steps }: { steps: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI((x) => Math.min(steps.length - 1, x + 1)), 1600); return () => clearInterval(t); }, [steps.length]);
  return (
    <div className="rounded-2xl border border-hair bg-white/70 p-6" role="status" aria-live="polite">
      <ul className="space-y-2">
        {steps.slice(0, i + 1).map((s, k) => (
          <li key={s} className="flex items-center gap-3 text-[15px]">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${k === i ? "bg-violet awake" : "bg-owed"}`} />
            <span className={k === i ? "text-ink" : "text-muted"}>{s}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ErrorBox({ title, children, retry }: { title: string; children?: ReactNode; retry?: () => void }) {
  return (
    <div className="rounded-2xl border border-[#F6CDB4] bg-[#FDEEE4] p-5 text-ember-ink" role="alert">
      <p className="font-semibold">{title}</p>
      {children && <p className="mt-1 text-[15px]">{children}</p>}
      {retry && <button className="btn btn-ghost mt-3" onClick={retry}>Try again</button>}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-hair bg-white/50 p-8 text-center">
      <p className="font-display text-2xl">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-md text-muted">{children}</div>}
    </div>
  );
}
