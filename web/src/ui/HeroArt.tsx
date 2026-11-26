import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from "framer-motion";
import { useRef } from "react";
import { money } from "../api";

type Props = { item: string; paid: number; now: number; owed: number; date: string; checkpoint?: string; sha?: string; label: string };

// The hero stage: a midnight glass panel. A glowing cube (the receipt's Sprite) holds a thermal
// receipt on a thread. The receipt swings once and then idles. Around it, glass chips drift with the
// pointer on desktop: a Box folder, a checkpoint, Jev's decision dial and a sleeping fleet.
export function HeroArt({ item, paid, now, owed, date, checkpoint = "v7", sha = "3fa1c9d2", label }: Props) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const mx = useSpring(useMotionValue(0), { stiffness: 70, damping: 16 }), my = useSpring(useMotionValue(0), { stiffness: 70, damping: 16 });
  const ax = useTransform(mx, (v) => v * -22), ay = useTransform(my, (v) => v * -16);
  const bx = useTransform(mx, (v) => v * 26), by = useTransform(my, (v) => v * 18);
  const rx = useTransform(my, (v) => v * -6), ry = useTransform(mx, (v) => v * 8);
  const onMove = (e: React.PointerEvent) => {
    if (reduce || e.pointerType !== "mouse" || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width - 0.5); my.set((e.clientY - r.top) / r.height - 0.5);
  };
  return (
    <div ref={ref} onPointerMove={onMove} className="relative mx-auto w-full max-w-[560px] select-none">
      <div className="stage relative overflow-hidden rounded-[36px] border border-white/10 shadow-[0_50px_120px_-40px_rgba(75,51,181,.8)]" style={{ aspectRatio: "1 / 1.16" }}>
        <svg viewBox="0 0 560 650" role="img" aria-label={`Example receipt: paid ${money(paid)}, now ${money(now)}, owed ${money(owed)}, held by a small glowing computer`} className="absolute inset-0 h-full w-full">
          <defs>
            <radialGradient id="hg" cx="50%" cy="22%" r="60%"><stop offset="0" stopColor="#9B84F2" stopOpacity=".75" /><stop offset=".5" stopColor="#5236C4" stopOpacity=".25" /><stop offset="1" stopColor="#0E0A24" stopOpacity="0" /></radialGradient>
            <linearGradient id="gold" x1="0" x2="1"><stop offset="0" stopColor="#8A6A2F" /><stop offset=".5" stopColor="#F1DFB4" /><stop offset="1" stopColor="#B8935A" /></linearGradient>
            <linearGradient id="cubeT" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#B7A4FA" /><stop offset="1" stopColor="#6A4BE0" /></linearGradient>
            <pattern id="stars" width="46" height="46" patternUnits="userSpaceOnUse"><circle cx="6" cy="8" r="1" fill="#fff" opacity=".35" /><circle cx="30" cy="30" r=".8" fill="#BFAEF6" opacity=".5" /></pattern>
          </defs>
          <rect width="560" height="650" fill="url(#stars)" />
          <ellipse cx="280" cy="130" rx="300" ry="260" fill="url(#hg)" />
          {/* orbit rings */}
          {[150, 215, 285].map((r, i) => (
            <motion.ellipse key={r} cx="280" cy="112" rx={r} ry={r * 0.34} fill="none" stroke="url(#gold)" strokeOpacity={0.5 - i * 0.12} strokeWidth="1" strokeDasharray={i === 1 ? "2 7" : "0"}
              animate={reduce ? undefined : { rotate: i % 2 ? 360 : -360 }} transition={{ duration: 90 + i * 40, repeat: Infinity, ease: "linear" }} style={{ transformOrigin: "280px 112px" }} />
          ))}
          {/* beams */}
          <path d="M280 112 L170 560 M280 112 L390 560" stroke="#BFAEF6" strokeOpacity=".08" strokeWidth="60" strokeLinecap="round" />
        </svg>

        {/* cube */}
        <svg viewBox="0 0 560 650" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
          <motion.g animate={reduce ? undefined : { y: [0, -7, 0] }} transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}>
            <g transform="translate(280 84)">
              <circle r="70" cy="14" fill="#9B84F2" opacity=".28" /><circle r="46" cy="14" fill="#BFAEF6" opacity=".25" />
              <path d="M0-40 42-16 0 8-42-16z" fill="url(#cubeT)" /><path d="M-42-16 0 8V58L-42 34z" fill="#4B33B5" /><path d="M42-16 0 8V58L42 34z" fill="#7A5DEA" />
              <path d="M0-14 22-2 0 10-22-2z" fill="#fff" opacity=".45" />
              <path d="M-42-16 0 8 42-16" fill="none" stroke="url(#gold)" strokeWidth="1.4" />
            </g>
          </motion.g>
        </svg>

        {/* receipt on a thread */}
        <motion.div
          className="absolute left-1/2 top-[16%] w-[54%] origin-top"
          style={{ x: "-50%", rotateX: rx, rotateY: ry, transformPerspective: 900 }}
          initial={reduce ? false : { rotate: -9 }} animate={reduce ? { rotate: -3 } : { rotate: [-9, 4, -3.5, 2, -3] }} transition={{ duration: 3.4, ease: "easeOut" }}
        >
          <div aria-hidden className="mx-auto h-9 w-px bg-gradient-to-b from-gold to-transparent" />
          <motion.div initial={reduce ? false : { clipPath: "inset(0 0 100% -60px)" }} animate={{ clipPath: "inset(0 0 -60px -60px)" }} transition={{ duration: 1.7, ease: [0.22, 1, 0.36, 1] }}>
            <div className="relative rounded-[6px] bg-[linear-gradient(#FFFFFF,#F7F3EA)] px-5 pb-16 pt-5 shadow-[0_30px_60px_-20px_rgba(0,0,0,.7)]" style={{ fontFamily: "JetBrains Mono, monospace" }}>
              <p className="text-center text-[10.5px] tracking-[.22em] text-muted">TARGET · ONLINE ORDER</p>
              <div className="my-2 border-t border-dashed border-hair" />
              <p className="text-[11px] leading-snug text-ink">{item.toUpperCase()}</p>
              <p className="mt-2 flex justify-between text-[13px] text-ink"><span>PAID {date.toUpperCase()}</span><span className="num">{(paid / 100).toFixed(2)}</span></p>
              <div className="my-2 border-t border-dashed border-hair" />
              <p className="flex justify-between text-[14px] font-medium text-owed-ink"><span>TODAY</span><span className="num">{(now / 100).toFixed(2)}</span></p>
              <p className="mt-1 text-[10px] tracking-[.1em] text-muted">SAME STORE, SAME ITEM</p>
              <motion.div
                initial={reduce ? false : { scale: 2.4, opacity: 0, rotate: -26 }} animate={{ scale: 1, opacity: 1, rotate: -9 }} transition={{ delay: 1.5, type: "spring", stiffness: 320, damping: 15 }}
                className="absolute -bottom-6 right-3 flex h-[92px] w-[92px] flex-col items-center justify-center rounded-full border-[3px] border-owed bg-white/95 text-owed-ink shadow-[0_10px_30px_-10px_rgba(14,122,87,.6)]"
              >
                <span className="text-[9px] tracking-[.18em]">OWED</span>
                <span className="num text-[18px] font-semibold leading-none">{money(owed)}</span>
              </motion.div>
              <div className="absolute inset-x-0 -bottom-[7px] h-[8px]" style={{ background: "radial-gradient(circle at 7px 7px, #161036 5px, transparent 5.5px) repeat-x", backgroundSize: "14px 8px" }} />
            </div>
          </motion.div>
        </motion.div>

        {/* glass chips */}
        <motion.div style={{ x: ax, y: ay }} className="glass-dark absolute bottom-[4.5%] left-[5%] hidden w-[40%] rounded-2xl p-3.5 sm:block" aria-hidden="true">
          <p className="eyebrow !text-[10px] !text-lilac-200">Jev decided</p>
          <p className="mt-1 text-[13px] font-semibold">same item</p>
          <div className="mt-2 h-1.5 rounded bg-white/15"><div className="h-1.5 w-[97%] rounded bg-gradient-to-r from-violet to-lilac-300" /></div>
          <p className="num mt-1 text-[11px] text-lilac-200">97% sure</p>
        </motion.div>
        <motion.div style={{ x: bx, y: by }} className="glass-dark absolute bottom-[14.5%] right-[5%] hidden rounded-2xl px-3 py-2 sm:block" aria-hidden="true">
          <p className="eyebrow !text-[10px] !text-lilac-200">Box folder</p>
          <p className="mono mt-0.5 text-[12px]">Claims / {date}</p>
        </motion.div>
        <motion.div style={{ x: ax, y: by }} className="glass-dark absolute bottom-[4.5%] right-[5%] hidden rounded-full px-3 py-2 sm:block" aria-hidden="true">
          <span className="mono text-[11px] text-lilac-200">{checkpoint} · sha256 {sha}…</span>
        </motion.div>
      </div>
      <p className="mt-3 text-[12px] text-muted">{label}</p>
    </div>
  );
}
