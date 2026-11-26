import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { LayoutGroup, motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Wordmark } from "./bits";
import { Tour } from "./Tour";
import { Backdrop } from "./Backdrop";

const PILLS: [string, string][] = [["/#receipt", "The receipt"], ["/how", "How it works"], ["/proof", "Proof"], ["/try", "Try yours"]];

export function Layout() {
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [tour, setTour] = useState(false);
  const render = params.get("render") === "1";
  useEffect(() => { setOpen(false); }, [loc.pathname]);
  useEffect(() => { if (params.get("tour") === "1") setTour(true); }, [params]);
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } if (loc.hash) document.getElementById(loc.hash.slice(1))?.scrollIntoView(); else window.scrollTo(0, 0); }, [loc.pathname, loc.hash]);
  const active = (to: string) => (to.startsWith("/#") ? loc.pathname === "/" && loc.hash === to.slice(1) : loc.pathname === to || (to !== "/" && loc.pathname.startsWith(to + "/")));

  return (
    <div className="min-h-screen">
      <Backdrop />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-ink focus:px-4 focus:py-2 focus:text-paper">Skip to content</a>
      {!render && (
        <header className="sticky top-0 z-40 px-3 pt-3 sm:px-6">
          <nav aria-label="Main" className="mx-auto flex max-w-[1180px] items-center justify-between rounded-cap glass px-3 py-2 shadow-[0_18px_50px_-18px_rgba(75,51,181,.5)]">
            <Link to="/" aria-label="Salvor home" className="rounded-lg px-1 py-1 no-underline"><Wordmark /></Link>
            <LayoutGroup id="pills">
              <ul className="hidden items-center gap-1 md:flex">
                {PILLS.map(([to, label]) => (
                  <li key={to} className="relative">
                    <NavLink to={to} className={`relative z-10 block rounded-[10px] px-3.5 py-2 text-[14px] font-medium no-underline ${active(to) ? "text-violet-ink" : "text-ink hover:text-violet-ink"}`}>{label}</NavLink>
                    {active(to) && <motion.span layoutId="pill" className="absolute inset-0 rounded-[10px] bg-lilac-100" transition={{ type: "spring", stiffness: 400, damping: 34 }} />}
                  </li>
                ))}
              </ul>
            </LayoutGroup>
            <div className="flex items-center gap-2">
              <button className="btn btn-ghost hidden !min-h-[40px] !px-3 !py-2 text-[14px] sm:inline-flex" onClick={() => setTour(true)}>Guided tour</button>
              <Link to="/app" className="btn btn-dark !min-h-[40px] !px-4 !py-2 text-[14px] no-underline">Open the app</Link>
              <button className="btn btn-ghost !min-h-[40px] !px-3 md:hidden" aria-expanded={open} aria-controls="sheet" onClick={() => setOpen((v) => !v)} aria-label="Menu">
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M2 5h14M2 9h14M2 13h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              </button>
            </div>
          </nav>
          <AnimatePresence>
            {open && (
              <motion.div id="sheet" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mx-auto mt-2 max-w-[1180px] rounded-cap border border-hair bg-paper p-3 shadow-xl md:hidden">
                {[...PILLS, ["/fleet", "Fleet"], ["/judge", "For judges"]].map(([to, label]) => (<Link key={to} to={to} className="block rounded-lg px-3 py-3 text-ink no-underline hover:bg-lilac-50">{label}</Link>))}
                <button className="btn btn-ghost mt-2 w-full" onClick={() => { setOpen(false); setTour(true); }}>Guided tour</button>
              </motion.div>
            )}
          </AnimatePresence>
        </header>
      )}
      <main id="main"><Outlet /></main>
      {!render && <Footer />}
      {tour && <Tour render={render} onClose={() => { setTour(false); nav(loc.pathname, { replace: true }); }} />}
    </div>
  );
}

function Footer() {
  return (
    <footer className="relative mt-24">
      <div className="gold-rule" />
      <div className="mx-auto grid max-w-[1180px] gap-8 px-5 py-12 sm:grid-cols-3 sm:px-6">
        <div><Wordmark /><p className="mt-3 max-w-xs text-[15px] text-muted">One who recovers value that would otherwise be lost. Built by 0xkinno for Fly.io Hacksgiving 2026.</p></div>
        <div className="text-[15px]"><p className="eyebrow mb-3">Disclosures</p>
          <ul className="space-y-2 text-muted">
            <li>Built with AI coding assistants during Hacksgiving week.</li>
            <li>Teresa is our example shopper. Her receipts are a sample household, and every number shows its source.</li>
            <li>Claims go to the owner's test inbox during the hackathon, never to a store.</li>
          </ul></div>
        <div className="text-[15px]"><p className="eyebrow mb-3">Pages</p>
          <ul className="space-y-2"><li><Link to="/judge">For judges</Link></li><li><Link to="/fleet">Fleet</Link></li><li><Link to="/proof">Proof</Link></li><li><a href="https://github.com/0xkinno/salvor">Source, MIT licence</a></li></ul></div>
      </div>
    </footer>
  );
}
