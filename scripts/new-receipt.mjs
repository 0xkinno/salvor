// Add a receipt to slv-home's ledger and birth its Sprite, from a terminal. Uses the home server's
// household-token routes only, so it needs no partner key.
//   node scripts/new-receipt.mjs <base url> <household token> --retailer target --date 2026-11-09 \
//     --line "NINJA AF161 6QT AIR FRYER" --paid 129.99 --url https://www.target.com/p/.../A-12345678
const [base, token, ...rest] = process.argv.slice(2);
const a = Object.fromEntries(rest.reduce((acc, v, i, arr) => (v.startsWith("--") ? [...acc, [v.slice(2), arr[i + 1]]] : acc), []));
if (!base || !token || !a.line || !a.paid || !a.date) { console.error("usage: new-receipt.mjs <base> <token> --line ... --paid 129.99 --date YYYY-MM-DD [--retailer target] [--url ...] [--qty 1]"); process.exit(2); }
const r = await fetch(`${base.replace(/\/$/, "")}/api/receipts`, {
  method: "POST", headers: { "content-type": "application/json", "x-household-token": token },
  body: JSON.stringify({ retailer: a.retailer ?? "target", date: a.date, line: a.line, paid: a.paid, qty: Number(a.qty ?? 1), url: a.url ?? null }),
});
console.log(r.status, await r.text());
process.exit(r.ok ? 0 : 1);
