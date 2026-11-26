import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { get, type Receipt } from "../api";

type Step = { path: (rid: string) => string; sel: string; title: string; body: string };

const STEPS: Step[] = [
  { path: () => "/", sel: "[data-tour=hero]", title: "The store owes you", body: "Target's own holiday guarantee owes a buyer the difference when its price falls. The store never tells you. Salvor watches for it." },
  { path: () => "/", sel: "[data-tour=sprites]", title: "One computer per receipt", body: "Each receipt gets its own Fly.io Sprite. Most are asleep, which costs nothing. One wakes when the price is read." },
  { path: () => "/app", sel: "[data-tour=cards]", title: "Your receipts", body: "Every card shows its own Sprite, days left, last wake and next wake. The sample household is labelled." },
  { path: (r) => `/app/r/${r}`, sel: "[data-tour=ladder]", title: "Then and now, decided", body: "Pinecone ranks the listing and typed rules check size and model number. Code computes the amount from the store's own clause." },
  { path: (r) => `/app/r/${r}`, sel: "[data-tour=evidence]", title: "Evidence the platform holds", body: "The claim cites a checkpoint and a hash. Verify reads Fly's read-only copy and compares." },
  { path: () => "/fleet", sel: "[data-tour=fleet]", title: "The fleet, live", body: "Every Sprite with its label, its egress lock, its checkpoints and its usage, read from the platform now." },
  { path: () => "/proof", sel: "[data-tour=proof]", title: "Proof, with misses", body: "Numbers come from run files, never typed. Break tests are listed with their failures kept." },
];

export function Tour({ onClose, render }: { onClose: () => void; render: boolean }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [rid, setRid] = useState("none");
  const nav = useNavigate();
  const card = useRef<HTMLDivElement>(null);
  const step = STEPS[i];

  useEffect(() => { get<{ receipts: Receipt[] }>("/api/receipts").then((d) => setRid(d.receipts[0]?.id ?? "none")).catch(() => {}); }, []);
  useEffect(() => { nav(step.path(rid)); }, [i, rid]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let alive = true, tries = 0;
    const find = () => {
      const el = document.querySelector(step.sel) as HTMLElement | null;
      if (el) { el.scrollIntoView({ block: "center", behavior: "auto" }); setTimeout(() => alive && setRect(el.getBoundingClientRect()), 60); }
      else if (tries++ < 40 && alive) setTimeout(find, 150);
      else if (alive) setRect(null);
    };
    setRect(null); find();
    const onResize = () => { const el = document.querySelector(step.sel); if (el) setRect(el.getBoundingClientRect()); };
    window.addEventListener("resize", onResize); window.addEventListener("scroll", onResize, { passive: true });
    return () => { alive = false; window.removeEventListener("resize", onResize); window.removeEventListener("scroll", onResize); };
  }, [i, rid, step.sel]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); if (e.key === "ArrowRight") setI((x) => Math.min(STEPS.length - 1, x + 1)); if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1)); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  useEffect(() => { if (!render) return; const t = setInterval(() => setI((x) => (x + 1) % STEPS.length), 6500); return () => clearInterval(t); }, [render]);
  useLayoutEffect(() => { card.current?.focus(); }, [i]);

  const pad = 10;
  const hole = rect ? { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 } : null;
  const below = rect ? rect.bottom + 16 + 190 < window.innerHeight : true;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Guided tour">
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" style={hole ? { background: "transparent" } : { background: "rgba(23,19,43,.45)" }} />
      {hole && <div aria-hidden="true" className="pointer-events-none absolute rounded-[18px] transition-all duration-300" style={{ ...hole, boxShadow: "0 0 0 9999px rgba(23,19,43,.5), 0 0 0 3px #BFAEF6" }} />}
      <div
        ref={card} tabIndex={-1}
        className="absolute left-1/2 w-[min(92vw,420px)] -translate-x-1/2 rounded-2xl border border-hair bg-paper p-5 shadow-2xl outline-none"
        style={{ top: hole && below ? Math.min(hole.top + hole.height + 14, window.innerHeight - 220) : undefined, bottom: !hole || below ? undefined : 16 }}
      >
        <p className="eyebrow">Step {i + 1} of {STEPS.length}</p>
        <h2 className="h-display mt-2 text-[26px]">{step.title}</h2>
        <p className="mt-2 text-[15px] text-muted">{step.body}</p>
        {!render && (
          <div className="mt-4 flex items-center justify-between gap-2">
            <button className="btn btn-ghost !min-h-[40px]" onClick={onClose}>Close</button>
            <div className="flex gap-2">
              <button className="btn btn-ghost !min-h-[40px]" disabled={i === 0} onClick={() => setI(i - 1)}>Back</button>
              {i < STEPS.length - 1 ? <button className="btn btn-primary !min-h-[40px]" onClick={() => setI(i + 1)}>Next</button> : <button className="btn btn-primary !min-h-[40px]" onClick={onClose}>Done</button>}
            </div>
          </div>
        )}
        {!render && <p className="mt-3 text-[12px] text-muted">Keys: left and right arrows, Escape to close.</p>}
      </div>
    </div>
  );
}
