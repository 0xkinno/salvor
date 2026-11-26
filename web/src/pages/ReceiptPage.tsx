import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useGet, post, money, when, dateOnly } from "../api";
import { Banner } from "../ui/Art";
import { GlowCard, StatusChip, Loading, ErrorBox, Eyebrow } from "../ui/bits";

type Obs = { m_model: string | null; id: string; observed_at: string; price_cents: number | null; regular_cents: number | null; decision: string; why: string | null; m_same: string | null; m_conf: number | null; m_clause_p: number | null; checkpoint_id: string | null; evidence_sha256: string | null; owed_cents: number | null; apify_run_id: string | null };
type Detail = any;

const SAME = ["exact", "other_variant", "other_product", "cannot_tell"] as const;

export default function ReceiptPage() {
  const { id } = useParams();
  const { data: d, error, loading, reload } = useGet<Detail>(`/api/receipts/${id}`);
  const [token, setToken] = useState(() => { try { return localStorage.getItem("salvor-token") ?? ""; } catch { return ""; } });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; script?: string[] } | null>(null);
  const [ver, setVer] = useState<any>(null);

  if (loading) return <div className="mx-auto max-w-[1180px] px-5 pt-10"><Loading steps={["Opening the receipt", "Reading its readings", "Finding the clause"]} /></div>;
  if (error || !d) return <div className="mx-auto max-w-[1180px] px-5 pt-10"><ErrorBox title="That receipt could not be opened." retry={reload}>{error ?? "Unknown receipt."}</ErrorBox><p className="mt-4"><Link to="/app">Back to the household</Link></p></div>;

  const obs: Obs[] = d.observations;
  const last = obs[0];
  const claim = d.claim, ask = d.ask && !d.ask.answered_at ? d.ask : null;
  const act = async (fn: () => Promise<{ ok: boolean; status: number; data: any }>, okText: (x: any) => string) => {
    setBusy(true); setMsg(null);
    try { const r = await fn(); setMsg(r.ok ? { ok: true, text: okText(r.data), script: r.data?.sent?.script } : { ok: false, text: r.data?.error ?? `HTTP ${r.status}` }); if (r.ok) reload(); }
    catch (e) { setMsg({ ok: false, text: String((e as Error).message) }); } finally { setBusy(false); }
  };
  const saveToken = (v: string) => { setToken(v); try { localStorage.setItem("salvor-token", v); } catch { /* optional */ } };
  const verify = async () => { setBusy(true); setVer(null); const r = await post<any>(`/api/verify/${last.id}`, {}); setVer(r.data); setBusy(false); };

  return (
    <div className="mx-auto max-w-[1180px] px-5 pb-10 pt-8 sm:px-6">
      <p className="text-[14px]"><Link to="/app">Household</Link> / <span className="mono">{d.id}</span></p>
      <div className="mt-3"><Banner motif="receipt"><div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0"><Eyebrow n="01">The receipt</Eyebrow><h1 className="h-display mt-2 text-[clamp(32px,4.4vw,56px)]">{d.title}</h1>
          <p className="mono mt-2 break-all text-muted">{d.raw_text}</p></div>
        <div className="flex items-center gap-2"><StatusChip status={d.status} /><span className="chip chip-mute mono">{d.sprite ?? "no Sprite"}</span></div>
      </div></Banner></div>

      {/* then and now */}
      <section data-tour="ladder" className="mt-8 grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
        <GlowCard className="p-6">
          <p className="eyebrow">Then and now</p>
          <div className="mt-4 space-y-3 num">
            <Row label={`Paid, ${dateOnly(d.purchased_at)}`} value={money(d.paid_cents)} />
            {last?.regular_cents != null && <Row label="Regular price now" value={money(last.regular_cents)} muted />}
            <Row label={last ? `Listed, ${when(last.observed_at)}` : "Listed now"} value={last?.price_cents != null ? money(last.price_cents) : "not read yet"} />
            {(last?.owed_cents ?? 0) > 0 && <div className="flex items-baseline justify-between border-t border-hair pt-3"><span className="font-semibold">Owed</span><span className="h-display text-[40px] text-owed-ink">{money(last!.owed_cents)}</span></div>}
          </div>
          {last?.why && <p className="mt-4 text-[15px] text-muted">{last.why}</p>}
          {d.facts?.length > 0 && <div className="mt-4 rounded-xl bg-lilac-50 p-3 text-[14px]"><p className="eyebrow mb-1">What Teresa confirmed</p>{d.facts.map((f: any) => <p key={f.at}>{f.statement}</p>)}</div>}
        </GlowCard>

        <GlowCard className="p-6">
          <p className="eyebrow">How it was matched</p>
          {last?.m_same ? (
            <div className="mt-4 space-y-3">
              {SAME.map((c) => {
                const p = c === last.m_same ? last.m_conf ?? 0 : null;
                return (
                  <div key={c}><div className="flex justify-between text-[14px]"><span className={c === last.m_same ? "font-semibold" : "text-muted"}>{c.replace("_", " ")}</span><span className="num">{p !== null ? `${Math.round(p * 100)}%` : ""}</span></div>
                    <div className="mt-1 h-2 rounded bg-paper2"><motion.div className={`h-2 rounded ${c === "exact" ? "bg-owed" : "bg-violet"}`} initial={{ width: 0 }} animate={{ width: `${(p ?? 0) * 100}%` }} transition={{ duration: 0.8 }} /></div></div>
                );
              })}
              <p className="text-[14px]">Clause applies: <span className="num font-semibold">{last.m_clause_p != null ? `${Math.round(last.m_clause_p * 100)}%` : "n/a"}</span>. The decision step never sees an amount.</p>
              <p className="mono text-[12px] text-muted">{last.m_model ?? "decider not recorded"}</p>
            </div>
          ) : <p className="mt-4 text-muted">No decision yet. It is made when the Sprite takes a reading.</p>}
          <p className="mt-4 text-[13px] text-muted">Window: {d.days_left} days left, until {when(d.window_ends_at)}.</p>
        </GlowCard>
      </section>

      {/* clause + evidence */}
      <section className="mt-5 grid gap-5 lg:grid-cols-2">
        <GlowCard className="p-6">
          <p className="eyebrow">The store's own clause</p>
          {d.clause ? <><blockquote className="mt-3 border-l-[3px] border-lilac-300 pl-4 font-display text-[19px] leading-snug">{d.clause.text || "No verified clause is on file for this retailer, so Salvor holds the claim."}</blockquote>
            <p className="mono mt-3 break-all text-muted">{d.clause.source_url}</p><p className="mt-1 text-[14px] text-muted">Checked on {d.clause.checked || "never"}. {d.clause.window_note}</p></> : <p className="mt-3 text-muted">No clause.</p>}
        </GlowCard>
        <GlowCard className="p-6" >
          <div data-tour="evidence">
            <p className="eyebrow">Evidence the platform holds</p>
            {last?.checkpoint_id ? (
              <>
                <p className="mono mt-3 break-all">checkpoint {last.checkpoint_id}<br />sha256 {last.evidence_sha256}<br />Apify run {last.apify_run_id}</p>
                <button className="btn btn-dark mt-4" onClick={verify} disabled={busy}>Verify this claim</button>
                {ver && (
                  <div className="mt-4 rounded-xl border border-hair bg-white p-3 text-[14px]" role="status">
                    {ver.error ? <p className="text-ember-ink">{ver.error}</p> : <>
                      <p className={ver.ok ? "font-semibold text-owed-ink" : "font-semibold text-ember-ink"}>{ver.ok ? "Match" : "No match"}: {ver.why}</p>
                      <p className="mono mt-2 break-all">claim {String(ver.expected_sha256).slice(0, 24)}…<br />Fly copy {String(ver.mount_sha256 ?? "unreadable").slice(0, 24)}…<br />live file {String(ver.live_sha256 ?? "n/a").slice(0, 24)}…</p></>}
                  </div>
                )}
              </>
            ) : <p className="mt-3 text-muted">No checkpointed reading yet.</p>}
          </div>
        </GlowCard>
      </section>

      {/* ask card */}
      {ask && (
        <section className="mt-5">
          <GlowCard className="border-[#F6CDB4] p-6">
            <p className="eyebrow !text-ember-ink">One question, only because it matters</p>
            <h2 className="h-display mt-2 text-[30px]">{ask.question}</h2>
            <p className="mt-2 text-muted">Salvor is not sure enough to claim on its own. Your answer becomes a lasting fact.</p>
            {d.candidates?.[0] && <p className="mono mt-3 break-all text-[13px]">{d.candidates[0].title} · {money(d.candidates[0].price_cents)}</p>}
            <div className="mt-4 flex flex-wrap gap-3">
              <button className="btn btn-primary" disabled={busy} onClick={() => act(() => post(`/api/asks/${ask.id}/answer`, { answer: "same" }, token), () => "Saved. Thank you.")}>Yes, the same item</button>
              <button className="btn btn-ghost" disabled={busy} onClick={() => act(() => post(`/api/asks/${ask.id}/answer`, { answer: "different" }, token), () => "Saved. Salvor will keep watching.")}>No, a different one</button>
              <button className="btn btn-ghost" disabled={busy} onClick={() => act(() => post(`/api/asks/${ask.id}/answer`, { answer: "in_store" }, token), () => "Saved. Store purchases are matched at Guest Services.")}>I bought it in store</button>
            </div>
          </GlowCard>
        </section>
      )}

      {/* claim sheet */}
      {claim?.packet && (
        <section className="mt-5">
          <GlowCard className="p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><p className="eyebrow">Claim ready</p><h2 className="h-display mt-2 text-[clamp(30px,4vw,48px)]">Target owes you <span className="text-owed-ink">{money(claim.amount_cents)}</span></h2>
                <p className="mt-2 text-[15px]">Deadline <span className={`font-semibold ${new Date(claim.deadline).getTime() - Date.now() < 48 * 3600e3 ? "text-ember-ink" : ""}`}>{when(claim.deadline)}</span>.</p></div>
              <a className="btn btn-ghost no-underline" href={`/claims/${claim.id}`} target="_blank" rel="noreferrer">Open the packet as the store sees it</a>
            </div>
            <p className="mt-4 rounded-xl bg-paper2 p-4 text-[15px]">{claim.packet.words}</p>
            <p className="mt-2 text-[12px] text-muted">Words by: {claim.packet.words_source}. The amounts were inserted by code and checked against the ledger.</p>
            <p className="mono mt-3 break-all text-[12px] text-muted">digest {claim.digest}</p>
            {claim.approved_at ? (
              <p className="mt-5 font-semibold text-owed-ink">Approved {when(claim.approved_at)} via {claim.channel ?? "script"}.</p>
            ) : (
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button className="btn btn-primary" disabled={busy} onClick={() => act(() => post(`/api/claims/${claim.id}/approve`, { digest: claim.digest }, token), (x) => `Approved. ${x.sent.note}`)}>Approve this claim</button>
                <label className="text-[13px] text-muted">Household token (owner only) <input value={token} onChange={(e) => saveToken(e.target.value)} type="password" className="ml-2 w-44 rounded-lg border border-hair bg-white px-3 py-2 text-[14px] text-ink" /></label>
              </div>
            )}
          </GlowCard>
        </section>
      )}

      <AnimatePresence>{msg && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={`mt-5 rounded-2xl border p-4 ${msg.ok ? "border-[#BFE3D4] bg-[#E7F5EF] text-owed-ink" : "border-[#F6CDB4] bg-[#FDEEE4] text-ember-ink"}`} role="status">
          <p className="font-semibold">{msg.text}</p>
          {msg.script && <ol className="mt-2 list-decimal pl-5 text-[15px] text-ink">{msg.script.map((s) => <li key={s}>{s}</li>)}</ol>}
        </motion.div>)}</AnimatePresence>

      <section className="mt-8">
        <p className="eyebrow">Every reading</p>
        <div tabIndex={0} role="region" aria-label="Scrollable table" className="scroll-x mt-3 rounded-2xl border border-hair bg-white/70"><table className="t min-w-[640px]"><thead><tr><th>When</th><th>Price</th><th>Decision</th><th>Why</th></tr></thead>
          <tbody>{obs.length ? obs.map((o) => (<tr key={o.id}><td className="whitespace-nowrap">{when(o.observed_at)}</td><td className="num">{money(o.price_cents)}</td><td><span className={`chip ${o.decision === "owed" ? "chip-owed" : o.decision === "ask" ? "chip-ember" : "chip-mute"}`}>{o.decision.replace("_", " ")}</span></td><td className="text-[14px] text-muted">{o.why}</td></tr>)) : <tr><td colSpan={4} className="text-muted">No readings yet. The next wake is on the schedule above.</td></tr>}</tbody></table></div>
      </section>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return <div className="flex items-baseline justify-between"><span className={muted ? "text-muted" : ""}>{label}</span><span className={`font-display text-[26px] ${muted ? "text-muted" : ""}`}>{value}</span></div>;
}
