// A tiny dependency-free PDF writer: text only, Helvetica and Courier, A4/Letter pages, wraps lines.
// Enough for a printable claim packet. Non-Latin1 characters are replaced so the file always opens.
type Block = { text: string; size?: number; mono?: boolean; bold?: boolean; gap?: number };

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
const latin1 = (s: string) => s.replace(/[^\x20-\x7e]/g, "?");

function wrap(text: string, max: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    if (para.trim() === "") { out.push(""); continue; }
    let line = "";
    for (const w of para.split(/\s+/)) {
      if (w.length > max) { if (line) out.push(line); for (let i = 0; i < w.length; i += max) out.push(w.slice(i, i + max)); line = ""; continue; }
      if ((line + " " + w).trim().length > max) { out.push(line); line = w; } else line = (line + " " + w).trim();
    }
    if (line) out.push(line);
  }
  return out;
}

export function makePdf(blocks: Block[]): Uint8Array {
  const W = 612, H = 792, M = 54;
  const pages: string[][] = [[]];
  let y = H - M;
  const put = (s: string) => pages[pages.length - 1].push(s);
  for (const b of blocks) {
    const size = b.size ?? 11;
    const font = b.mono ? "F3" : b.bold ? "F2" : "F1";
    const cw = b.mono ? size * 0.6 : size * 0.5;
    const max = Math.floor((W - 2 * M) / cw);
    for (const ln of wrap(latin1(b.text), max)) {
      if (y < M + size) { pages.push([]); y = H - M; }
      if (ln) put(`BT /${font} ${size} Tf ${M} ${y} Td (${esc(ln)}) Tj ET`);
      y -= size * 1.4;
    }
    y -= b.gap ?? 4;
  }
  const objs: string[] = [];
  const add = (s: string) => { objs.push(s); return objs.length; };
  add("<< /Type /Catalog /Pages 2 0 R >>");
  const kids = pages.map((_, i) => `${6 + i * 2} 0 R`).join(" ");
  add(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>");
  pages.forEach((p, i) => {
    const stream = p.join("\n");
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${7 + i * 2} 0 R >>`);
    add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  let pdf = "%PDF-1.4\n";
  const offs: number[] = [];
  objs.forEach((o, i) => { offs.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("");
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}
