import { Link } from "react-router-dom";
import { useGet, money, when, type Receipt } from "../api";
import { Banner } from "../ui/Art";
import { GlowCard, StatusChip, DaysRing, Loading, ErrorBox, Empty, Eyebrow, CountUp } from "../ui/bits";

type Resp = { receipts: Receipt[]; next_wake: string; headline: { receipts: number; owed_cents: number; claims: number; observations: number; asks_open: number } };

export default function Household() {
  const { data, error, loading, reload } = useGet<Resp>("/api/receipts", 30000);
  return (
    <div className="mx-auto max-w-[1180px] px-5 pb-8 pt-10 sm:px-6">
      <Banner motif="ledger"><Eyebrow n="01">The household</Eyebrow>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <h1 className="h-display text-[clamp(36px,5vw,64px)]">Teresa's receipts</h1>
        <span className="chip chip-mute">Sample household</span>
      </div>
      <p className="mt-3 max-w-2xl text-muted">Teresa is a night shift pharmacist in Tucson who buys gifts on her phone. These are her sample receipts. Each one has its own Sprite, named on the card.</p></Banner>

      {loading && <div className="mt-8"><Loading steps={["Opening the ledger", "Reading each receipt's last wake", "Counting what is owed"]} /></div>}
      {error && <div className="mt-8"><ErrorBox title="The ledger could not be read." retry={reload}>{error}</ErrorBox></div>}
      {data && (
        <>
          <dl className="mt-8 grid gap-3 sm:grid-cols-4">
            {[["Receipts watched", <CountUp key="a" value={data.headline.receipts} format={(n) => String(Math.round(n))} />], ["Owed right now", <span key="b" className="text-owed-ink"><CountUp value={data.headline.owed_cents} format={(n) => money(Math.round(n))} /></span>], ["Readings taken", <CountUp key="c" value={data.headline.observations} format={(n) => String(Math.round(n))} />], ["Next wake", <span key="d" className="text-[26px]">{when(data.next_wake)}</span>]].map(([k, v], i) => (
              <div key={i} className="rounded-2xl border border-hair bg-white/70 p-4"><dt className="eyebrow">{k as string}</dt><dd className="h-display mt-2 text-[34px]">{v}</dd></div>
            ))}
          </dl>
          {data.receipts.length === 0 ? (
            <div className="mt-8"><Empty title="No receipts yet.">Forward an order email to the Salvor inbox, or drop a photo in the Salvor/Receipts folder in Box. A Sprite is born for each one.</Empty></div>
          ) : (
            <ul data-tour="cards" className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {data.receipts.map((r) => (
                <li key={r.id}>
                  <Link to={`/app/r/${r.id}`} className="block h-full no-underline text-ink">
                    <GlowCard className="perf h-full overflow-hidden !rounded-t-none p-5 pt-6">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0"><p className="mono truncate text-violet-ink">{r.sprite ?? "no Sprite yet"}</p><h2 className="mt-1 text-[18px] font-semibold leading-snug">{r.title}</h2></div>
                        <DaysRing days={r.days_left} />
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-2"><StatusChip status={r.status} /><span className="chip chip-mute">{r.retailer === "target" ? "Target" : "Best Buy"}</span></div>
                      <p className="mt-4 num flex items-baseline justify-between text-[15px]"><span className="text-muted">Paid {money(r.paid_cents)}</span><span>{r.last?.price_cents != null ? `now ${money(r.last.price_cents)}` : "not read yet"}</span></p>
                      {r.last && (r.last.owed_cents ?? 0) > 0 && <p className="num mt-2 font-display text-[28px] text-owed-ink">Owed {money(r.last.owed_cents)}</p>}
                      <p className="mt-3 text-[12px] text-muted">Last wake {when(r.last_wake)}. Next {r.next_wake ? when(r.next_wake) : "none"}.</p>
                    </GlowCard>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
