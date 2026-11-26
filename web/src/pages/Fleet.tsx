import { useGet, when, usd } from "../api";
import { Banner } from "../ui/Art";
import { GlowCard, Loading, ErrorBox, Empty, Eyebrow, StatusChip } from "../ui/bits";

type F = { at: string; error: string | null; rung: string; sprites: any[] };

function Spark({ data }: { data: { h: string; c: number }[] }) {
  if (!data.length) return <span className="text-muted">no wakes</span>;
  const max = Math.max(...data.map((d) => d.c));
  return (
    <svg width="96" height="24" role="img" aria-label={`${data.length} hours with wakes`}>
      {data.slice(-16).map((d, i) => <rect key={d.h} x={i * 6} y={24 - (d.c / max) * 22} width="4" height={(d.c / max) * 22} rx="1" fill="#6A4BE0" />)}
    </svg>
  );
}

export default function Fleet() {
  const { data, error, loading, reload } = useGet<F>("/api/fleet", 30000);
  const rule = (e: any) => { const r = e?.rules; if (!r) return "unknown"; if (!r.length) return "unrestricted"; return r.map((x: any) => `${x.action ?? "allow"} ${x.domain ?? x.include}`).join(", "); };
  return (
    <div className="mx-auto max-w-[1180px] px-5 pb-10 pt-10 sm:px-6">
      <Banner motif="fleet"><Eyebrow n="01">The fleet</Eyebrow>
      <h1 className="h-display mt-3 text-[clamp(36px,5vw,64px)]">Every Sprite, read from Fly now.</h1>
      <p className="mt-3 max-w-2xl text-muted">Generated live from the Sprites API on each load: labels, network rule, newest checkpoints and CPU time. Nothing on this page is typed in.</p></Banner>
      {loading && <div className="mt-8"><Loading steps={["Listing Sprites named slv-*", "Reading each network policy", "Reading checkpoints and usage"]} /></div>}
      {error && <div className="mt-8"><ErrorBox title="The fleet could not be read." retry={reload}>{error}</ErrorBox></div>}
      {data?.error && <div className="mt-8"><ErrorBox title="The Sprites API did not answer.">{data.error}. Salvor shows this instead of a stale list.</ErrorBox></div>}
      {data && !data.error && (
        <div data-tour="fleet" className="mt-8">
          <p className="text-[13px] text-muted">Read at {when(data.at)}. Sprites API access rung: <span className="mono">{data.rung}</span>.</p>
          {data.sprites.length === 0 ? <div className="mt-4"><Empty title="No Sprites yet.">Receipt Sprites appear here as they are born.</Empty></div> : (
            <GlowCard className="mt-4 overflow-hidden"><div tabIndex={0} role="region" aria-label="Scrollable table" className="scroll-x"><table className="t min-w-[900px]">
              <thead><tr><th>Sprite</th><th>State</th><th>Labels</th><th>Egress rule</th><th>Checkpoints</th><th>CPU time</th><th>Last wake</th><th>Wakes</th></tr></thead>
              <tbody>{data.sprites.map((s) => (
                <tr key={s.name}><td className="mono whitespace-nowrap text-violet-ink">{s.name}</td><td><StatusChip status={s.status === "running" ? "awake" : s.status === "warm" ? "watching" : "retired"} /> <span className="text-[12px] text-muted">{s.status}</span></td>
                  <td>{s.labels.length ? s.labels.map((l: string) => <span key={l} className="chip chip-violet mr-1">{l}</span>) : <span className="text-muted">none</span>}</td>
                  <td className="mono text-[12px]">{rule(s.egress)}</td>
                  <td className="mono text-[12px]">{s.checkpoints.length ? s.checkpoints.map((c: any) => c.id).join(" ") : "none"}</td>
                  <td className="num">{s.usage ? `${s.usage.cpu_time_sec.toFixed(1)} s${s.usage.partial ? " (partial)" : ""}` : "n/a"}</td>
                  <td className="whitespace-nowrap text-[13px]">{when(s.last_wake)}{s.last_wake_ms ? ` · ${(s.last_wake_ms / 1000).toFixed(1)} s` : ""}</td>
                  <td><Spark data={s.wakes} /></td></tr>))}</tbody></table></div></GlowCard>
          )}
          <p className="mt-4 text-[13px] text-muted">CPU cost uses Fly's published rate of {usd(0.0385, 4)} per CPU-hour. The per-receipt bill is on the proof page.</p>
        </div>
      )}
    </div>
  );
}
