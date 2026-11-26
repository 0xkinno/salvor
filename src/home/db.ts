// SQLite on slv-home (node:sqlite). The ledger. Append-only events, durable sponsor call counters.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

let handle: DatabaseSync | null = null;

export function dbPath(): string {
  return process.env.SALVOR_DB ?? (process.env.SPRITE_NAME ? "/home/sprite/salvor/data/salvor.db" : ".salvor-local/salvor.db");
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS receipts (id TEXT PRIMARY KEY, retailer TEXT NOT NULL, channel TEXT NOT NULL,
  purchased_at TEXT NOT NULL, source TEXT NOT NULL, box_file_id TEXT, sprite TEXT, status TEXT NOT NULL,
  window_ends_at TEXT NOT NULL, created_at TEXT NOT NULL, title TEXT, household TEXT NOT NULL DEFAULT 'sample');
CREATE TABLE IF NOT EXISTS lines (id TEXT PRIMARY KEY, receipt_id TEXT NOT NULL, raw_text TEXT NOT NULL,
  paid_cents INTEGER NOT NULL, qty INTEGER NOT NULL DEFAULT 1, listing_url TEXT, listing_id TEXT,
  confirmed_by_human INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS observations (id TEXT PRIMARY KEY, line_id TEXT NOT NULL, observed_at TEXT NOT NULL,
  price_cents INTEGER, regular_cents INTEGER, seller TEXT, in_stock INTEGER, apify_run_id TEXT,
  checkpoint_id TEXT, evidence_sha256 TEXT, evidence_day TEXT, jev_same_item TEXT, jev_same_conf REAL,
  jev_owed_p REAL, decision TEXT NOT NULL, why TEXT, owed_cents INTEGER, clause_id TEXT, deadline TEXT);
CREATE TABLE IF NOT EXISTS claims (id TEXT PRIMARY KEY, line_id TEXT NOT NULL, amount_cents INTEGER NOT NULL,
  clause_id TEXT NOT NULL, deadline TEXT NOT NULL, box_folder_id TEXT, shared_link TEXT,
  digest TEXT NOT NULL, approved_at TEXT, sent_at TEXT, channel TEXT, outcome TEXT, observation_id TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS approvals (digest TEXT PRIMARY KEY, claim_id TEXT NOT NULL, issued_at TEXT NOT NULL, used_at TEXT);
CREATE TABLE IF NOT EXISTS facts_human (id TEXT PRIMARY KEY, line_id TEXT, statement TEXT NOT NULL, at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sponsor_calls (provider TEXT NOT NULL, route TEXT NOT NULL, status INTEGER NOT NULL,
  ms INTEGER NOT NULL, sprite TEXT NOT NULL, at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, body TEXT NOT NULL, at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS asks (id TEXT PRIMARY KEY, line_id TEXT NOT NULL, question TEXT NOT NULL, options TEXT NOT NULL,
  asked_at TEXT NOT NULL, answered_at TEXT, answer TEXT);
CREATE TABLE IF NOT EXISTS wakes (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, sprite TEXT NOT NULL,
  source TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT, ok INTEGER, cold_ms INTEGER, UNIQUE(run_id, sprite));
CREATE TABLE IF NOT EXISTS costs (sprite TEXT PRIMARY KEY, cpu_sec REAL, mem_byte_sec REAL, partial INTEGER,
  fetched_at TEXT NOT NULL, cpu_usd REAL, mem_usd REAL, storage_usd REAL, total_usd REAL, days_watched REAL);
CREATE TABLE IF NOT EXISTS budget (day TEXT NOT NULL, provider TEXT NOT NULL, calls INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(day, provider));
CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
CREATE TRIGGER IF NOT EXISTS events_no_update BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT, 'events are append only'); END;
CREATE TRIGGER IF NOT EXISTS events_no_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT, 'events are append only'); END;
`;

export function db(): DatabaseSync {
  if (handle) return handle;
  const p = dbPath();
  if (p !== ":memory:") mkdirSync(dirname(p), { recursive: true });
  handle = new DatabaseSync(p);
  handle.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = OFF;");
  handle.exec(SCHEMA);
  return handle;
}

export function closeDb() {
  handle?.close();
  handle = null;
}

export function event(kind: string, body: unknown) {
  db().prepare("INSERT INTO events (kind, body, at) VALUES (?,?,?)").run(kind, JSON.stringify(body), new Date().toISOString());
}

export function kvGet(k: string): string | null {
  const r = db().prepare("SELECT v FROM kv WHERE k=?").get(k) as { v: string } | undefined;
  return r ? r.v : null;
}
export function kvSet(k: string, v: string) {
  db().prepare("INSERT INTO kv (k,v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").run(k, v);
}
