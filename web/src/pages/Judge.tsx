import { Link } from "react-router-dom";
import { Banner } from "../ui/Art";
import { GlowCard, Eyebrow } from "../ui/bits";

const PATHS = [
  ["60 seconds", [["/", "Read the hero. A real item, what was paid, what it costs today, what is owed."], ["/app", "Open Teresa's receipts. Each card shows its own Sprite, days left, last and next wake."], ["/try", "Paste your own Target or Best Buy link. A pooled Sprite reads it live."]]],
  ["3 minutes", [["/app", "Open the receipt with money owed. Read the then and now ladder and the match scores."], ["/app", "On that receipt, press Verify this claim. It reads Fly's read-only checkpoint copy and shows both hashes."], ["/fleet", "See every Sprite with labels, its one-name network rule, checkpoints and CPU time, read from Fly now."], ["/proof", "See what is measured, what is not, and the break tests with their failures."]]],
  ["10 minutes", [["/how", "Read the diagram and the delete test for each Sprite feature."], ["/proof", "Check the curated and wild rates, Pinecone against plain word overlap, and the cost per receipt from Fly's meter."], ["/api/status", "Open the raw measured status. Every connection has a timestamp."], ["/app", "Trigger a failure: answer 'a different one' on a question, or use a link to a variant. Salvor drops the claim and says why."]]],
] as const;

export default function Judge() {
  return (
    <div className="mx-auto max-w-[920px] px-5 pb-10 pt-10 sm:px-6">
      <Banner motif="judge"><Eyebrow n="01">For judges</Eyebrow>
      <h1 className="h-display mt-3 text-[clamp(36px,5vw,64px)]">Three ways to look, no login.</h1>
      <p className="mt-3 text-muted">Everything below works on the live site. The guided tour button at the top walks the same route in seven steps.</p></Banner>
      <div className="mt-8 space-y-5">
        {PATHS.map(([t, steps]) => (
          <GlowCard key={t} className="p-6"><h2 className="h-display text-[30px]">{t}</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5">{steps.map(([to, s]) => <li key={s}><Link to={to}>{to}</Link>. {s}</li>)}</ol></GlowCard>
        ))}
      </div>
      <p className="mt-6 text-[14px] text-muted">The sample household is labelled. Public approvals reach only the owner's own test inbox and are capped per day. Live readings on the try page are capped at three an hour.</p>
    </div>
  );
}
