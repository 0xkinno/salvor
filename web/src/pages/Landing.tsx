import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { useGet, money, usd, dateOnly, type Facts, type Receipt } from "../api";
import { HeroArt } from "../ui/HeroArt";
import { FleetArt, RolesArt, TimelineArt } from "../ui/Art";
import { GlowCard, CountUp, Eyebrow, Source } from "../ui/bits";

const EXAMPLE = { item: "Air fryer, 6 quart", paid: 12999, now: 7999, owed: 5000, date: "Nov 9" };
const PARTNERS = ["Fly.io Sprites", "Apify", "TypeSafe Jev", "Pinecone", "Ollama Cloud", "Box", "AgentMail"];

function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} initial={reduce ? false : { opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  );
}

function Heading({ n, eyebrow, children }: { n: string; eyebrow: string; children: React.ReactNode }) {
  return (
    <Reveal>
      <Eyebrow n={n}>{eyebrow}</Eyebrow>
      <h2 className="h-display mt-4 max-w-3xl text-[clamp(32px,4.4vw,56px)]">{children}</h2>
    </Reveal>
  );
}

export default function Landing() {
  const facts = useGet<Facts>("/api/facts").data;
  const recs = useGet<{ receipts: Receipt[] }>("/api/receipts").data;
  const hero = facts?.hero ?? null;
  const live = Boolean(hero);
  const art = hero ? { item: hero.item, paid: hero.paid_cents, now: hero.now_cents, owed: hero.owed_cents, date: dateOnly(hero.at) } : EXAMPLE;
  const names = (recs?.receipts ?? []).slice(0, 7).map((r) => r.sprite ?? `slv-r-${r.id.toLowerCase()}`);
  const fleet = names.length >= 4 ? names : ["slv-r-7q2a", "slv-r-k9da", "slv-r-m3fx", "slv-r-b81c", "slv-r-t5pw", "slv-r-d4en", "slv-r-p2xh"];

  return (
    <>
      {/* 1. hero */}
      <section id="receipt" data-tour="hero" className="relative mx-auto grid max-w-[1180px] items-center gap-12 px-5 pb-14 pt-10 sm:px-6 lg:grid-cols-[1fr_.95fr] lg:pt-16">
        <div className="min-w-0">
          <Eyebrow>Fly.io Hacksgiving 2026</Eyebrow>
          <h1 className="h-display mt-6 text-[clamp(42px,5.6vw,76px)] [text-wrap:balance]">The store owes you.<br /><span className="text-shine">Your receipt knows.</span></h1>
          <p className="mt-6 max-w-[540px] text-[19px] leading-[1.55] text-muted">
            Every receipt gets its own computer on Fly.io Sprites. It sleeps for free, wakes when the price falls, and hands you the claim for the money the store already owes you.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/app" className="btn btn-primary no-underline">See Teresa's receipts</Link>
            <Link to="/try" className="btn btn-ghost no-underline">Try your own receipt</Link>
          </div>
          <ul className="mt-10 grid max-w-[600px] gap-3 text-[15px] sm:grid-cols-3">
            {[["Its own computer", "Every receipt gets a Sprite that sleeps for free."], ["A decision, not a guess", "Jev decides if the store owes you, and asks when unsure."], ["One tap", "The claim and its evidence are already in your Box."]].map(([h, t], i) => (
              <GlowCard as="li" key={h} className="h-full"><div className="p-4"><span className="mono text-gold-ink">0{i + 1}</span><p className="mt-1 font-semibold leading-snug">{h}</p><p className="mt-1 text-[14px] text-muted">{t}</p></div></GlowCard>
            ))}
          </ul>
        </div>
        <div className="min-w-0">
          <HeroArt {...art} label={live ? `From a live run, ${dateOnly(hero!.at)}` : "Example receipt. Live numbers replace it after the first unattended run."} />
        </div>
      </section>

      {/* 2. built on */}
      <section aria-label="Built on" className="relative border-y border-hair/80 bg-white/40 py-5 backdrop-blur">
        <div className="gold-rule absolute inset-x-0 top-0" />
        <div className="overflow-hidden" aria-hidden="true">
          <div className="marquee">{[...PARTNERS, ...PARTNERS, ...PARTNERS, ...PARTNERS].map((p, i) => (<span key={i} className="flex items-center gap-12 font-display text-[22px] text-ink/70"><span>{p}</span><span className="text-gold">◆</span></span>))}</div>
        </div>
        <p className="sr-only">Built on {PARTNERS.join(", ")}.</p>
        <div className="gold-rule absolute inset-x-0 bottom-0" />
      </section>

      {/* 3. the moment */}
      <section className="mx-auto max-w-[1180px] px-5 py-20 sm:px-6">
        <Heading n="01" eyebrow="The moment">Teresa works nights. Prices move while she sleeps.</Heading>
        <div className="mt-10"><TimelineArt /></div>
        <div className="mt-6 grid gap-5 md:grid-cols-3">
          {[
            ["Nov 9", "She buys", `An air fryer at Target for ${money(art.paid)}, on her phone, on a break.`],
            ["Nov 27", "The price falls", `Black Friday. The same item is ${money(art.now)}. Target's holiday guarantee covers its own price drops until Dec 24.`],
            ["7:10 am", "She gets the claim", `Her shift ends. Salvor shows ${money(art.owed)} owed, the clause, the evidence, and one tap to claim.`],
          ].map(([a, b, c], i) => (
            <Reveal key={a} delay={i * 0.08}><GlowCard className="h-full"><div className="p-7"><p className="mono text-gold-ink">{a}</p><h3 className="h-display mt-3 text-[30px]">{b}</h3><p className="mt-3 text-muted">{c}</p></div></GlowCard></Reveal>
          ))}
        </div>
        <p className="mt-4 text-[13px] text-muted">{live ? "Numbers from the recorded live run." : "These numbers are an example until the first live run is recorded."}</p>
      </section>

      {/* 4. one computer per receipt */}
      <section data-tour="sprites" className="mx-auto max-w-[1180px] px-5 pb-20 sm:px-6">
        <Heading n="02" eyebrow="One computer per receipt">Most of them are asleep. That is the point.</Heading>
        <div className="mt-10 grid items-stretch gap-5 lg:grid-cols-[1.25fr_.75fr]">
          <Reveal><GlowCard className="h-full"><div className="p-3 sm:p-5"><FleetArt names={fleet} /></div></GlowCard></Reveal>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1 lg:grid-rows-4">
            {[["What wakes it", "An Apify schedule knocks the home Sprite, which wakes each receipt Sprite."], ["What it may reach", "The Sprites gateway and nothing else. Its network allows one name."], ["What it may not", "A store site, your Box, your email. The gateway refuses by default."], ["What it costs", `${usd(facts?.p4.per_receipt_usd ?? null, 4)} per receipt, from Fly's own usage meter once measured.`]].map(([a, b], i) => (
              <Reveal key={a} delay={i * 0.06}><GlowCard dark className="h-full"><div className="p-5"><p className="eyebrow !text-gold">{a}</p><p className="mt-2 text-[15px] text-paper">{b}</p></div></GlowCard></Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 5. who decides what */}
      <section className="mx-auto max-w-[1180px] px-5 pb-20 sm:px-6">
        <Heading n="03" eyebrow="Who decides what">Models read. Code counts. Teresa asks.</Heading>
        <div className="mt-8"><RolesArt /></div>
        <div className="mt-4 grid gap-5 md:grid-cols-3">
          {[
            ["Jev decides", "Is the listing the same item, down to size and capacity? Is the clause satisfied? Jev answers with calibrated probabilities. Below the threshold, it asks a person.", "#6A4BE0"],
            ["Code computes", "The window, the deadline and the amount come from the store's own published clause, in integer cents. A model never produces a number you act on.", "#C9A45C"],
            ["Teresa confirms", "She says whether it is the same item, approves the claim, and makes the ask, because the store only pays the customer. Only her answers become lasting facts.", "#0E7A57"],
          ].map(([t, b, c], i) => (
            <Reveal key={t} delay={i * 0.08}>
              <GlowCard className="h-full"><div className="p-7"><svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="none" stroke={c} strokeWidth="2" /><circle cx="20" cy="20" r="9" fill={c} opacity=".18" /><path d="M13 20.5 18 25.5 27.5 14.5" fill="none" stroke={c} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg><h3 className="h-display mt-4 text-[30px]">{t}</h3><p className="mt-3 text-muted">{b}</p></div></GlowCard>
            </Reveal>
          ))}
        </div>
      </section>

      {/* 6. proof */}
      <section className="mx-auto max-w-[1180px] px-5 pb-20 sm:px-6">
        <Heading n="04" eyebrow="Proof">Numbers from run files. Misses included.</Heading>
        {facts && !facts.empty && (facts.p1.n_items > 0 || facts.p2.runs_completed > 0) ? (
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            <GlowCard><div className="p-7"><p className="h-display text-[60px]"><CountUp value={facts.p1.n_items} format={(n) => Math.round(n).toString()} /></p><p className="text-muted">real items with a usable first reading</p><div className="mt-3"><Source kind="real public data" /></div></div></GlowCard>
            <GlowCard><div className="p-7"><p className="h-display text-[60px] text-owed-ink"><CountUp value={facts.p1.owed_total_cents} format={(n) => money(Math.round(n))} /></p><p className="text-muted">owed across those items</p><div className="mt-3"><Source kind="real public data" /></div></div></GlowCard>
            <GlowCard><div className="p-7"><p className="h-display text-[60px]"><CountUp value={facts.p2.runs_completed} format={(n) => Math.round(n).toString()} /></p><p className="text-muted">unattended runs nobody started</p><div className="mt-3"><Source kind="unattended run" /></div></div></GlowCard>
          </div>
        ) : (
          <div className="stage relative mt-10 overflow-hidden rounded-[28px] p-8 text-paper sm:p-10">
            <svg aria-hidden="true" viewBox="0 0 400 160" className="absolute -right-6 bottom-0 hidden h-[90%] opacity-70 md:block">{[0, 1, 2, 3, 4, 5, 6].map((i) => <motion.rect key={i} x={20 + i * 52} width="34" rx="8" fill="url(#pg)" initial={{ y: 160, height: 0 }} whileInView={{ y: 150 - (30 + ((i * 37) % 80)), height: 30 + ((i * 37) % 80) }} viewport={{ once: true }} transition={{ delay: i * 0.08, duration: 0.8 }} />)}<defs><linearGradient id="pg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#C9A45C" /><stop offset="1" stopColor="#6A4BE0" /></linearGradient></defs></svg>
            <p className="font-display text-3xl">Measuring now.</p>
            <p className="mt-2 max-w-xl text-lilac-100">An unattended watch of real Target items started on Nov 26 and runs through Black Friday week. This page shows its numbers the moment the run files exist, and nothing before.</p>
          </div>
        )}
        <p className="mt-6"><Link to="/proof">Open the proof page, with misses and break tests</Link></p>
      </section>

      {/* 7. partners */}
      <section className="mx-auto max-w-[1180px] px-5 pb-20 sm:px-6">
        <Heading n="05" eyebrow="Partners doing real jobs">Delete any one and a step disappears.</Heading>
        <Reveal className="mt-8"><GlowCard><div tabIndex={0} role="region" aria-label="Partners table, scrollable" className="scroll-x rounded-[21px]">
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
              ].map(([a, b, c]) => (<tr key={a}><td className="whitespace-nowrap font-display text-[19px]">{a}</td><td>{b}</td><td className="text-muted">{c}</td></tr>))}
            </tbody>
          </table></div></GlowCard></Reveal>
      </section>

      {/* 8. call to action */}
      <section className="mx-auto max-w-[1180px] px-5 pb-8 sm:px-6">
        <div className="stage relative overflow-hidden rounded-[32px] p-8 text-paper sm:p-14">
          <svg aria-hidden="true" viewBox="0 0 600 300" className="absolute inset-0 h-full w-full opacity-40"><defs><linearGradient id="cg" x1="0" x2="1"><stop offset="0" stopColor="#C9A45C" /><stop offset="1" stopColor="#BFAEF6" /></linearGradient></defs>{[60, 110, 170, 240].map((r) => <circle key={r} cx="520" cy="60" r={r} fill="none" stroke="url(#cg)" strokeOpacity=".35" />)}</svg>
          <h2 className="h-display relative max-w-2xl text-[clamp(30px,4vw,54px)]">Your own receipt, live, in under a minute.</h2>
          <p className="relative mt-3 max-w-xl text-lilac-100">Paste a Target or Best Buy product link, the price you paid and the date. A pooled Sprite wakes, reads the page through Apify, and Salvor decides.</p>
          <Link to="/try" className="btn btn-primary relative mt-7 no-underline">Try your own receipt</Link>
        </div>
      </section>
    </>
  );
}
