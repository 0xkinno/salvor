// Offline verification of a claim from a terminal.
//   node scripts/verify-claim.mjs https://slv-home-xxxx.sprites.app c-1a2b3c4d
// Fetches the claim, asks slv-home to read the evidence from the platform's read-only checkpoint
// mount inside the receipt Sprite, and prints both hashes. Exit code 0 only when they match.
const [base, claimId] = process.argv.slice(2);
if (!base || !claimId) { console.error("usage: verify-claim.mjs <base url> <claim id>"); process.exit(2); }
const j = async (path, init) => { const r = await fetch(base.replace(/\/$/, "") + path, init); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const c = await j(`/api/claims/${claimId}`);
if (c.status !== 200) { console.error(`claim not found: HTTP ${c.status}`); process.exit(2); }
const { packet, claim } = c.body;
console.log(`claim ${claimId}: ${packet.item}, owed ${(claim.amount_cents / 100).toFixed(2)}`);
console.log(`cites checkpoint ${packet.evidence.checkpoint} on ${packet.evidence.sprite}, sha256 ${packet.evidence.sha256}`);
const v = await j(`/api/verify/${claim.observation_id}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
if (v.status !== 200) { console.error(`verify failed: HTTP ${v.status} ${JSON.stringify(v.body)}`); process.exit(2); }
const r = v.body;
console.log(`Fly copy   ${r.mount_sha256}`);
console.log(`live file  ${r.live_sha256}`);
console.log(`${r.ok ? "MATCH" : "NO MATCH"}: ${r.why}`);
process.exit(r.ok ? 0 : 1);
