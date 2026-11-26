import { Link } from "react-router-dom";
import { useGet, when } from "../api";
import { Banner } from "../ui/Art";
import { GlowCard, Eyebrow } from "../ui/bits";

function Diagram() {
  const box = (x: number, y: number, w: number, h: number, t: string, s?: string, hi = false) => (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="12" fill={hi ? "#ECE5FD" : "#fff"} stroke={hi ? "#6A4BE0" : "#E2DCD2"} strokeWidth={hi ? 1.6 : 1} />
      <text x={x + w / 2} y={y + (s ? h / 2 - 3 : h / 2 + 5)} textAnchor="middle" fontSize="14" fontWeight="600" fill="#17132B" fontFamily="Switzer">{t}</text>
      {s && <text x={x + w / 2} y={y + h / 2 + 15} textAnchor="middle" fontSize="11" fill="#5C566F" fontFamily="JetBrains Mono">{s}</text>}
    </g>
  );
  const arrow = (d: string) => <path d={d} fill="none" stroke="#6A4BE0" strokeWidth="1.6" markerEnd="url(#ah)" />;
  return (
    <svg viewBox="0 0 980 470" role="img" aria-label="Apify's schedule knocks slv-home. Home wakes each receipt Sprite. Each receipt Sprite reaches Apify, Jev and Pinecone through the gateway only. Home reaches Box, Ollama and AgentMail through the gateway and shows Teresa the claim." className="h-auto w-full">
      <defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="#6A4BE0" /></marker></defs>
      {box(20, 30, 190, 62, "Apify schedule", "every 6 hours", true)}
      {box(20, 200, 190, 62, "Teresa", "phone, email, Box")}
      {box(300, 110, 230, 120, "slv-home", "label salvor-hands", true)}
      <text x="415" y="214" textAnchor="middle" fontSize="11" fill="#5C566F" fontFamily="JetBrains Mono">app, API, ledger, policy</text>
      {box(300, 300, 230, 60, "slv-r-7q2a", "label salvor-eyes")}
      {box(300, 372, 230, 60, "slv-r-k9da", "asleep")}
      {box(640, 20, 150, 52, "Apify datasets")}
      {box(640, 86, 150, 52, "TypeSafe Jev")}
      {box(640, 152, 150, 52, "Pinecone")}
      {box(640, 250, 150, 52, "Ollama Cloud")}
      {box(640, 316, 150, 52, "Box")}
      {box(640, 382, 150, 52, "AgentMail")}
      <rect x="560" y="14" width="46" height="430" rx="23" fill="#17132B" />
      <text x="583" y="236" textAnchor="middle" fontSize="12" fill="#F6F4F0" fontFamily="JetBrains Mono" transform="rotate(-90 583 236)">Sprites gateway, deny by default</text>
      {arrow("M210 61H255V150H300")}
      {arrow("M415 230V300")}
      {arrow("M530 330H560")}
      {arrow("M606 46H640")}{arrow("M606 112H640")}{arrow("M606 178H640")}
      {arrow("M530 150H560")}
      {arrow("M606 276H640")}{arrow("M606 342H640")}{arrow("M606 408H640")}
      {arrow("M300 170 210 230")}
      <text x="805" y="46" fontSize="11" fill="#5C566F" fontFamily="JetBrains Mono">eyes read</text>
      <text x="805" y="276" fontSize="11" fill="#5C566F" fontFamily="JetBrains Mono">hands write</text>
    </svg>
  );
}

const DELETE = [
  ["Sleeping computers", "Without cheap sleeping computers, one Sprite per receipt is unaffordable and collapses into one shared process where a poisoned page sits beside your email credential."],
  ["Access policy and labels", "Without it, a receipt Sprite could send email or write to Box."],
  ["Network policy", "Without it, an instruction hidden in a page could make a receipt Sprite fetch anything."],
  ["Checkpoints", "Without them, the evidence lives only in our own database, which we could edit."],
  ["Usage API", "Without it, cost is our estimate, not the platform's."],
  ["Exec and filesystem APIs", "Without them, home cannot wake or equip its children."],
];

export default function How() {
  const st = useGet<any>("/api/status").data;
  return (
    <div className="mx-auto max-w-[1180px] px-5 pb-10 pt-10 sm:px-6">
      <Banner motif="how"><Eyebrow n="01">How it works</Eyebrow>
      <h1 className="h-display mt-3 max-w-4xl text-[clamp(36px,5vw,64px)]">A Sprite has no clock and holds no keys.</h1>
      <p className="mt-4 max-w-3xl text-[18px] text-muted">It sleeps until something knocks, and it reaches the outside only through a gateway that matches its name and labels. Salvor is built around those two facts.</p></Banner>

      <GlowCard className="mt-8 p-4 sm:p-6"><Diagram /></GlowCard>

      <section className="mt-10 grid gap-5 md:grid-cols-3">
        {[["The loop", "An Apify schedule runs every six hours and knocks slv-home. Home wakes each receipt Sprite, three at a time. Each reads its own page data, asks Jev, writes evidence, takes a checkpoint, reports, and sleeps."],
          ["Where the intelligence is, and is not", "Models read and decide with calibrated confidence. Code computes every amount and date. Teresa confirms and asks. Ollama never produces a number you act on. Jev never sees an amount. Untrusted page text is read only inside receipt Sprites."],
          ["The two wake sources", "The Apify schedule webhook, and a backup tick from a GitHub Actions cron. Both are idempotent by run id, so a duplicate knock changes nothing."]].map(([a, b]) => (
          <GlowCard key={a} className="p-6"><h2 className="h-display text-[26px]">{a}</h2><p className="mt-3 text-muted">{b}</p></GlowCard>))}
      </section>

      <section className="mt-12"><h2 className="h-display text-[34px]">Why a Sprite, specifically</h2>
        <div tabIndex={0} role="region" aria-label="Scrollable table" className="scroll-x mt-4 rounded-2xl border border-hair bg-white/70"><table className="t min-w-[640px]"><thead><tr><th>Primitive</th><th>Delete test</th></tr></thead><tbody>{DELETE.map(([a, b]) => <tr key={a}><td className="whitespace-nowrap font-medium">{a}</td><td className="text-[15px]">{b}</td></tr>)}</tbody></table></div>
      </section>

      <section className="mt-12"><h2 className="h-display text-[34px]">Live, substituted, designed</h2>
        <p className="mt-2 text-muted">Read from <Link to="/proof">the measured status</Link>{st ? ` at ${when(st.at)}` : ""}. A substitute is named here with its reason. Nothing is shown as connected unless a call just succeeded.</p>
        <div tabIndex={0} role="region" aria-label="Scrollable table" className="scroll-x mt-4 rounded-2xl border border-hair bg-white/70"><table className="t min-w-[640px]"><thead><tr><th>Part</th><th>State</th><th>Measured</th></tr></thead><tbody>
          {st ? <>
            <tr><td>Sprites gateway</td><td><span className={`chip ${st.gateway.ok ? "chip-owed" : "chip-ember"}`}>{st.gateway.ok ? "live" : "unreachable"}</span></td><td className="text-[14px]">{st.gateway.ok ? `${st.gateway.connections.length} connections visible to slv-home` : st.gateway.error}</td></tr>
            {st.hands.map((h: any) => <tr key={h.conn}><td className="mono">{h.conn}</td><td><span className={`chip ${h.ok ? "chip-owed" : "chip-ember"}`}>{h.ok ? "live" : "not connected"}</span></td><td className="text-[14px]">{h.ok ? `HTTP ${h.status} in ${h.ms} ms at ${when(h.at)}` : h.note}</td></tr>)}
            {st.eyes.map((h: any) => <tr key={h.conn}><td className="mono">{h.conn}</td><td><span className={`chip ${h.ok ? "chip-owed" : "chip-mute"}`}>{h.ok ? "live" : "no call yet"}</span></td><td className="text-[14px]">{h.at ? `last call ${when(h.at)}, HTTP ${h.status}, ${h.note}` : h.note}</td></tr>)}
            <tr><td>Wake sources</td><td><span className="chip chip-violet">designed</span></td><td className="text-[14px]">Apify schedule webhook and GitHub Actions backup tick</td></tr>
          </> : <tr><td colSpan={3} className="text-muted">Reading status.</td></tr>}
        </tbody></table></div>
      </section>
    </div>
  );
}
