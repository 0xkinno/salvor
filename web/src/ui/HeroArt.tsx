import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from "framer-motion";
import { useRef } from "react";
import { money } from "../api";

type Props = { item: string; paid: number; now: number; owed: number; date: string; checkpoint?: string; sha?: string; label: string };

// Hand-built: a tilted thermal receipt hanging from a small glowing cube (the receipt's Sprite),
// with a Box-style folder card and a checkpoint chip drifting behind it on desktop pointers.
export function HeroArt({ item, paid, now, owed, date, checkpoint = "v7", sha = "3fa1c9d2", label }: Props) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const mx = useSpring(useMotionValue(0), { stiffness: 80, damping: 18 }), my = useSpring(useMotionValue(0), { stiffness: 80, damping: 18 });
  const bx = useTransform(mx, (v) => v * -14), by = useTransform(my, (v) => v * -10), cx = useTransform(mx, (v) => v * 18), cy = useTransform(my, (v) => v * 12);
  const onMove = (e: React.PointerEvent) => {
    if (reduce || e.pointerType !== "mouse" || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width - 0.5); my.set((e.clientY - r.top) / r.height - 0.5);
  };
  const lines = [
    ["ITEM", item.slice(0, 22).toUpperCase()], ["QTY", "1"],
  ];
  return (
    <div ref={ref} onPointerMove={onMove} className="relative mx-auto w-full max-w-[520px] select-none" style={{ aspectRatio: "560 / 560" }}>
      <svg viewBox="0 0 560 560" role="img" aria-label={`Example receipt: paid ${money(paid)}, now ${money(now)}, owed ${money(owed)}, held by a small glowing computer`} className="h-full w-full overflow-visible">
        <defs>
          <radialGradient id="glow" cx="50%" cy="38%" r="55%"><stop offset="0" stopColor="#BFAEF6" stopOpacity=".85" /><stop offset=".55" stopColor="#DACFFB" stopOpacity=".35" /><stop offset="1" stopColor="#F6F4F0" stopOpacity="0" /></radialGradient>
          <linearGradient id="cubeTop" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#9B84F2" /><stop offset="1" stopColor="#6A4BE0" /></linearGradient>
          <linearGradient id="paper" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFFFFF" /><stop offset="1" stopColor="#FBF9F5" /></linearGradient>
          <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="14" stdDeviation="14" floodColor="#17132B" floodOpacity=".16" /></filter>
        </defs>
        <ellipse cx="280" cy="210" rx="270" ry="250" fill="url(#glow)" />
      </svg>

      <motion.div style={{ x: bx, y: by }} className="absolute left-[2%] top-[58%] hidden w-[44%] rounded-2xl border border-hair bg-white/90 p-3 shadow-[0_14px_30px_-14px_rgba(23,19,43,.25)] sm:block" aria-hidden="true">
        <p className="eyebrow !text-[10px]">Box folder</p>
        <p className="mono mt-1 text-[12px]">Claims / {date}</p>
        <div className="mt-2 flex gap-1.5"><span className="h-1.5 w-8 rounded bg-lilac-200" /><span className="h-1.5 w-5 rounded bg-lilac-200" /><span className="h-1.5 w-6 rounded bg-hair" /></div>
      </motion.div>
      <motion.div style={{ x: cx, y: cy }} className="absolute right-[0%] top-[70%] hidden rounded-full border border-lilac-200 bg-white/95 px-3 py-1.5 shadow-[0_10px_24px_-12px_rgba(106,75,224,.5)] sm:block" aria-hidden="true">
        <span className="mono text-[11px] text-violet-ink">{checkpoint} · sha256 {sha}…</span>
      </motion.div>

      {/* cube */}
      <svg viewBox="0 0 560 560" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
        <g transform="translate(280 70)">
          <path d="M0-34 36-14 0 6-36-14z" fill="url(#cubeTop)" />
          <path d="M-36-14 0 6V48L-36 28z" fill="#5236C4" />
          <path d="M36-14 0 6V48L36 28z" fill="#7A5DEA" />
          <path d="M0-12 18-2 0 8-18-2z" fill="#fff" opacity=".35" />
          <circle cx="0" cy="14" r="46" fill="#BFAEF6" opacity=".22" />
        </g>
        <path d="M280 118V152" stroke="#6A4BE0" strokeWidth="2" strokeLinecap="round" strokeDasharray="2 5" />
      </svg>

      {/* receipt */}
      <motion.div
        initial={reduce ? false : { clipPath: "inset(0 0 100% 0)" }} animate={{ clipPath: "inset(0 0 0% 0)" }} transition={{ duration: 1.7, ease: [0.22, 1, 0.36, 1] }}
        className="absolute left-1/2 top-[27%] w-[62%] -translate-x-1/2"
        style={{ transform: "translateX(-50%) perspective(900px) rotateZ(-4deg) rotateY(-7deg) rotateX(3deg)", transformOrigin: "50% 0" }}
      >
        <div className="relative rounded-[6px] border border-hair bg-[linear-gradient(#fff,#FBF9F5)] px-5 pb-8 pt-5 shadow-[0_24px_50px_-18px_rgba(23,19,43,.35)]" style={{ fontFamily: "JetBrains Mono, monospace" }}>
          <p className="text-center text-[11px] tracking-[.2em] text-muted">TARGET · ONLINE ORDER</p>
          <div className="my-2 border-t border-dashed border-hair" />
          {lines.map(([a, b]) => (<p key={a} className="flex justify-between text-[11px] text-ink"><span className="text-muted">{a}</span><span>{b}</span></p>))}
          <p className="mt-2 flex justify-between text-[13px] text-ink"><span>PAID</span><span className="num">{(paid / 100).toFixed(2)}</span></p>
          <p className="flex justify-between text-[12px] text-muted"><span>{date}</span><span className="num line-through decoration-[#C2410C]">{(paid / 100).toFixed(2)}</span></p>
          <div className="my-2 border-t border-dashed border-hair" />
          <p className="flex justify-between text-[14px] font-medium text-owed-ink"><span>TODAY</span><span className="num">{(now / 100).toFixed(2)}</span></p>
          <motion.div
            initial={reduce ? false : { scale: 2.2, opacity: 0, rotate: -24 }} animate={{ scale: 1, opacity: 1, rotate: -9 }} transition={{ delay: 1.5, type: "spring", stiffness: 320, damping: 16 }}
            className="absolute -bottom-5 right-3 flex h-[84px] w-[84px] flex-col items-center justify-center rounded-full border-[3px] border-owed bg-white/90 text-owed-ink"
          >
            <span className="text-[9px] tracking-[.18em]">OWED</span>
            <span className="num text-[17px] font-semibold leading-none">{money(owed)}</span>
          </motion.div>
          <div className="absolute inset-x-0 -bottom-[7px] h-[8px]" style={{ background: "radial-gradient(circle at 7px 7px, #F6F4F0 5px, transparent 5.5px) repeat-x", backgroundSize: "14px 8px" }} />
        </div>
      </motion.div>
      <p className="absolute bottom-0 left-0 text-[12px] text-muted">{label}</p>
    </div>
  );
}
