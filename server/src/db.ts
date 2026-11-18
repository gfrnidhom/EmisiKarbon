// Lapisan database async dengan dua driver:
//  - PostgreSQL (utama)  → set DATABASE_URL=postgres://user@localhost:5432/jejakhijau
//  - SQLite (cadangan)   → tanpa DATABASE_URL, file server/data/jejakhijau.sqlite
// Kueri ditulis sekali (placeholder "?", fungsi datetime('now')) lalu diterjemahkan per dialek.
import { AsyncLocalStorage } from "node:async_hooks"
import { mkdirSync } from "fs"
import { dirname } from "path"
import { SCHEMA } from "./schema"
import { CONFIG, applyEnvConfig } from "./config"

export type Row = Record<string, any>
export interface RunResult { lastInsertRowid: number; changes: number }

const DATABASE_URL = CONFIG.DATABASE_URL
export const DIALECT: "postgres" | "sqlite" = DATABASE_URL ? "postgres" : "sqlite"

// Tabel yang memakai kolom id serial → INSERT otomatis "RETURNING id"
const ID_TABLES = new Set([
  "regions", "organizations", "users", "role_assignments", "invitations", "verifier_assignments", "emission_factors", "species", "baselines",
  "baseline_components", "activity_records", "evidence", "assets", "tree_measurements", "waste_sessions", "waste_weighings", "mobility_surveys",
  "mobility_responses", "env_records", "verification_tasks", "findings", "field_samples", "reports", "audit_log", "notifications", "iot_devices", "iot_readings", "iot_heartbeats",
])

// ---------------- terjemahan dialek ----------------
const NOW_PG = "to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')"
const TODAY_PG = "to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD')"
function toPg(sql: string) {
  let out = "", n = 0, quote: string | null = null
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]
    if (quote) { out += ch; if (ch === quote) quote = null; continue }
    if (ch === "'" || ch === '"') { quote = ch; out += ch; continue }
    out += ch === "?" ? `$${++n}` : ch
  }
  out = out.replace(/datetime\('now'\)/g, NOW_PG).replace(/date\('now'\)/g, TODAY_PG)
  if (/^\s*INSERT\s+OR\s+IGNORE\s+INTO/i.test(out)) out = out.replace(/INSERT\s+OR\s+IGNORE\s+INTO/i, "INSERT INTO") + " ON CONFLICT DO NOTHING"
  return out
}
export function toPgDDL(ddl: string) {
  return ddl
    .replace(/INTEGER PRIMARY KEY(?! *,)/g, "SERIAL PRIMARY KEY")
    .replace(/\bid INTEGER PRIMARY KEY\b/g, "id SERIAL PRIMARY KEY")
    .replace(/\bREAL\b/g, "DOUBLE PRECISION")
    .replace(/DEFAULT \(datetime\('now'\)\)/g, `DEFAULT (${NOW_PG})`)
    .replace(/DEFAULT \(date\('now'\)\)/g, `DEFAULT (${TODAY_PG})`)
    .replace(/CREATE TRIGGER IF NOT EXISTS audit_no_update[\s\S]*?END;\s*CREATE TRIGGER IF NOT EXISTS audit_no_delete[\s\S]*?END;/, `
CREATE OR REPLACE FUNCTION audit_append_only() RETURNS trigger AS $fn$ BEGIN RAISE EXCEPTION 'audit_log append-only'; END $fn$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS audit_no_change ON audit_log;
CREATE TRIGGER audit_no_change BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_append_only();`)
}
const normalize = (r: Row) => {
  for (const k in r) if (typeof r[k] === "bigint") r[k] = Number(r[k])
  return r
}
const insertTable = (sql: string) => sql.match(/^\s*INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(\w+)/i)?.[1]?.toLowerCase()

// ---------------- driver ----------------
interface Exec { all(sql: string, p: any[]): Promise<Row[]>; run(sql: string, p: any[]): Promise<RunResult> }
const txStore = new AsyncLocalStorage<Exec>()
let base: Exec
let execRaw: (sql: string) => Promise<void>
let begin: <T>(fn: (tx: Exec) => Promise<T>) => Promise<T>
let runMigration: (statements: string[]) => Promise<void>
export let close: () => Promise<void> = async () => {}

if (DIALECT === "postgres") {
  const { SQL } = await import("bun")
  const sql = new SQL(DATABASE_URL!, { max: 10, idleTimeout: 30, bigint: true }) // int8 → BigInt → Number (lihat normalize)
  const make = (conn: any): Exec => ({
    async all(q, p) { return ((await conn.unsafe(toPg(q), p)) as Row[]).map(normalize) },
    async run(q, p) {
      const t = insertTable(q)
      let text = toPg(q)
      const wantId = t && ID_TABLES.has(t) && !/RETURNING/i.test(text)
      if (wantId) text += " RETURNING id"
      const res: any = await conn.unsafe(text, p)
      return { lastInsertRowid: wantId && res[0] ? Number(res[0].id) : 0, changes: Number(res.count ?? res.length ?? 0) }
    },
  })
  base = make(sql)
  execRaw = async (s) => { await sql.unsafe(s) }
  begin = (fn) => sql.begin((tx: any) => fn(make(tx))) as any
  close = async () => { await sql.close() }
  // Migrasi aman bila beberapa proses server start bersamaan: kunci advisory dalam satu transaksi
  runMigration = async (statements) => {
    await sql.begin(async (tx: any) => {
      await tx.unsafe("SELECT pg_advisory_xact_lock(727001)")
      for (const s of statements) await tx.unsafe(s)
    })
  }
} else {
  const { Database } = await import("bun:sqlite")
  const DB_PATH = CONFIG.DB_PATH
  mkdirSync(dirname(DB_PATH), { recursive: true })
  const sdb = new Database(DB_PATH, { create: true, strict: true })
  sdb.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;")
  const e: Exec = {
    async all(q, p) { return sdb.query(q).all(...p) as Row[] },
    async run(q, p) { const r = sdb.query(q).run(...p); return { lastInsertRowid: Number(r.lastInsertRowid), changes: r.changes } },
  }
  base = e
  execRaw = async (s) => { sdb.exec(s) }
  begin = async (fn) => {
    sdb.exec("BEGIN")
    try { const r = await fn(e); sdb.exec("COMMIT"); return r } catch (err) { sdb.exec("ROLLBACK"); throw err }
  }
  close = async () => { sdb.close() }
  runMigration = async (statements) => {
    for (const s of statements) { try { sdb.exec(s) } catch (e) { if (!/duplicate column/i.test(String(e))) throw e } }
  }
}

const cur = () => txStore.getStore() ?? base
export const q = {
  all: async <T = Row>(sql: string, ...params: any[]) => (await cur().all(sql, params)) as T[],
  get: async <T = Row>(sql: string, ...params: any[]) => ((await cur().all(sql, params))[0] as T | undefined),
  run: (sql: string, ...params: any[]) => cur().run(sql, params),
}
/** Transaksi: semua q.* di dalam fn memakai koneksi transaksi yang sama. */
export function transaction<T>(fn: () => Promise<T>): Promise<T> {
  if (txStore.getStore()) return fn()
  return begin((tx) => txStore.run(tx, fn))
}
// Kolom tambahan untuk database yang dibuat sebelum kolom ini ada
const ADDED_COLUMNS: [string, string][] = [
  ["species", "description TEXT"], ["species", "ah REAL"], ["species", "bh REAL"], ["species", "density_source TEXT"],
  ["iot_devices", "interval_sec INTEGER DEFAULT 300"], ["iot_devices", "last_seen_at TEXT"], ["iot_devices", "last_ip TEXT"],
  ["iot_devices", "firmware TEXT"], ["iot_devices", "rssi INTEGER"], ["iot_devices", "battery REAL"], ["iot_devices", "paired_at TEXT"],
  ["users", "password_hash TEXT"], ["users", "last_login_at TEXT"], ["iot_devices", "category TEXT"],
  ["calculation_results", "scope INTEGER"], ["calculation_results", "basis TEXT"], ["calculation_results", "revision INTEGER DEFAULT 1"], ["calculation_results", "trace TEXT"],
  ["day_ledger", "status TEXT DEFAULT 'final'"], ["day_ledger", "fraction REAL"], ["day_ledger", "tree_absorbed REAL DEFAULT 0"], ["day_ledger", "tree_released REAL DEFAULT 0"],
  ["day_ledger", "tree_stock REAL DEFAULT 0"], ["day_ledger", "tree_count INTEGER DEFAULT 0"], ["day_ledger", "tree_active INTEGER DEFAULT 0"],
  ["day_ledger", "av_kompos_kg REAL DEFAULT 0"], ["day_ledger", "av_kompos REAL DEFAULT 0"], ["day_ledger", "av_kertas_kg REAL DEFAULT 0"], ["day_ledger", "av_kertas REAL DEFAULT 0"],
  ["day_ledger", "av_material_kg REAL DEFAULT 0"], ["day_ledger", "av_plts_kwh REAL DEFAULT 0"], ["day_ledger", "av_plts REAL DEFAULT 0"],
  ["mobility_responses", "daily_km REAL"],
]
/** Tabel yang id-nya tampil di URL → memakai UUID. */
export const UUID_TABLES = ["assets", "reports", "verification_tasks", "baselines", "iot_devices", "waste_sessions", "mobility_surveys", "field_samples"] as const
const SQLITE_UUID = "lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))"
export async function migrate() {
  const pg = DIALECT === "postgres"
  await runMigration([
    pg ? toPgDDL(SCHEMA) : SCHEMA,
    ...ADDED_COLUMNS.map(([table, col]) => (pg ? `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${toPgDDL(col)}` : `ALTER TABLE ${table} ADD COLUMN ${col}`)),
    // Survei mobilitas memakai jarak harian (pulang-pergi); isi dari data lama sekali jalan × 2 × faktor antar
    "UPDATE mobility_responses SET daily_km = 2 * distance_km * (CASE WHEN escort = 2 THEN 2 ELSE 1 END) WHERE daily_km IS NULL AND distance_km IS NOT NULL",
    // Pustaka jenis pohon sekolah (hanya menambah yang belum ada; tidak menimpa ubahan admin)
    "INSERT INTO species(local_name, scientific, equation, a, b, density, growth_default, dbh_min, dbh_max, carbon_fraction, root_ratio, carbon_tree, source, description, density_source, active) SELECT 'Mangga', 'Mangifera indica', 'chave', NULL, NULL, 0.55, 0.8, 5, 150, 0.47, 0.24, 1, 'Chave 2014 / Ketterings 2001 + berat jenis (model umum)', 'Pohon buah peneduh berdaun lebat; tajuknya rindang dan cocok untuk halaman sekolah.', 'Perkiraan berat jenis dari Global Wood Density Database (Zanne et al. 2009); ganti dengan data lokal bila ada', 1 WHERE NOT EXISTS (SELECT 1 FROM species WHERE local_name = 'Mangga')",
    "INSERT INTO species(local_name, scientific, equation, a, b, density, growth_default, dbh_min, dbh_max, carbon_fraction, root_ratio, carbon_tree, source, description, density_source, active) SELECT 'Nangka', 'Artocarpus heterophyllus', 'chave', NULL, NULL, 0.61, 0.8, 5, 150, 0.47, 0.24, 1, 'Chave 2014 / Ketterings 2001 + berat jenis (model umum)', 'Pohon buah berkayu kuning yang kuat; buahnya besar dan bisa dimanfaatkan kantin sekolah.', 'Perkiraan berat jenis dari Global Wood Density Database (Zanne et al. 2009); ganti dengan data lokal bila ada', 1 WHERE NOT EXISTS (SELECT 1 FROM species WHERE local_name = 'Nangka')",
    "INSERT INTO species(local_name, scientific, equation, a, b, density, growth_default, dbh_min, dbh_max, carbon_fraction, root_ratio, carbon_tree, source, description, density_source, active) SELECT 'Angsana', 'Pterocarpus indicus', 'chave', NULL, NULL, 0.53, 1.0, 5, 150, 0.47, 0.24, 1, 'Chave 2014 / Ketterings 2001 + berat jenis (model umum)', 'Pohon peneduh jalan bertajuk lebar dengan bunga kuning harum; cepat tumbuh.', 'Perkiraan berat jenis dari Global Wood Density Database (Zanne et al. 2009); ganti dengan data lokal bila ada', 1 WHERE NOT EXISTS (SELECT 1 FROM species WHERE local_name = 'Angsana')",
    "INSERT INTO species(local_name, scientific, equation, a, b, density, growth_default, dbh_min, dbh_max, carbon_fraction, root_ratio, carbon_tree, source, description, density_source, active) SELECT 'Pinus', 'Pinus merkusii', 'chave', NULL, NULL, 0.55, 1.0, 5, 150, 0.47, 0.2, 1, 'Chave 2014 / Ketterings 2001 + berat jenis (model umum)', 'Pohon jarum asli Sumatra; tumbuh tinggi lurus dan menghasilkan getah.', 'Perkiraan berat jenis dari Global Wood Density Database (Zanne et al. 2009); ganti dengan data lokal bila ada', 1 WHERE NOT EXISTS (SELECT 1 FROM species WHERE local_name = 'Pinus')",
    "INSERT INTO species(local_name, scientific, equation, a, b, density, growth_default, dbh_min, dbh_max, carbon_fraction, root_ratio, carbon_tree, source, description, density_source, active) SELECT 'Sonokeling', 'Dalbergia latifolia', 'chave', NULL, NULL, 0.75, 0.6, 5, 150, 0.47, 0.24, 1, 'Chave 2014 / Ketterings 2001 + berat jenis (model umum)', 'Kayu keras bernilai tinggi dengan serat gelap; tumbuh lambat namun awet.', 'Perkiraan berat jenis dari Global Wood Density Database (Zanne et al. 2009); ganti dengan data lokal bila ada', 1 WHERE NOT EXISTS (SELECT 1 FROM species WHERE local_name = 'Sonokeling')",
    "INSERT INTO species(local_name, scientific, equation, a, b, density, growth_default, dbh_min, dbh_max, carbon_fraction, root_ratio, carbon_tree, source, description, density_source, active) SELECT 'Matoa', 'Pometia pinnata', 'chave', NULL, NULL, 0.62, 0.8, 5, 150, 0.47, 0.24, 1, 'Chave 2014 / Ketterings 2001 + berat jenis (model umum)', 'Pohon buah khas Papua bertajuk rimbun; daun mudanya berwarna merah.', 'Perkiraan berat jenis dari Global Wood Density Database (Zanne et al. 2009); ganti dengan data lokal bila ada', 1 WHERE NOT EXISTS (SELECT 1 FROM species WHERE local_name = 'Matoa')",
    "INSERT INTO species(local_name, scientific, equation, a, b, density, growth_default, dbh_min, dbh_max, carbon_fraction, root_ratio, carbon_tree, source, description, density_source, active) SELECT 'Cemara laut', 'Casuarina equisetifolia', 'chave', NULL, NULL, 0.83, 1.2, 5, 150, 0.47, 0.24, 1, 'Chave 2014 / Ketterings 2001 + berat jenis (model umum)', 'Pohon tahan angin dan tanah miskin; daunnya menyerupai jarum dan mengikat nitrogen.', 'Perkiraan berat jenis dari Global Wood Density Database (Zanne et al. 2009); ganti dengan data lokal bila ada', 1 WHERE NOT EXISTS (SELECT 1 FROM species WHERE local_name = 'Cemara laut')",
    "INSERT INTO species(local_name, scientific, equation, a, b, density, growth_default, dbh_min, dbh_max, carbon_fraction, root_ratio, carbon_tree, source, description, density_source, active) SELECT 'Jati putih', 'Gmelina arborea', 'chave', NULL, NULL, 0.42, 1.5, 5, 150, 0.47, 0.24, 1, 'Chave 2014 / Ketterings 2001 + berat jenis (model umum)', 'Pohon kayu cepat tumbuh untuk hutan tanaman; kayunya ringan berwarna pucat.', 'Perkiraan berat jenis dari Global Wood Density Database (Zanne et al. 2009); ganti dengan data lokal bila ada', 1 WHERE NOT EXISTS (SELECT 1 FROM species WHERE local_name = 'Jati putih')",
    "INSERT INTO species(local_name, scientific, equation, a, b, density, growth_default, dbh_min, dbh_max, carbon_fraction, root_ratio, carbon_tree, source, description, density_source, active) SELECT 'Sukun', 'Artocarpus altilis', 'chave', NULL, NULL, 0.38, 1.0, 5, 150, 0.47, 0.24, 1, 'Chave 2014 / Ketterings 2001 + berat jenis (model umum)', 'Pohon buah pangan bergetah dengan daun lebar menjari; buahnya sumber karbohidrat.', 'Perkiraan berat jenis dari Global Wood Density Database (Zanne et al. 2009); ganti dengan data lokal bila ada', 1 WHERE NOT EXISTS (SELECT 1 FROM species WHERE local_name = 'Sukun')",
    "INSERT INTO species(local_name, scientific, equation, a, b, density, growth_default, dbh_min, dbh_max, carbon_fraction, root_ratio, carbon_tree, source, description, density_source, active) SELECT 'Beringin', 'Ficus benjamina', 'chave', NULL, NULL, 0.48, 0.8, 5, 150, 0.47, 0.24, 1, 'Chave 2014 / Ketterings 2001 + berat jenis (model umum)', 'Pohon peneduh besar berakar gantung; tajuknya sangat lebar dan berumur panjang.', 'Perkiraan berat jenis dari Global Wood Density Database (Zanne et al. 2009); ganti dengan data lokal bila ada', 1 WHERE NOT EXISTS (SELECT 1 FROM species WHERE local_name = 'Beringin')",
    "INSERT INTO species(local_name, scientific, equation, a, b, density, growth_default, dbh_min, dbh_max, carbon_fraction, root_ratio, carbon_tree, source, description, density_source, active) SELECT 'Flamboyan', 'Delonix regia', 'chave', NULL, NULL, 0.55, 1.0, 5, 150, 0.47, 0.24, 1, 'Chave 2014 / Ketterings 2001 + berat jenis (model umum)', 'Pohon hias bertajuk payung dengan bunga merah menyala di musim kemarau.', 'Perkiraan berat jenis dari Global Wood Density Database (Zanne et al. 2009); ganti dengan data lokal bila ada', 1 WHERE NOT EXISTS (SELECT 1 FROM species WHERE local_name = 'Flamboyan')",
    "INSERT INTO species(local_name, scientific, equation, a, b, density, growth_default, dbh_min, dbh_max, carbon_fraction, root_ratio, carbon_tree, source, description, density_source, active) SELECT 'Kersen', 'Muntingia calabura', 'chave', NULL, NULL, 0.4, 1.2, 5, 60, 0.47, 0.24, 1, 'Chave 2014 / Ketterings 2001 + berat jenis (model umum)', 'Pohon kecil cepat tumbuh; buahnya disukai burung dan memberi teduh di halaman.', 'Perkiraan berat jenis dari Global Wood Density Database (Zanne et al. 2009); ganti dengan data lokal bila ada', 1 WHERE NOT EXISTS (SELECT 1 FROM species WHERE local_name = 'Kersen')",
    "INSERT INTO species(local_name, scientific, equation, a, b, density, growth_default, dbh_min, dbh_max, carbon_fraction, root_ratio, carbon_tree, source, description, density_source, active) SELECT 'Glodokan tiang', 'Polyalthia longifolia', 'chave', NULL, NULL, 0.5, 0.6, 5, 60, 0.47, 0.24, 1, 'Chave 2014 / Ketterings 2001 + berat jenis (model umum)', 'Pohon hias berbentuk kerucut ramping; sering ditanam sebagai pagar hidup peredam bising.', 'Perkiraan berat jenis dari Global Wood Density Database (Zanne et al. 2009); ganti dengan data lokal bila ada', 1 WHERE NOT EXISTS (SELECT 1 FROM species WHERE local_name = 'Glodokan tiang')",
    "INSERT INTO species(local_name, scientific, equation, a, b, density, growth_default, dbh_min, dbh_max, carbon_fraction, root_ratio, carbon_tree, source, description, density_source, active) SELECT 'Kelapa', 'Cocos nucifera', 'chave', NULL, NULL, 0, 0.0, 0, 0, 0, 0, 0, 'Palem: dicatat tanpa stok karbon (persamaan pohon berkayu tidak berlaku)', 'Tumbuhan palem serbaguna; tidak dihitung stok karbonnya karena bukan pohon berkayu.', '-', 1 WHERE NOT EXISTS (SELECT 1 FROM species WHERE local_name = 'Kelapa')",
    "INSERT INTO species(local_name, scientific, equation, a, b, density, growth_default, dbh_min, dbh_max, carbon_fraction, root_ratio, carbon_tree, source, description, density_source, active) SELECT 'Bambu', 'Bambusoideae', 'chave', NULL, NULL, 0, 0.0, 0, 0, 0, 0, 0, 'Bambu: dicatat tanpa stok karbon (persamaan pohon berkayu tidak berlaku)', 'Rumpun bambu cepat tumbuh untuk penahan erosi; tidak dihitung dengan persamaan pohon.', '-', 1 WHERE NOT EXISTS (SELECT 1 FROM species WHERE local_name = 'Bambu')",
    "UPDATE species SET equation = 'power', a = 0.054, b = 2.579, dbh_min = 5, dbh_max = 50, source = 'Siregar (2011): AGB = 0,054 × D^2,579 (persamaan lokal jati, dikutip dalam literatur SNI 7724:2011)' WHERE local_name = 'Jati' AND equation = 'chave' AND source LIKE 'Chave%'",
    "UPDATE species SET equation = 'power', a = 0.0272, b = 2.831, dbh_min = 5, dbh_max = 50, source = 'Sugiharto (2002): AGB = 0,0272 × D^2,831 (persamaan lokal sengon)' WHERE local_name = 'Sengon' AND equation = 'chave' AND source LIKE 'Chave%'",
    "UPDATE species SET density_source = 'Perkiraan berat jenis dari Global Wood Density Database (Zanne et al. 2009); ganti dengan data lokal bila ada' WHERE density_source IS NULL AND carbon_tree = 1",
    // Deskripsi singkat jenis pohon (untuk kartu QR & profil publik) — hanya mengisi yang masih kosong
    "UPDATE species SET description = 'Pohon peneduh berkayu keras dengan tajuk rimbun. Tahan kering dan polusi, cocok untuk halaman dan tepi jalan sekolah.' WHERE local_name = 'Mahoni' AND description IS NULL",
    "UPDATE species SET description = 'Pohon kayu bernilai tinggi yang tumbuh lambat namun berumur panjang. Menggugurkan daun di musim kemarau.' WHERE local_name = 'Jati' AND description IS NULL",
    "UPDATE species SET description = 'Pohon hujan bertajuk payung sangat lebar. Salah satu penyerap karbon terbesar dan memberi keteduhan luas.' WHERE local_name = 'Trembesi' AND description IS NULL",
    "UPDATE species SET description = 'Pohon cepat tumbuh dari suku polong-polongan. Menyuburkan tanah dengan mengikat nitrogen.' WHERE local_name = 'Sengon' AND description IS NULL",
    "UPDATE species SET description = 'Pohon penghasil getah lateks dengan batang lurus. Tajuknya rapat dan menahan air hujan.' WHERE local_name = 'Karet' AND description IS NULL",
    "UPDATE species SET description = 'Pohon cepat tumbuh yang tahan lahan kritis. Daun majemuknya membantu memperbaiki kesuburan tanah.' WHERE local_name = 'Akasia' AND description IS NULL",
    "UPDATE species SET description = 'Pohon peneduh dengan cabang bertingkat mendatar. Daunnya memerah sebelum gugur dan tahan angin.' WHERE local_name = 'Ketapang' AND description IS NULL",
    "UPDATE species SET description = 'Tumbuhan berbatang tunggal dengan daun menjari atau menyirip. Hiasan taman yang rapi dan mudah dirawat.' WHERE local_name = 'Palem' AND description IS NULL",
    "UPDATE species SET description = 'Jenis pohon lain yang tercatat di lingkungan sekolah.' WHERE local_name = 'Lainnya' AND description IS NULL",
    // Struktur peran: Admin · Operator · Kepala Sekolah (lihat saja) · Petugas Monitoring. Tanpa verifikator eksternal.
    "UPDATE role_assignments SET role = 'petugas' WHERE role = 'guru'",
    "UPDATE invitations SET role = 'petugas' WHERE role = 'guru'",
    "DELETE FROM role_assignments WHERE role IN ('verifikator', 'mitra', 'dinas', 'program')",
    "DELETE FROM invitations WHERE role IN ('verifikator', 'mitra', 'dinas', 'program') AND accepted_at IS NULL",
    "DELETE FROM verifier_assignments",
    "UPDATE users SET active = 0 WHERE id NOT IN (SELECT user_id FROM role_assignments WHERE user_id IS NOT NULL)",
    "UPDATE baselines SET status = 'diajukan' WHERE status = 'menunggu_kepsek'",
    "UPDATE reports SET status = 'diajukan' WHERE status = 'menunggu_kepsek'",
    // UUID publik untuk objek yang muncul di URL (id angka tidak lagi ditampilkan)
    ...UUID_TABLES.flatMap((t) => pg
      ? [`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS uuid TEXT DEFAULT gen_random_uuid()::text`, `UPDATE ${t} SET uuid = gen_random_uuid()::text WHERE uuid IS NULL`, `CREATE UNIQUE INDEX IF NOT EXISTS ${t}_uuid_idx ON ${t}(uuid)`]
      : [`ALTER TABLE ${t} ADD COLUMN uuid TEXT`, `UPDATE ${t} SET uuid = ${SQLITE_UUID} WHERE uuid IS NULL`, `CREATE UNIQUE INDEX IF NOT EXISTS ${t}_uuid_idx ON ${t}(uuid)`,
        `CREATE TRIGGER IF NOT EXISTS ${t}_uuid_ins AFTER INSERT ON ${t} WHEN NEW.uuid IS NULL BEGIN UPDATE ${t} SET uuid = ${SQLITE_UUID} WHERE id = NEW.id; END`]),
  ])
}
/** Kosongkan seluruh data (untuk seed ulang). */
export async function resetSchema() {
  if (DIALECT === "postgres") await execRaw("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;")
  else {
    const tables = await base.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'", [])
    await execRaw("PRAGMA foreign_keys = OFF;" + tables.map((t) => `DROP TABLE IF EXISTS ${t.name};`).join("") + "DROP TRIGGER IF EXISTS audit_no_update; DROP TRIGGER IF EXISTS audit_no_delete; PRAGMA foreign_keys = ON;")
  }
  await migrate()
}
await migrate()

export const json = <T = any>(s: string | null | undefined, fallback: T): T => {
  if (!s) return fallback
  try { return JSON.parse(s) } catch { return fallback }
}
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const r = await q.get<{ value: string }>("SELECT value FROM settings WHERE key = ?", key)
  return r ? json(r.value, fallback) : fallback
}
export async function setSetting(key: string, value: unknown) {
  await q.run("INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, JSON.stringify(value))
}
applyEnvConfig(await getSetting("env_config", null))
