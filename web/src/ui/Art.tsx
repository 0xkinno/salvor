import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

// Hand-built SVG illustrations. Decorative ones are aria-hidden; informative ones carry a label.

const Cube = ({ x, y, s = 1, awake = false, id }: { x: number; y: number; s?: number; awake?: boolean; id: string }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    {awake && <circle r="46" cy="12" fill="#BFAEF6" opacity=".35" />}
    <path d="M0-26 28-10 0 6-28-10z" fill={awake ? "#9B84F2" : "#CFC6EE"} />
    <path d="M-28-10 0 6V40L-28 24z" fill={awake ? "#5236C4" : "#B6AAE0"} />
    <path d="M28-10 0 6V40L28 24z" fill={awake ? "#7A5DEA" : "#C5BBE8"} />
    {awake && <path d="M0-8 14 0 0 8-14 0z" fill="#fff" opacity=".4" />}
    {!awake && <text x="30" y="-14" fontSize="13" fontWeight="600" fill="#7A6FA8" fontFamily="Gambetta">z</text>}
    {!awake && <text x="40" y="-26" fontSize="10" fontWeight="600" fill="#9A90C0" fontFamily="Gambetta">z</text>}
    <title>{id}</title>
  </g>
);

// A constellation of Sprites: most asleep, one awake with a ripple, lines from home.
export function FleetArt({ names, awakeIndex = 1 }: { names: string[]; awakeIndex?: number }) {
  const reduce = useReducedMotion();
  const pts = [[110, 120], [330, 100], [580, 130], [210, 250], [450, 245], [640, 270], [60, 270]].slice(0, names.length);
  return (
    <svg viewBox="0 0 720 380" role="img" aria-label="A fleet of receipt Sprites, mostly asleep, with one awake" className="h-auto w-full">
      <defs>
        <radialGradient id="fl-g" cx="50%" cy="50%" r="60%"><stop offset="0" stopColor="#DACFFB" stopOpacity=".7" /><stop offset="1" stopColor="#F6F4F0" stopOpacity="0" /></radialGradient>
        <pattern id="fl-d" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.2" fill="#17132B" opacity=".08" /></pattern>
      </defs>
      <rect width="720" height="380" rx="28" fill="url(#fl-d)" />
      <ellipse cx="360" cy="190" rx="340" ry="170" fill="url(#fl-g)" />
      <g transform="translate(360 340)"><rect x="-80" y="-20" width="160" height="40" rx="20" fill="#17132B" /><text textAnchor="middle" y="5" fontSize="14" fill="#F6F4F0" fontFamily="JetBrains Mono">slv-home</text></g>
      {pts.map(([x, y], i) => (
        <path key={`l${i}`} d={`M360 322 C ${360} ${(322 + y) / 2}, ${x} ${(322 + y) / 2 + 20}, ${x} ${y + 50}`} fill="none" stroke={i === awakeIndex ? "#6A4BE0" : "#BFAEF6"} strokeWidth={i === awakeIndex ? 2.2 : 1.2} strokeDasharray={i === awakeIndex ? "0" : "3 6"} opacity={i === awakeIndex ? 1 : 0.7} />
      ))}
      {pts.map(([x, y], i) => (
        <g key={names[i]}>
          {i === awakeIndex && !reduce && [0, 1].map((k) => (
            <motion.circle key={k} cx={x} cy={y + 10} fill="none" stroke="#6A4BE0" strokeWidth="1.5" initial={{ r: 40, opacity: 0.7 }} animate={{ r: 120, opacity: 0 }} transition={{ duration: 2.8, repeat: Infinity, delay: k * 1.4, ease: "easeOut" }} />
          ))}
          <motion.g animate={reduce ? undefined : { y: i === awakeIndex ? [0, -6, 0] : [0, -2, 0] }} transition={{ duration: 3 + i * 0.4, repeat: Infinity, ease: "easeInOut" }}>
            <Cube x={x} y={y} s={i === awakeIndex ? 1.7 : 1.35} awake={i === awakeIndex} id={names[i]} />
          </motion.g>
          <text x={x} y={y + 78} textAnchor="middle" fontSize="14" fontWeight="500" fill={i === awakeIndex ? "#4B33B5" : "#4A4463"} fontFamily="JetBrains Mono">{names[i]}</text>
        </g>
      ))}
    </svg>
  );
}

// Jev / code / Teresa: three connected roles.
export function RolesArt() {
  return (
    <svg viewBox="0 0 960 150" aria-hidden="true" className="hidden h-auto w-full md:block">
      <defs><linearGradient id="rl" x1="0" x2="1"><stop offset="0" stopColor="#6A4BE0" /><stop offset=".5" stopColor="#C9A45C" /><stop offset="1" stopColor="#0E7A57" /></linearGradient></defs>
      <path d="M80 75 H480 H880" stroke="url(#rl)" strokeWidth="2" strokeDasharray="2 7" strokeLinecap="round" fill="none" />
      {[[80, "#6A4BE0", "1"], [480, "#C9A45C", "2"], [880, "#0E7A57", "3"]].map(([x, c, n]) => (
        <g key={String(n)} transform={`translate(${x} 75)`}>
          <circle r="34" fill="#fff" stroke={String(c)} strokeWidth="2" /><circle r="44" fill="none" stroke={String(c)} strokeOpacity=".25" />
          <text textAnchor="middle" y="9" fontSize="26" fontFamily="Gambetta" fill="#17132B">{n}</text>
        </g>
      ))}
    </svg>
  );
}

// The moment: a drawn timeline from the purchase to the claim.
export function TimelineArt() {
  const reduce = useReducedMotion();
  return (
    <svg viewBox="0 0 1000 120" aria-hidden="true" className="hidden h-auto w-full md:block">
      <motion.path d="M40 60 C 220 10, 330 110, 500 60 S 800 10, 960 60" fill="none" stroke="#6A4BE0" strokeWidth="2.4" strokeLinecap="round"
        initial={(reduce ? false : { pathLength: 0 }) as any} whileInView={{ pathLength: 1 } as any} viewport={{ once: true }} transition={{ duration: 2.2, ease: "easeInOut" }} />
      {[[40, "Nov 9"], [500, "Nov 27"], [960, "7:10 am"]].map(([x, t], i) => (
        <g key={String(t)} transform={`translate(${x} 60)`}>
          <motion.circle r="9" fill={i === 2 ? "#0E7A57" : "#17132B"} initial={reduce ? false : { scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.5 + i * 0.7, type: "spring" }} />
          <circle r="16" fill="none" stroke="#C9A45C" strokeOpacity=".6" />
          <text textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"} y="-26" fontSize="12" fontFamily="JetBrains Mono" fill="#5C566F">{t}</text>
        </g>
      ))}
    </svg>
  );
}

// A thin illustrated banner at the top of inner pages so no page opens on bare space.
export function Banner({ children, motif = "ledger" }: { children: ReactNode; motif?: "ledger" | "fleet" | "proof" | "how" | "try" | "judge" | "receipt" }) {
  return (
    <div className="relative overflow-hidden rounded-[28px] border border-white/80 bg-[linear-gradient(135deg,rgba(255,255,255,.9),rgba(236,229,253,.75))] px-6 py-8 shadow-[0_24px_60px_-28px_rgba(75,51,181,.45)] sm:px-10 sm:py-10">
      <svg aria-hidden="true" viewBox="0 0 520 220" className="pointer-events-none absolute -right-6 top-1/2 hidden h-[130%] -translate-y-1/2 opacity-90 md:block">
        <defs><linearGradient id={`bn-${motif}`} x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#BFAEF6" /><stop offset="1" stopColor="#C9A45C" /></linearGradient></defs>
        {motif === "fleet" && [[330, 60], [420, 120], [260, 140], [470, 40]].map(([x, y], i) => <g key={i} transform={`translate(${x} ${y})`}><path d="M0-22 24-8 0 6-24-8z" fill="#9B84F2" opacity={0.9 - i * 0.15} /><path d="M-24-8 0 6V34L-24 20z" fill="#5236C4" opacity={0.9 - i * 0.15} /><path d="M24-8 0 6V34L24 20z" fill="#7A5DEA" opacity={0.9 - i * 0.15} /></g>)}
        {motif === "proof" && [0, 1, 2, 3, 4, 5].map((i) => <rect key={i} x={250 + i * 38} y={170 - (20 + i * 22 + (i % 2) * 14)} width="24" height={20 + i * 22 + (i % 2) * 14} rx="6" fill="url(#bn-proof)" opacity={0.5 + i * 0.08} />)}
        {motif === "how" && <g fill="none" stroke="url(#bn-how)" strokeWidth="2.4"><circle cx="360" cy="110" r="30" /><circle cx="450" cy="60" r="18" /><circle cx="450" cy="160" r="18" /><circle cx="270" cy="110" r="14" /><path d="M300 108 L330 110M385 98 L435 66M385 122 L435 154" strokeLinecap="round" /></g>}
        {(motif === "ledger" || motif === "receipt" || motif === "try" || motif === "judge") && <g transform="translate(330 20) rotate(8)"><path d="M0 0h110v150l-14-9-14 9-14-9-14 9-14-9-14 9-14-9-12 9z" fill="#fff" stroke="url(#bn-ledger)" strokeWidth="2.4" /><path d="M18 30h74M18 52h54M18 74h64M18 96h40" stroke="#DACFFB" strokeWidth="5" strokeLinecap="round" /><circle cx="84" cy="112" r="18" fill="none" stroke="#0E7A57" strokeWidth="3" /></g>}
      </svg>
      <div className="relative max-w-3xl">{children}</div>
    </div>
  );
}
