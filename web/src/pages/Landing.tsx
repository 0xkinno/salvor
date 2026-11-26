import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { useGet, money, usd, dateOnly, type Facts, type Receipt } from "../api";
import { HeroArt } from "../ui/HeroArt";
import { GlowCard, CountUp, Eyebrow, Source } from "../ui/bits";

const EXAMPLE = { item: "Air fryer, 6 quart", paid: 12999, now: 7999, owed: 5000, date: "Nov 9" };

function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} initial={reduce ? false : { opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  );
}

export default function Landing() {
  const facts = useGet<Facts>("/api/facts").data;
  const recs = useGet<{ receipts: Receipt[]; headline: { receipts: number } }>("/api/receipts").data;
  const hero = facts?.hero ?? null;
  const live = Boolean(hero);
  const art = hero
    ? { item: hero.item, paid: hero.paid_cents, now: hero.now_cents, owed: hero.owed_cents, date: dateOnly(hero.at) }
    : EXAMPLE;
  const sprites = (recs?.receipts ?? []).slice(0, 7);

  return (
    <>
      {/* 2. hero */}
      <section id="receipt" data-tour="hero" className="relative mx-auto grid max-w-[1180px] items-center gap-10 px-5 pb-16 pt-12 sm:px-6 lg:grid-cols-[1.05fr_.95fr] lg:pt-20">
        <div className="min-w-0">
          <Eyebrow>Fly.io Hacksgiving 2026</Eyebrow>
          <h1 className="h-display mt-5 text-[clamp(40px,5.4vw,70px)] [text-wrap:balance]">The store owes you.<br />Your receipt knows.</h1>
          <p className="mt-6 max-w-[540px] text-[19px] leading-[1.5] text-muted">
            Every receipt gets its own computer on Fly.io Sprites. It sleeps for free, wakes when the price falls, and hands you the claim for the money the store already owes you.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/app" className="btn btn-primary no-underline">See Teresa's receipts</Link>
            <Link to="/try" className="btn btn-ghost no-underline">Try your own receipt</Link>
          </div>
          <ul className="mt-10 grid max-w-[560px] gap-3 text-[15px] sm:grid-cols-3">
            {[["1", "Every receipt gets its own computer that sleeps for free."], ["2", "Jev decides whether the store owes you, and asks when it is not sure."], ["3", "You tap once. The evidence is already in your Box."]].map(([n, t]) => (
              <li key={n} className="rounded-xl border border-hair bg-white/60 p-3"><span className="mono text-violet-ink">0{n}</span><p className="mt-1">{t}</p></li>
            ))}
          </ul>
        </div>
        <div className="min-w-0">
          <HeroArt {...art} label={live ? `From a live run, ${dateOnly(hero!.at)}` : "Example receipt. Live numbers replace it after the first unattended run."} />
        </div>
      </section>

      {/* 3. the moment */}
      <section className="mx-auto max-w-[1180px] px-5 py-16 sm:px-6">
        <Reveal><Eyebrow n="01">The moment</Eyebrow><h2 className="h-display mt-3 max-w-3xl text-[clamp(32px,4.6vw,56px)]">Teresa works nights. Prices move while she sleeps.</h2></Reveal>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            ["Nov 9", "She buys", `An air fryer at Target for ${money(art.paid)}, on her phone, on a break.`],
            ["Nov 27", "The price falls", `Black Friday. The same item is ${money(art.now)}. Target's holiday guarantee covers its own price drops until Dec 24.`],
            ["7:10 am", "She gets the claim", `Her shift ends. Salvor shows ${money(art.owed)} owed, the clause, the evidence, and one tap to claim.`],
          ].map(([a, b, c], i) => (
            <Reveal key={a} delay={i * 0.08}>
              <GlowCard className="h-full p-6"><p className="mono text-violet-ink">{a}</p><h3 className="h-display mt-3 text-[28px]">{b}</h3><p className="mt-3 text-muted">{c}</p></GlowCard>
            </Reveal>
          ))}
        </div>
        <p className="mt-4 text-[13px] text-muted">{live ? "Numbers from the recorded live run." : "These numbers are an example until the first live run is recorded."}</p>
      </section>

      {/* 4. a computer per receipt */}
      <section data-tour="sprites" className="mx-auto max-w-[1180px] px-5 py-16 sm:px-6">
        <Reveal><Eyebrow n="02">One computer per receipt</Eyebrow><h2 className="h-display mt-3 max-w-3xl text-[clamp(32px,4.6vw,56px)]">Most of them are asleep. That is the point.</h2></Reveal>
        <div tabIndex={0} className="mt-10 flex gap-4 overflow-x-auto pb-4 [scrollbar-width:thin]" role="list" aria-label="Receipt Sprites, scrollable">
          {(sprites.length ? sprites.map((r) => ({ name: r.sprite ?? `slv-r-${r.id.toLowerCase()}`, awake: r.status === "owed" || r.status === "asking", line: r.title })) : ["slv-r-7q2a", "slv-r-k9da", "slv-r-m3fx", "slv-r-b81c", "slv-r-t5pw"].map((n, i) => ({ name: n, awake: i === 0, line: "example receipt" }))).map((s) => (
            <div role="listitem" key={s.name} className={`perf w-[190px] shrink-0 rounded-b-[14px] border border-hair bg-white/80 p-4 pt-5 ${s.awake ? "awake shadow-[0_0_0_2px_#BFAEF6,0_16px_40px_-14px_rgba(106,75,224,.5)]" : "opacity-70"}`}>
              <p className="mono text-[12px] text-violet-ink">{s.name}</p>
              <p className="mt-2 line-clamp-2 min-h-[44px] text-[14px]">{s.line}</p>
              <p className="mt-3 flex items-center gap-2 text-[13px]"><span className={`inline-block h-2 w-2 rounded-full ${s.awake ? "bg-violet" : "bg-hair"}`} />{s.awake ? "awake" : "asleep"}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-4">
          {[["What wakes it", "A scheduled Apify run knocks the home Sprite, which wakes each receipt Sprite."], ["What it may reach", "The Sprites gateway and nothing else. Its network allows one name."], ["What it may not", "A store site, your Box, your email. The gateway refuses by default."], ["What it costs", `${usd(facts?.p4.per_receipt_usd ?? null, 4)} per receipt, from Fly's own usage meter once measured.`]].map(([a, b]) => (
            <div key={a} className="rounded-xl border border-hair bg-white/60 p-4"><p className="eyebrow">{a}</p><p className="mt-2 text-[15px]">{b}</p></div>
          ))}
        </div>
      </section>

      {/* 5. who decides what */}
      <section className="mx-auto max-w-[1180px] px-5 py-16 sm:px-6">
        <Reveal><Eyebrow n="03">Who decides what</Eyebrow><h2 className="h-display mt-3 max-w-3xl text-[clamp(32px,4.6vw,56px)]">Models read. Code counts. Teresa asks.</h2></Reveal>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            ["Jev decides", "Is the listing the same item, down to size and capacity? Is the clause satisfied? Jev answers with calibrated probabilities. Below the threshold, it asks a person.", <path key="a" d="M6 20 12 26 26 8" stroke="#6A4BE0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />],
            ["Code computes", "The window, the deadline and the amount come from the store's own published clause, in integer cents. A model never produces a number you act on.", <path key="b" d="M8 10h16M8 16h16M8 22h10" stroke="#6A4BE0" strokeWidth="3" strokeLinecap="round" fill="none" />],
            ["Teresa confirms", "She says whether it is the same item, approves the claim, and makes the ask, because the store only pays the customer. Only her answers become lasting facts.", <circle key="c" cx="16" cy="16" r="9" stroke="#6A4BE0" strokeWidth="3" fill="none" />],
          ].map(([t, b, ico], i) => (
            <Reveal key={t as string} delay={i * 0.08}>
              <GlowCard className="h-full p-6"><svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">{ico as React.ReactNode}</svg><h3 className="h-display mt-4 text-[28px]">{t as string}</h3><p className="mt-3 text-muted">{b as string}</p></GlowCard>
            </Reveal>
          ))}
        </div>
      </section>

      {/* 6. proof */}
      <section className="mx-auto max-w-[1180px] px-5 py-16 sm:px-6">
        <Reveal><Eyebrow n="04">Proof</Eyebrow><h2 className="h-display mt-3 max-w-3xl text-[clamp(32px,4.6vw,56px)]">Numbers from run files. Misses included.</h2></Reveal>
        {facts && !facts.empty ? (
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <GlowCard className="p-6"><p className="h-display text-[56px]"><CountUp value={facts.p1.n_items} format={(n) => Math.round(n).toString()} /></p><p className="text-muted">real items with a usable early price</p><div className="mt-3"><Source kind="real public data" /></div></GlowCard>
            <GlowCard className="p-6"><p className="h-display text-[56px] text-owed-ink"><CountUp value={facts.p1.owed_total_cents} format={(n) => money(Math.round(n))} /></p><p className="text-muted">owed across those items</p><div className="mt-3"><Source kind="real public data" /></div></GlowCard>
            <GlowCard className="p-6"><p className="h-display text-[56px]"><CountUp value={facts.p2.runs_completed} format={(n) => Math.round(n).toString()} /></p><p className="text-muted">unattended runs nobody started</p><div className="mt-3"><Source kind="unattended run" /></div></GlowCard>
          </div>
        ) : (
          <div className="mt-10 rounded-2xl border border-dashed border-hair bg-white/50 p-8"><p className="font-display text-2xl">Measuring now.</p><p className="mt-2 max-w-xl text-muted">The study and the unattended watch write run files. This page shows their numbers the moment they exist, and nothing before.</p></div>
        )}
        <p className="mt-6"><Link to="/proof">Open the proof page, with misses and break tests</Link></p>
      </section>

      {/* 7. partners */}
      <section className="mx-auto max-w-[1180px] px-5 py-16 sm:px-6">
        <Reveal><Eyebrow n="05">Partners doing real jobs</Eyebrow><h2 className="h-display mt-3 max-w-3xl text-[clamp(32px,4.6vw,56px)]">Delete any one and a step disappears.</h2></Reveal>
        <div tabIndex={0} role="region" aria-label="Scrollable table" className="scroll-x mt-8 rounded-2xl border border-hair bg-white/70">
          <table className="t min-w-[760px]">
            <thead><tr><th>Product</th><th>Job in Salvor</th><th>Without it</th></tr></thead>
            <tbody>
              {[
                ["Fly.io Sprites", "One sleeping computer per receipt, permissions as labels, checkpoints as evidence, the usage meter as the bill.", "No product."],
                ["Apify", "Reads store pages in its own cloud, and its schedule is the clock that wakes everything.", "No readings and nothing ever wakes."],
                ["TypeSafe Jev", "Decides same item and clause eligibility with calibrated probabilities.", "No claim is ever prepared."],
                ["Pinecone", "Maps a cryptic receipt line to the right listing with embed and rerank.", "Receipt lines never find their page."],
                ["Ollama Cloud", "Reads receipt photos and order emails into lines, and writes the claim in plain words.", "No receipt intake."],
                ["Box", "Holds Teresa's receipts and the filed claim packet with a shared link.", "No evidence the store can open."],
                ["AgentMail", "A receipts inbox for forwarded orders, and the claim email channel.", "Online orders cannot be forwarded in."],
              ].map(([a, b, c]) => (<tr key={a}><td className="whitespace-nowrap font-medium">{a}</td><td>{b}</td><td className="text-muted">{c}</td></tr>))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mx-auto max-w-[1180px] px-5 pb-8 pt-8 sm:px-6">
        <div className="rounded-3xl bg-ink p-8 text-paper sm:p-12">
          <h2 className="h-display text-[clamp(30px,4vw,52px)]">Judge's own receipt, live, in under a minute.</h2>
          <p className="mt-3 max-w-xl text-[#CFC8E6]">Paste a Target or Best Buy product link, the price you paid and the date. A pooled Sprite wakes, reads the page through Apify, and Salvor decides.</p>
          <Link to="/try" className="btn btn-primary mt-6 no-underline">Try your own receipt</Link>
        </div>
      </section>
    </>
  );
}
