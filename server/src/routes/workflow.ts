// Baseline (BASE-*), verifikasi (VER-*), rapor (REP-02/03).
import { Hono } from "hono"
import { q, json, type Row } from "../db"
import {
  addDays, assertOrg, assertOrgRole, assertTransition, audit, bad, hasRole, monthOf, notify, orgUsers, parseJsonCols, requireAuth, sha256, todayWIB, accessibleOrgIds, rolesInOrg, daysBetween, rowId } from "../lib"
import { baselineCompleteness, baselineHash, createTask, monthsBetween, recomputeBaseline, SLA_DAYS } from "../engine/services"
import { computeAvoided, computeRange, feVersionSet, loadContext, loadTrees, summarize, treeAbsorption, treeStock } from "../engine/engine"
import { assetEco, markDirty, readDays, sumEco } from "../engine/ledger"
import { SOURCE_META } from "../engine/factors"
import * as C from "../engine/calc"

export const wf = new Hono()
wf.use("*", requireAuth)
const oid = (c: any) => Number(c.req.param("orgId"))

// ======================= BASELINE =======================
async function baselineDetail(b: Row) {
  const comps = (await q.all("SELECT * FROM baseline_components WHERE baseline_id = ? ORDER BY total_kg DESC", b.id)).map((x) => parseJsonCols(x, ["detail"]))
  const completeness = (await baselineCompleteness(b.org_id, b.period_start, b.period_end))
  const findings = (await q.all("SELECT f.*, u.name AS author FROM findings f LEFT JOIN users u ON u.id = f.created_by WHERE object_type = 'baseline' AND object_id = ? ORDER BY id DESC", b.id))
  const visits = (await q.all("SELECT * FROM field_samples WHERE org_id = ? ORDER BY id DESC", b.org_id))
  const names = (await q.all("SELECT id, name FROM users WHERE id IN (?,?,?,?)", b.submitted_by ?? 0, b.approved_by ?? 0, b.verified_by ?? 0, b.locked_by ?? 0))
  const nm = (id: number) => names.find((n) => n.id === id)?.name ?? null
  const canSubmit = completeness.score >= 80 && completeness.missingRequired.length === 0
  return {
    ...b, summary: json(b.summary, {}), components: comps, completeness, findings, visits, canSubmit,
    people: { submitted: nm(b.submitted_by), approved: nm(b.approved_by), verified: nm(b.verified_by), locked: nm(b.locked_by) },
    estimateWarning: b.estimate_share > 0.2,
  }
}
wf.get("/orgs/:orgId/baselines", async (c) => {
  const id = oid(c); (await assertOrg(c, id))
  return c.json((await q.all("SELECT * FROM baselines WHERE org_id = ? ORDER BY version DESC", id)).map((b) => ({ ...b, summary: json(b.summary, {}) })))
})
wf.get("/baselines/:id", async (c) => {
  const b = (await q.get("SELECT * FROM baselines WHERE id = ?", (await rowId("baselines", c.req.param("id")))))
  if (!b) throw bad("Baseline tidak ditemukan", 404)
  ;(await assertOrg(c, b.org_id))
  return c.json((await baselineDetail(b)))
})
// BASE-02: periode baseline ditetapkan admin/pengelola (default 12 bulan, min 3)
wf.post("/orgs/:orgId/baselines", async (c) => {
  const id = oid(c); (await assertOrgRole(c, id, "admin", "operator"))
  const b = await c.req.json()
  const end = b.period_end ?? addDays(todayWIB().slice(0, 8) + "01", -1)
  const start = b.period_start ?? addDays(end, -364)
  if (monthsBetween(start, end).length < 3 || daysBetween(start, end) < 85) throw bad("Periode baseline minimal 3 bulan", 422)
  const open = (await q.get("SELECT * FROM baselines WHERE org_id = ? AND status NOT IN ('terkunci') ORDER BY version DESC LIMIT 1", id))
  if (open) throw bad(`Masih ada baseline ${open.version_label} berstatus ${open.status}`, 409)
  const v = ((await q.get<{ v: number }>("SELECT MAX(version) AS v FROM baselines WHERE org_id = ?", id))?.v ?? 0) + 1
  const label = `BL-${start.slice(0, 4)}-v${v}`
  const r = (await q.run("INSERT INTO baselines(org_id, version_label, version, period_start, period_end, status, reason) VALUES (?,?,?,?,?,?,?)", id, label, v, start, end, "draf", b.reason ?? null))
  const bl = (await recomputeBaseline(Number(r.lastInsertRowid)))
  ;(await audit(c, v > 1 ? "rebaseline" : "create", "baseline", bl.id, null, { start, end, reason: b.reason }))
  return c.json((await baselineDetail(bl)))
})
wf.post("/baselines/:id/recompute", async (c) => {
  const b = (await q.get("SELECT * FROM baselines WHERE id = ?", (await rowId("baselines", c.req.param("id")))))
  if (!b) throw bad("Tidak ditemukan", 404)
  ;(await assertOrgRole(c, b.org_id, "operator", "admin"))
  if (b.status === "terkunci") throw bad("Baseline terkunci bersifat read-only", 409)
  return c.json((await baselineDetail((await recomputeBaseline(b.id)))))
})
// Interpolasi bulan hilang ≤ 2 bulan
wf.post("/baselines/:id/interpolate", async (c) => {
  const b = (await q.get("SELECT * FROM baselines WHERE id = ?", (await rowId("baselines", c.req.param("id")))))
  if (!b) throw bad("Tidak ditemukan", 404)
  ;(await assertOrgRole(c, b.org_id, "operator", "admin"))
  if (b.status === "terkunci") throw bad("Baseline terkunci", 409)
  const months = monthsBetween(b.period_start, b.period_end)
  let created = 0
  for (const src of ["listrik", "lpg", "genset", "kertas"]) {
    const vals = (await Promise.all(months.map(async (m) => (await q.get("SELECT quantity FROM activity_records WHERE org_id = ? AND source = ? AND period = ? AND superseded = 0", b.org_id, src, m))?.quantity ?? null)))
    if (vals.every((v) => v === null)) continue
    const r = C.interpolateMonths(vals)
    for (const [i, l] of r.labels.entries()) {
      if (l !== "interpolasi") continue
      ;(await q.run("INSERT INTO activity_records(org_id, source, period, quantity, unit, method, status, created_by, note) VALUES (?,?,?,?,?,?,?,?,?)",
        b.org_id, src, months[i], r.values[i], SOURCE_META[src].unit, "interpolasi", "draf", c.get("user").id, "Interpolasi rata-rata bulan bersebelahan"))
      created++
    }
  }
  ;(await audit(c, "interpolate", "baseline", b.id, null, { created }))
  ;(await markDirty(b.org_id))
  return c.json({ created, baseline: (await baselineDetail((await recomputeBaseline(b.id)))) })
})
// Operator mengajukan Survei Awal → Admin meninjau, mengesahkan & mengunci (tanpa verifikator eksternal)
wf.post("/baselines/:id/request", async (c) => {
  const b = (await q.get("SELECT * FROM baselines WHERE id = ?", (await rowId("baselines", c.req.param("id")))))
  if (!b) throw bad("Tidak ditemukan", 404)
  ;(await assertOrgRole(c, b.org_id, "operator", "admin"))
  assertTransition(b.status, "diajukan")
  const fresh = (await recomputeBaseline(b.id))
  const d = (await baselineDetail(fresh))
  if (!d.canSubmit) throw bad(`Belum bisa diajukan: skor ${d.completeness.score.toFixed(0)}% (min 80%)${d.completeness.missingRequired.length ? `, komponen wajib belum lengkap: ${d.completeness.missingRequired.join(", ")}` : ""}`, 422)
  ;(await q.run("UPDATE baselines SET status = 'diajukan', submitted_by = ? WHERE id = ?", c.get("user").id, b.id))
  const org = (await q.get("SELECT name FROM organizations WHERE id = ?", b.org_id))!
  ;(await createTask(b.org_id, "baseline", b.id, `Survei Awal ${b.version_label} — ${org.name}`, "normal", b.estimate_share > 0.2 ? `Porsi Estimasi ${(b.estimate_share * 100).toFixed(0)}%` : undefined))
  ;(await audit(c, "request_approval", "baseline", b.id, { status: b.status }, { status: "diajukan" }))
  return c.json({ ok: true })
})
/** Pengesahan & penguncian baseline oleh Admin → versi + hash data + versi faktor */
export async function lockBaseline(c: any, b: Row, note?: string) {
  const open = (await q.get("SELECT 1 FROM findings WHERE org_id = ? AND object_type = 'baseline' AND object_id = ? AND category = 'mayor' AND status = 'terbuka'", b.org_id, b.id))
  if (open) throw bad("Masih ada temuan mayor yang belum selesai", 409)
  if (b.estimate_share > 0.2 && !note && b.status === "diajukan") throw bad("Porsi Estimasi > 20%: wajib beri catatan alasan saat mengesahkan", 422)
  const hash = (await baselineHash(b.id))
  const u = c.get("user").id
  ;(await q.run("UPDATE baselines SET status = 'terkunci', approved_by = COALESCE(approved_by, ?), verified_by = COALESCE(verified_by, ?), verifier_note = COALESCE(?, verifier_note), data_hash = ?, locked_by = ?, locked_at = datetime('now') WHERE id = ?", u, u, note ?? null, hash, u, b.id))
  // data aktivitas periode baseline ikut terkunci
  ;(await q.run("UPDATE activity_records SET status = 'terkunci' WHERE org_id = ? AND superseded = 0 AND status = 'terverifikasi' AND period BETWEEN ? AND ?", b.org_id, monthOf(b.period_start), monthOf(b.period_end)))
  ;(await q.run("UPDATE verification_tasks SET status = 'selesai', result = 'disetujui', closed_at = datetime('now'), closed_by = ? WHERE object_type = 'baseline' AND object_id = ? AND status = 'terbuka'", u, b.id))
  ;(await notify([...(await orgUsers(b.org_id, "operator", "kepsek"))], "Survei Awal disahkan & dikunci", `${b.version_label} terkunci. Dasbor kini membandingkan dengan baseline ini.`, "/app/baseline"))
  ;(await audit(c, "lock", "baseline", b.id, { status: b.status }, { status: "terkunci", hash }))
  ;(await markDirty(b.org_id))
  return hash
}
wf.post("/baselines/:id/lock", async (c) => {
  const b = (await q.get("SELECT * FROM baselines WHERE id = ?", (await rowId("baselines", c.req.param("id")))))
  if (!b) throw bad("Tidak ditemukan", 404)
  if (!hasRole(c.get("user"), "admin")) throw bad("Hanya Admin yang dapat mengesahkan & mengunci Survei Awal", 403)
  assertTransition(b.status, "terkunci")
  const { note } = await c.req.json().catch(() => ({}))
  return c.json({ ok: true, hash: await lockBaseline(c, b, note) })
})
// Buka kunci darurat: hanya admin, wajib alasan; rapor dependen → perlu tinjau ulang
wf.post("/baselines/:id/unlock", async (c) => {
  if (!hasRole(c.get("user"), "admin")) throw bad("Hanya admin platform", 403)
  const b = (await q.get("SELECT * FROM baselines WHERE id = ?", (await rowId("baselines", c.req.param("id")))))
  if (!b || b.status !== "terkunci") throw bad("Baseline tidak terkunci", 409)
  const { reason } = await c.req.json()
  if (!reason || String(reason).length < 10) throw bad("Alasan tertulis wajib (min. 10 karakter)", 422)
  ;(await q.run("UPDATE baselines SET status = 'perlu_perbaikan', verifier_note = ? WHERE id = ?", `[Buka kunci] ${reason}`, b.id))
  ;(await q.run("UPDATE reports SET status = 'perlu_tinjau' WHERE org_id = ? AND baseline_version = ? AND status = 'terkunci'", b.org_id, b.version_label))
  ;(await audit(c, "unlock", "baseline", b.id, { status: "terkunci" }, { status: "perlu_perbaikan", reason }))
  return c.json({ ok: true })
})

// ======================= VERIFIKASI =======================
const CHECKLIST: Record<string, string[]> = {
  listrik: ["Angka kWh = tagihan/token", "ID pelanggan cocok", "Periode benar"],
  plts: ["kWh produksi sesuai tangkapan layar inverter", "Periode benar"],
  lpg: ["Jumlah sesuai nota", "Ukuran tabung benar"],
  genset: ["Liter sesuai nota BBM / log genset", "Periode benar"],
  ac: ["Jenis gas & muatan sesuai foto label", "Nota servis sesuai"],
  kertas: ["Jumlah rim sesuai dokumen pengadaan/BOS", "Periode benar"],
  baseline: ["Skor kelengkapan ≥ 80%", "Porsi Estimasi ≤ 20% atau ada catatan alasan", "Semua komponen wajib diperiksa", "Data bulanan periode acuan sesuai bukti"],
  report: ["Hanya data Disahkan/Terkunci di angka resmi", "Versi baseline & FE tercantum", "Angka cocok dengan dasbor"],
}
async function taskObject(t: Row) {
  if (t.object_type === "activity") {
    const rec = (await q.get("SELECT * FROM activity_records WHERE id = ?", t.object_id))
    if (!rec) return { kind: "activity" }
    const prevPeriod = monthOf(addDays(rec.period + "-01", -1))
    const prev = (await q.get("SELECT quantity, period FROM activity_records WHERE org_id = ? AND source = ? AND period = ? AND superseded = 0", rec.org_id, rec.source, prevPeriod))
    const lastYear = (await q.get("SELECT quantity, period FROM activity_records WHERE org_id = ? AND source = ? AND period = ? AND superseded = 0", rec.org_id, rec.source, `${Number(rec.period.slice(0, 4)) - 1}${rec.period.slice(4)}`))
    const bl = (await q.get("SELECT b.version_label, c.daily_active_kg, c.total_kg FROM baselines b JOIN baseline_components c ON c.baseline_id = b.id WHERE b.org_id = ? AND c.source = ? ORDER BY b.version DESC LIMIT 1", rec.org_id, rec.source))
    const evIds = json<number[]>(rec.evidence_ids, [])
    const evidence = evIds.length ? (await q.all(`SELECT * FROM evidence WHERE id IN (${evIds.join(",")})`)).map((e) => parseJsonCols(e, ["flags"])) : []
    const months = bl ? (await q.get("SELECT period_start, period_end FROM baselines WHERE org_id = ? ORDER BY version DESC LIMIT 1", rec.org_id)) : null
    const blMonthly = bl && months ? bl.total_kg / monthsBetween(months.period_start, months.period_end).length : null
    return { kind: "activity", record: parseJsonCols(rec, ["meta", "flags", "evidence_ids"]), evidence, prev, lastYear, baseline: bl ? { version: bl.version_label, monthlyKg: blMonthly } : null, checklist: CHECKLIST[rec.source] ?? ["Data sesuai bukti"] }
  }
  if (t.object_type === "baseline") {
    const b = (await q.get("SELECT * FROM baselines WHERE id = ?", t.object_id))!
    return { kind: "baseline", baseline: (await baselineDetail(b)), checklist: CHECKLIST.baseline }
  }
  if (t.object_type === "report") {
    const r = (await q.get("SELECT * FROM reports WHERE id = ?", t.object_id))!
    return { kind: "report", report: { ...r, snapshot: json(r.snapshot, {}) }, checklist: CHECKLIST.report }
  }
  return { kind: t.object_type, checklist: ["Data sesuai bukti"] }
}
wf.get("/verification/tasks", async (c) => {
  const u = c.get("user")
  const orgIds = (await accessibleOrgIds(u))
  const opOrgs = u.roles.filter((r) => r.role === "operator" && r.org_id).map((r) => r.org_id!)
  const isAdmin = hasRole(u, "admin")
  if (!orgIds.length) return c.json([])
  const status = c.req.query("status") ?? "terbuka"
  const rows = (await q.all(`SELECT t.*, o.name AS org_name, u.name AS verifier_name FROM verification_tasks t JOIN organizations o ON o.id = t.org_id LEFT JOIN users u ON u.id = t.verifier_id
    WHERE t.org_id IN (${orgIds.join(",")}) ${status === "semua" ? "AND t.status != 'dibatalkan'" : "AND t.status = ?"}
    ORDER BY CASE t.priority WHEN 'tinggi' THEN 0 ELSE 1 END, CASE t.object_type WHEN 'baseline' THEN 0 ELSE 1 END, t.due_at`, ...(status === "semua" ? [] : [status])))
  const today = todayWIB()
  const canActOn = (t: Row) => isAdmin || (t.object_type === "activity" && opOrgs.includes(t.org_id))
  return c.json(rows.map((t) => ({ ...t, canAct: canActOn(t), ageDays: daysBetween(t.created_at.slice(0, 10), today), overdue: t.status === "terbuka" && t.due_at < today })))
})
wf.get("/verification/tasks/:id", async (c) => {
  const t = (await q.get("SELECT t.*, o.name AS org_name FROM verification_tasks t JOIN organizations o ON o.id = t.org_id WHERE t.id = ?", (await rowId("verification_tasks", c.req.param("id")))))
  if (!t) throw bad("Tugas tidak ditemukan", 404)
  ;(await assertOrg(c, t.org_id))
  const findings = (await q.all("SELECT * FROM findings WHERE task_id = ? ORDER BY id DESC", t.id))
  const mineRoles = (await rolesInOrg(c.get("user"), t.org_id))
  const canAct = mineRoles.includes("admin") || (t.object_type === "activity" && mineRoles.includes("operator"))
  return c.json({ ...parseJsonCols(t, ["checklist"]), object: (await taskObject(t)), findings, canAct })
})
async function guardVerifier(c: any, t: Row) {
  const u = c.get("user")
  const mine = (await rolesInOrg(u, t.org_id))
  // data bulanan: operator lembaga (atau admin) · Survei Awal & rapor: admin
  const ok = mine.includes("admin") || (t.object_type === "activity" && mine.includes("operator"))
  if (!ok) throw bad(t.object_type === "activity" ? "Hanya operator lembaga ini yang dapat meng-ACC data" : "Hanya Admin yang dapat mengesahkan", 403)
  // pemisahan tugas: data tidak bisa diajukan & disetujui akun yang sama
  const submitter = t.object_type === "activity" ? (await q.get("SELECT submitted_by, created_by FROM activity_records WHERE id = ?", t.object_id))
    : t.object_type === "baseline" ? (await q.get("SELECT submitted_by, approved_by AS created_by FROM baselines WHERE id = ?", t.object_id))
    : (await q.get("SELECT submitted_by, approved_by AS created_by FROM reports WHERE id = ?", t.object_id))
  if (t.object_type === "activity" && submitter && (submitter.submitted_by === u.id || submitter.created_by === u.id)) throw bad("Pemisahan tugas: Anda tidak dapat meng-ACC data yang Anda isi sendiri", 403)
}
wf.post("/verification/tasks/:id/approve", async (c) => {
  const t = (await q.get("SELECT * FROM verification_tasks WHERE id = ?", (await rowId("verification_tasks", c.req.param("id")))))
  if (!t || t.status !== "terbuka") throw bad("Tugas tidak terbuka", 409)
  ;(await guardVerifier(c, t))
  const { checklist = {}, note } = await c.req.json()
  const items: string[] = (await taskObject(t)).checklist ?? []
  // VER-03: persetujuan tanpa checklist lengkap ditolak
  if (!items.every((i: string) => checklist[i] === true)) throw bad("Checklist wajib dicentang lengkap sebelum menyetujui", 422)
  const u = c.get("user")
  if (t.object_type === "activity") {
    const rec = (await q.get("SELECT * FROM activity_records WHERE id = ?", t.object_id))!
    assertTransition(rec.status, "terverifikasi")
    ;(await q.run("UPDATE activity_records SET status = 'terverifikasi', verified_by = ?, updated_at = datetime('now') WHERE id = ?", u.id, rec.id))
    ;(await notify([rec.created_by, rec.submitted_by].filter(Boolean), "Data disahkan operator", t.title, "/app/input"))
  } else if (t.object_type === "baseline") {
    const b = (await q.get("SELECT * FROM baselines WHERE id = ?", t.object_id))!
    assertTransition(b.status, "terkunci")
    ;(await lockBaseline(c, b, note))
  } else if (t.object_type === "report") {
    const r = (await q.get("SELECT * FROM reports WHERE id = ?", t.object_id))!
    assertTransition(r.status, "terverifikasi")
    const hash = sha256(r.snapshot + r.baseline_version + r.fe_version)
    ;(await q.run("UPDATE reports SET status = 'terkunci', verified_by = ?, hash = ?, published_at = datetime('now') WHERE id = ?", u.id, hash, r.id))
    ;(await notify((await orgUsers(t.org_id, "operator", "kepsek")), "Rapor terbit", `${r.kind === "karbon" ? "Rapor Karbon" : "Rapor Jasa Lingkungan"} ${r.period_label} terbit & terkunci`, `/app/reports/${r.uuid ?? r.id}`))
  }
  ;(await q.run("UPDATE verification_tasks SET status = 'selesai', result = 'disetujui', checklist = ?, note = ?, closed_at = datetime('now'), closed_by = ? WHERE id = ?", JSON.stringify(checklist), note ?? null, u.id, t.id))
  ;(await audit(c, "verify", t.object_type, t.object_id, null, { task: t.id, checklist, note }))
  ;(await markDirty(t.org_id))
  return c.json({ ok: true })
})
// VER-04: kembalikan dengan catatan + kategori temuan
wf.post("/verification/tasks/:id/return", async (c) => {
  const t = (await q.get("SELECT * FROM verification_tasks WHERE id = ?", (await rowId("verification_tasks", c.req.param("id")))))
  if (!t || t.status !== "terbuka") throw bad("Tugas tidak terbuka", 409)
  ;(await guardVerifier(c, t))
  const { category = "minor", note } = await c.req.json()
  if (!note) throw bad("Catatan temuan wajib diisi", 422)
  const u = c.get("user")
  const table = t.object_type === "activity" ? "activity_records" : t.object_type === "baseline" ? "baselines" : "reports"
  const obj = (await q.get(`SELECT status FROM ${table} WHERE id = ?`, t.object_id))!
  assertTransition(obj.status, "perlu_perbaikan")
  ;(await q.run(`UPDATE ${table} SET status = 'perlu_perbaikan' WHERE id = ?`, t.object_id))
  const f = (await q.run("INSERT INTO findings(task_id, org_id, object_type, object_id, category, note, created_by) VALUES (?,?,?,?,?,?,?)", t.id, t.org_id, t.object_type, t.object_id, category === "mayor" ? "mayor" : "minor", note, u.id))
  ;(await q.run("UPDATE verification_tasks SET status = 'selesai', result = 'dikembalikan', note = ?, closed_at = datetime('now'), closed_by = ? WHERE id = ?", note, u.id, t.id))
  const back = t.object_type === "activity" ? ((await q.get("SELECT created_by FROM activity_records WHERE id = ?", t.object_id))?.created_by ?? null) : null
  ;(await notify(back ? [back] : (await orgUsers(t.org_id, "operator")), `Data dikembalikan (temuan ${category})`, `${t.title}: ${note}`, t.object_type === "baseline" ? "/app/baseline" : t.object_type === "report" ? "/app/reports" : "/app/input"))
  ;(await audit(c, "return", t.object_type, t.object_id, null, { finding: f.lastInsertRowid, category, note }))
  ;(await markDirty(t.org_id))
  return c.json({ ok: true })
})
wf.post("/findings/:id/resolve", async (c) => {
  const f = (await q.get("SELECT * FROM findings WHERE id = ?", Number(c.req.param("id"))))
  if (!f) throw bad("Tidak ditemukan", 404)
  ;(await assertOrgRole(c, f.org_id, "operator", "admin"))
  const { resolution } = await c.req.json()
  ;(await q.run("UPDATE findings SET status = 'selesai', resolved_at = datetime('now'), resolution = ? WHERE id = ?", resolution ?? null, f.id))
  ;(await audit(c, "resolve", "finding", f.id, null, { resolution }))
  return c.json({ ok: true })
})
wf.get("/orgs/:orgId/findings", async (c) => {
  const id = oid(c); (await assertOrg(c, id))
  return c.json((await q.all("SELECT f.*, u.name AS author FROM findings f LEFT JOIN users u ON u.id = f.created_by WHERE f.org_id = ? ORDER BY f.id DESC", id)))
})

// VER-05: kunjungan lapangan + sampel acak yang dapat direproduksi (seed tersimpan)
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export async function drawSample(orgId: number, seed: number, pct = 0.1, min = 10) {
  const trees = (await q.all("SELECT id, flags FROM assets WHERE org_id = ? AND type = 'pohon' AND status = 'hidup' ORDER BY id", orgId))
  const flagged = trees.filter((t) => json<string[]>(t.flags, []).some((f) => f.startsWith("Lokasi diragukan"))).map((t) => t.id)
  const n = Math.min(trees.length, Math.max(Math.ceil(trees.length * pct), min))
  const rnd = mulberry32(seed)
  const pool = trees.map((t) => t.id)
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]] }
  return [...new Set([...pool.slice(0, n), ...flagged])]
}
wf.get("/orgs/:orgId/field-samples", async (c) => {
  const id = oid(c); (await assertOrg(c, id))
  return c.json(await Promise.all((await q.all("SELECT * FROM field_samples WHERE org_id = ? ORDER BY id DESC", id)).map((s) => sampleDetail(s))))
})
async function sampleDetail(s: Row) {
  const ids = json<number[]>(s.asset_ids, [])
  const items = (await Promise.all(ids.map(async (aid) => {
    const a = (await q.get("SELECT id, code, lat, lng, species_id, (SELECT local_name FROM species WHERE id = assets.species_id) AS species FROM assets WHERE id = ?", aid))!
    const op = (await q.get("SELECT dbh, date FROM tree_measurements WHERE asset_id = ? AND measurer_role = 'operator' ORDER BY date DESC LIMIT 1", aid))
    const vr = (await q.get("SELECT dbh, date, lat, lng FROM tree_measurements WHERE asset_id = ? AND measurer_role = 'verifikator' AND created_at >= ? ORDER BY id DESC LIMIT 1", aid, s.created_at))
    const diff = op && vr ? (vr.dbh - op.dbh) / op.dbh : null
    return { ...a, operator: op, verifier: vr, diffPct: diff === null ? null : diff * 100, pass: diff === null ? null : Math.abs(diff) <= 0.05 }
  })))
  const measured = items.filter((i) => i.pass !== null)
  const passRate = measured.length ? measured.filter((i) => i.pass).length / measured.length : null
  return { ...s, result: json(s.result, null), items, measured: measured.length, passRate }
}
wf.post("/orgs/:orgId/field-samples", async (c) => {
  const id = oid(c); (await assertOrgRole(c, id, "admin"))
  const b = await c.req.json().catch(() => ({}))
  const seed = Number(b.seed ?? Math.floor(Math.random() * 1e9))
  const ids = (await drawSample(id, seed, b.pct ?? 0.1))
  const r = (await q.run("INSERT INTO field_samples(org_id, seed, asset_ids, planned_date, created_by) VALUES (?,?,?,?,?)", id, seed, JSON.stringify(ids), b.planned_date ?? todayWIB(), c.get("user").id))
  ;(await audit(c, "create", "field_sample", r.lastInsertRowid, null, { seed, n: ids.length }))
  return c.json((await sampleDetail((await q.get("SELECT * FROM field_samples WHERE id = ?", Number(r.lastInsertRowid)))!)))
})
wf.get("/field-samples/:id", async (c) => {
  const s = (await q.get("SELECT * FROM field_samples WHERE id = ?", (await rowId("field_samples", c.req.param("id")))))
  if (!s) throw bad("Tidak ditemukan", 404)
  ;(await assertOrg(c, s.org_id))
  return c.json((await sampleDetail(s)))
})
// §5.5: lolos bila selisih ≤ 5% pada ≥ 90% sampel; gagal → diperluas ke 30%, lalu semua
wf.post("/field-samples/:id/complete", async (c) => {
  const s = (await q.get("SELECT * FROM field_samples WHERE id = ?", (await rowId("field_samples", c.req.param("id")))))
  if (!s) throw bad("Tidak ditemukan", 404)
  ;(await assertOrgRole(c, s.org_id, "admin"))
  const d = (await sampleDetail(s))
  if (d.measured < d.items.length) throw bad(`Baru ${d.measured}/${d.items.length} pohon sampel diukur ulang`, 422)
  const pass = (d.passRate ?? 0) >= 0.9
  let status = pass ? "lolos" : "gagal_diperluas"
  let expanded: number[] | null = null
  if (!pass) {
    const total = (await q.get<{ n: number }>("SELECT COUNT(*) AS n FROM assets WHERE org_id = ? AND type = 'pohon' AND status = 'hidup'", s.org_id))!.n
    const pctNow = d.items.length / Math.max(total, 1)
    expanded = (await drawSample(s.org_id, s.seed, pctNow < 0.3 ? 0.3 : 1, 0))
    ;(await q.run("INSERT INTO field_samples(org_id, seed, asset_ids, planned_date, created_by) VALUES (?,?,?,?,?)", s.org_id, s.seed, JSON.stringify(expanded), todayWIB(), c.get("user").id))
  }
  ;(await q.run("UPDATE field_samples SET status = ?, result = ? WHERE id = ?", status, JSON.stringify({ passRate: d.passRate, measured: d.measured }), s.id))
  ;(await audit(c, "complete", "field_sample", s.id, null, { status, passRate: d.passRate }))
  return c.json({ status, passRate: d.passRate, expanded: expanded?.length ?? 0 })
})

// ======================= RAPOR =======================
export async function buildReportSnapshot(orgId: number, kind: string, start: string, end: string) {
  const ctx = (await loadContext(orgId))
  const days = (await readDays(orgId, start, end, ctx))
  const s = summarize(days)
  const official = ["terverifikasi", "aktual", "terukur"]
  const sources = Object.entries(s.bySource).map(([src, v]) => {
    const verified = Object.entries(v.labels).filter(([l]) => official.includes(l)).reduce((a, [, x]) => a + x, 0)
    // air limbah: tangki septik milik sekolah = Scope 1, selain itu Scope 3 (sama dengan engine harian)
    const scope = src === "air_limbah" ? (ctx.org.sanitation === "septik" ? 1 : 3) : SOURCE_META[src]?.scope
    return { source: src, label: SOURCE_META[src]?.label ?? src, scope, total: v.kg, verified, other: v.kg - verified, labels: v.labels }
  }).sort((a, b) => b.total - a.total)
  const trees = (await loadTrees(orgId))
  const pop = (ctx.org.students ?? 0) + (ctx.org.teachers ?? 0) + (ctx.org.staff ?? 0)
  const blComp = ctx.baselineComp
  const vsBaseline = sources.map((x) => {
    const bc = blComp[x.source]
    const cur = s.activeDays ? days.filter((d) => d.k > 0).reduce((a, d) => a + (d.sources[x.source]?.kg ?? 0), 0) / s.activeDays / Math.max(pop, 1) : 0
    const base = bc ? bc.daily_active_kg / Math.max(ctx.baselinePopulation, 1) : 0
    return { source: x.source, current: cur, baseline: base, change: base ? cur / base - 1 : null }
  })
  const monthly: Record<string, number> = {}
  for (const d of days) monthly[d.date.slice(0, 7)] = (monthly[d.date.slice(0, 7)] ?? 0) + d.total
  const snap: any = {
    org: { name: ctx.org.name, npsn: ctx.org.npsn, kecamatan: ctx.org.kecamatan, population: pop, building_m2: ctx.org.building_m2 },
    period: { start, end, days: days.length, activeDays: s.activeDays }, generatedAt: new Date().toISOString(),
    feVersion: feVersionSet(ctx.fe), baselineVersion: ctx.baseline?.version_label ?? null, baselineStatus: ctx.baseline?.status ?? null,
  }
  if (kind === "karbon") {
    Object.assign(snap, {
      total: s.total, officialTotal: sources.reduce((a, x) => a + x.verified, 0), scope: s.scope, sources, vsBaseline, monthly,
      perPersonYear: pop ? (s.total / days.length) * 365 / pop : 0, perActiveDay: s.activeDays ? s.total / s.activeDays : 0, strongShare: s.strongShare,
      notes: sources.filter((x) => x.other > 0).map((x) => `${x.label}: ${(x.other).toFixed(1)} kg CO₂e berlabel ${Object.keys(x.labels).filter((l) => !official.includes(l)).join("/")} — dicantumkan sebagai catatan, tidak masuk angka resmi`),
      disclaimer: "Serapan pohon dilaporkan terpisah di Rapor Jasa Lingkungan dan bukan kredit karbon (Perpres 110/2025).",
    })
  } else {
    const eco = sumEco(days)
    const abs = { absorbed: eco.trees.absorbed, released: eco.trees.released, net: eco.trees.absorbed - eco.trees.released }
    Object.assign(snap, {
      trees: { stock: eco.trees.stock, count: eco.trees.count, absorbed: abs.absorbed, released: abs.released, net: abs.net },
      avoided: { ...eco.avoided, ...(await assetEco(orgId, start, end)) },
      disclaimer: "Serapan pohon adalah estimasi pelaporan internal, bukan kredit karbon / SPE-GRK. Emisi terhindar tidak mengurangi angka Rapor Karbon.",
    })
  }
  return snap
}
wf.get("/orgs/:orgId/reports", async (c) => {
  const id = oid(c); (await assertOrg(c, id))
  return c.json((await q.all("SELECT id, uuid, org_id, kind, period_type, period_label, start_date, end_date, status, baseline_version, fe_version, hash, created_at, published_at FROM reports WHERE org_id = ? ORDER BY id DESC", id)))
})
wf.post("/orgs/:orgId/reports", async (c) => {
  const id = oid(c); (await assertOrgRole(c, id, "operator", "admin"))
  const b = await c.req.json()
  const kind = b.kind === "jasa" ? "jasa" : "karbon"
  if (!b.start_date || !b.end_date) throw bad("Periode wajib")
  const snap = (await buildReportSnapshot(id, kind, b.start_date, b.end_date))
  const r = (await q.run("INSERT INTO reports(org_id, kind, period_type, period_label, start_date, end_date, status, baseline_version, fe_version, snapshot) VALUES (?,?,?,?,?,?,?,?,?,?)",
    id, kind, b.period_type ?? "bulan", b.period_label ?? `${b.start_date} – ${b.end_date}`, b.start_date, b.end_date, "draf", snap.baselineVersion, snap.feVersion, JSON.stringify(snap)))
  ;(await audit(c, "create", "report", r.lastInsertRowid, null, b))
  const made = (await q.get<{ uuid: string }>("SELECT uuid FROM reports WHERE id = ?", Number(r.lastInsertRowid)))
  return c.json({ id: Number(r.lastInsertRowid), uuid: made?.uuid })
})
wf.get("/reports/:id", async (c) => {
  const r = (await q.get("SELECT r.*, o.name AS org_name FROM reports r JOIN organizations o ON o.id = r.org_id WHERE r.id = ?", (await rowId("reports", c.req.param("id")))))
  if (!r) throw bad("Rapor tidak ditemukan", 404)
  ;(await assertOrg(c, r.org_id))
  return c.json({ ...r, snapshot: json(r.snapshot, {}), myRoles: (await rolesInOrg(c.get("user"), r.org_id)) })
})
wf.post("/reports/:id/refresh", async (c) => {
  const r = (await q.get("SELECT * FROM reports WHERE id = ?", (await rowId("reports", c.req.param("id")))))
  if (!r) throw bad("Tidak ditemukan", 404)
  ;(await assertOrgRole(c, r.org_id, "operator", "admin"))
  if (!["draf", "perlu_perbaikan", "perlu_tinjau"].includes(r.status)) throw bad("Rapor tidak dapat diperbarui pada status ini", 409)
  const snap = (await buildReportSnapshot(r.org_id, r.kind, r.start_date, r.end_date))
  ;(await q.run("UPDATE reports SET snapshot = ?, baseline_version = ?, fe_version = ?, status = CASE status WHEN 'perlu_tinjau' THEN 'draf' ELSE status END WHERE id = ?", JSON.stringify(snap), snap.baselineVersion, snap.feVersion, r.id))
  return c.json({ ok: true })
})
// Hapus rapor yang masih draf (rapor terbit tidak bisa dihapus)
wf.delete("/reports/:id", async (c) => {
  const r = (await q.get("SELECT * FROM reports WHERE id = ?", (await rowId("reports", c.req.param("id")))))
  if (!r) throw bad("Tidak ditemukan", 404)
  ;(await assertOrgRole(c, r.org_id, "operator", "admin"))
  if (!["draf", "perlu_perbaikan", "perlu_tinjau"].includes(r.status)) throw bad("Hanya rapor draf yang dapat dihapus", 409)
  ;(await q.run("UPDATE verification_tasks SET status = 'dibatalkan' WHERE object_type = 'report' AND object_id = ? AND status = 'terbuka'", r.id))
  ;(await q.run("DELETE FROM reports WHERE id = ?", r.id))
  ;(await audit(c, "delete", "report", r.id, { status: r.status, period: r.period_label }, null))
  return c.json({ ok: true })
})
// REP-03: operator ajukan → Admin mengesahkan → terbit & terkunci
wf.post("/reports/:id/request", async (c) => {
  const r = (await q.get("SELECT * FROM reports WHERE id = ?", (await rowId("reports", c.req.param("id")))))
  if (!r) throw bad("Tidak ditemukan", 404)
  ;(await assertOrgRole(c, r.org_id, "operator", "admin"))
  assertTransition(r.status, "diajukan")
  const bl = (await q.get("SELECT 1 FROM baselines WHERE org_id = ? AND status = 'terkunci'", r.org_id))
  if (!bl) throw bad("Rapor resmi hanya bisa diterbitkan setelah baseline Terkunci", 422)
  ;(await q.run("UPDATE reports SET status = 'diajukan', submitted_by = ?, approved_by = ? WHERE id = ?", c.get("user").id, c.get("user").id, r.id))
  ;(await createTask(r.org_id, "report", r.id, `${r.kind === "karbon" ? "Rapor Karbon" : "Rapor Jasa Lingkungan"} ${r.period_label}`, "normal"))
  ;(await audit(c, "request_approval", "report", r.id, { status: r.status }, { status: "diajukan" }))
  return c.json({ ok: true })
})
export { SLA_DAYS }
