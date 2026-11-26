// Small zone-aware date helpers on Intl only (no dependencies).
function parts(d: Date, tz: string) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const o: Record<string, number> = {};
  for (const p of f.formatToParts(d)) if (p.type !== "literal") o[p.type] = Number(p.value);
  return o;
}

// Offset (ms) of a zone at an instant: local wall clock minus UTC.
function offsetMs(d: Date, tz: string): number {
  const p = parts(d, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(d.getTime() / 1000) * 1000;
}

// The UTC instant at which the local wall clock in `tz` reads y-m-d h:m:s.
export function zonedInstant(y: number, m: number, d: number, h: number, mi: number, s: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d, h, mi, s);
  let t = guess - offsetMs(new Date(guess), tz);
  t = guess - offsetMs(new Date(t), tz);
  return new Date(t);
}

export function ymd(date: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`bad date "${date}", expected YYYY-MM-DD`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function endOfDay(date: string, tz: string): Date {
  const [y, m, d] = ymd(date);
  return zonedInstant(y, m, d, 23, 59, 59, tz);
}

export function startOfDay(date: string, tz: string): Date {
  const [y, m, d] = ymd(date);
  return zonedInstant(y, m, d, 0, 0, 0, tz);
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = ymd(date);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export function localDate(d: Date, tz: string): string {
  const p = parts(d, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}
