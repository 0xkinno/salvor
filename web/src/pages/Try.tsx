import { useState } from "react";
import { post, money, when, useGet } from "../api";
import { Banner } from "../ui/Art";
import { GlowCard, Loading, ErrorBox, Eyebrow } from "../ui/bits";

const STEPS = ["Waking a pooled Sprite from sleep", "Locking its network to the gateway only", "Apify is reading the page in Apify's cloud", "Pinecone and the typed rules are matching the item", "Salvor's code is computing the amount from the store's clause"];

export default function Try() {
  const caps = useGet<{ total: number; mine: boolean; per_hour_total: number; per_visitor_per_hour: number; resets_at: string }>("/api/try/caps");
  const [url, setUrl] = useState(""), [paid, setPaid] = useState(""), [date, setDate] = useState("2026-11-09");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  const go = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setRes(null); setErr(null);
    const r = await post<any>("/api/try", { url, paid, date });
    if (r.ok) setRes(r.data); else setErr(r.data?.error ?? `HTTP ${r.status}`);
    setBusy(false); caps.reload();
  };
  const c = caps.data;
  return (
    <div className="mx-auto max-w-[920px] px-5 pb-10 pt-10 sm:px-6">
      <Banner motif="try"><Eyebrow n="01">Your own receipt</Eyebrow>
      <h1 className="h-display mt-3 text-[clamp(36px,5vw,64px)]">Try a receipt of yours.</h1>
      <p className="mt-3 max-w-2xl text-muted">Paste a Target or Best Buy product link, what you paid and the date. A pooled Sprite wakes, reads the page through Apify, and Salvor decides. The product on that page is treated as the item you bought. Nothing about you is kept: the Sprite is restored to a blank checkpoint afterwards.</p></Banner>

      <form onSubmit={go} className="mt-8 grid gap-4 rounded-2xl border border-hair bg-white/70 p-5 sm:p-6">
        <label className="block"><span className="text-[14px] font-medium">Product link</span>
          <input required value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" placeholder="https://www.target.com/p/..." className="mt-1 w-full rounded-xl border border-hair bg-white px-4 py-3 text-[16px]" /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block"><span className="text-[14px] font-medium">Price you paid</span>
            <input required value={paid} onChange={(e) => setPaid(e.target.value)} inputMode="decimal" placeholder="129.99" className="mt-1 w-full rounded-xl border border-hair bg-white px-4 py-3 text-[16px]" /></label>
          <label className="block"><span className="text-[14px] font-medium">Date you bought it</span>
            <input required type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full rounded-xl border border-hair bg-white px-4 py-3 text-[16px]" /></label>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <button className="btn btn-primary" disabled={busy || Boolean(c?.mine)}>{busy ? "Working" : "Check my receipt"}</button>
          {c && <p className="text-[13px] text-muted">Caps: {c.per_hour_total} live readings per hour in total, {c.per_visitor_per_hour} per visitor. {c.total} used this hour{c.mine ? ", including yours" : ""}. Resets {when(c.resets_at)}.</p>}
        </div>
      </form>

      <div className="mt-6" aria-live="polite">
        {busy && <Loading steps={STEPS} />}
        {err && <ErrorBox title="No reading this time.">{err}</ErrorBox>}
        {res && (
          <GlowCard className="p-6 sm:p-8">
            <p className="eyebrow">Result in {res.seconds.toFixed(1)} seconds on {res.sprite}</p>
            {res.decision === "owed" && <h2 className="h-display mt-2 text-[clamp(30px,4vw,48px)]">The store owes you <span className="text-owed-ink">{money(res.owed_cents)}</span></h2>}
            {res.decision === "not_owed" && <h2 className="h-display mt-2 text-[clamp(30px,4vw,48px)]">Nothing is owed right now.</h2>}
            {res.decision === "ask" && <h2 className="h-display mt-2 text-[clamp(30px,4vw,48px)]">Not sure yet.</h2>}
            {res.decision === "stale" && <h2 className="h-display mt-2 text-[clamp(30px,4vw,48px)]">The page could not be read.</h2>}
            <p className="mt-3 text-muted">{res.why}</p>
            {res.now_cents != null && <p className="num mt-4 text-[17px]">{res.title}<br />Paid {money(res.paid_cents)}, listed now {money(res.now_cents)}.</p>}
            {res.deadline && <p className="mt-2 text-[14px] text-muted">Deadline under the store's clause: {when(res.deadline)}.</p>}
            {res.checkpoint && <p className="mono mt-3 break-all text-[12px]">checkpoint {res.checkpoint} · sha256 {res.sha256}</p>}
            <ol className="mt-4 list-decimal space-y-1 pl-5 text-[14px] text-muted">{res.steps.map((s: string) => <li key={s}>{s}</li>)}</ol>
          </GlowCard>
        )}
      </div>
    </div>
  );
}
