// Konsol admin (ADM-*), pengelola program (REP-04, AUTH-04), dan halaman publik.
import { Hono } from "hono"
import { transaction, q, json, getSetting, setSetting } from "../db"
import { addDays, audit, bad, hasRole, qrVerify, requireAuth, requireRole, sha256, todayWIB, accessibleOrgIds, assertOrgRole, rolesInOrg } from "../lib"
import { computeRange, loadContext, loadTrees, summarize, treeDaily, treeStock, treeAt, buildTree, feVersionSet, MODE_FACTOR } from "../engine/engine"
import { closeDays, markDirty, readDays } from "../engine/ledger"
import { baselineCompleteness, monitoringTasks, runDailyJob, weights } from "../engine/services"
import { DEFAULT_SPECIES, SOURCE_META } from "../engine/factors"
import * as C from "../engine/calc"
import { newInvite } from "./auth"
import { treeSummary } from "./field"

// ======================= ADMIN =======================
export const admin = new Hono()
admin.use("*", requireAuth)

admin.get("/factors", async (c) => {
  const all = c.req.query("all") === "1"
  return c.json((await q.all(`SELECT * FROM emission_factors ${all ? "" : "WHERE active = 1"} ORDER BY ext_id, id DESC`)))
})
admin.get("/factors/versions", async (c) => c.json((await q.all(
  "SELECT version, MIN(valid_from) AS valid_from, COUNT(*) AS changed, MAX(created_at) AS created_at, SUM(active) AS active_rows FROM emission_factors GROUP BY version ORDER BY version DESC"))))
// Simpan perubahan banyak faktor sekaligus sebagai satu versi baru (riwayat lama tetap memakai versi sebelumnya)
admin.post("/factors/batch", requireRole("admin"), async (c) => {
  const { version, valid_from, note, changes = [], created = [] } = await c.req.json()
  if (!version || !/^[\w.\-]+$/.test(version)) throw bad("Label versi wajib (mis. FE-2026.2)")
  const from = valid_from ?? todayWIB()
  const user = c.get("user").id
  let n = 0
  await transaction(async () => {
    for (const ch of changes) {
      const old = (await q.get("SELECT * FROM emission_factors WHERE code = ? AND active = 1", ch.code))
      if (!old) throw bad(`Faktor ${ch.code} tidak ditemukan`, 404)
      if (old.version === version) throw bad(`Versi ${version} sudah dipakai untuk ${old.ext_id ?? old.code}`, 409)
      const value = ch.value === null || ch.value === "" || ch.value === undefined ? null : Number(ch.value)
      if (value !== null && !(value >= 0)) throw bad(`Nilai ${old.ext_id} tidak valid`)
      const status = ch.status ?? (value === null ? "belum_diisi" : old.status === "belum_diisi" ? "perlu_verifikasi" : old.status)
      ;(await q.run("UPDATE emission_factors SET active = 0, valid_to = ? WHERE id = ?", addDays(from, -1), old.id))
      ;(await q.run(`INSERT INTO emission_factors(code, ext_id, category, name, name_en, activity_unit, gwp_basis, status, value, unit, gas, scope, source, url, version, valid_from, active, non_national, note, created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?)`, old.code, old.ext_id, old.category, ch.name ?? old.name, ch.name_en ?? old.name_en, old.activity_unit, ch.gwp_basis ?? old.gwp_basis, status, value,
        ch.unit ?? old.unit, ch.gas ?? old.gas, old.scope, ch.source ?? old.source, ch.url ?? old.url, version, from, old.non_national, note ?? old.note, user))
      ;(await audit(c, "new_version", "emission_factor", old.ext_id ?? old.code, { value: old.value, version: old.version }, { value, version, status }))
      n++
    }
    for (const f of created) {
      if (!f.ext_id || !f.name) throw bad("ID & sumber emisi wajib untuk faktor baru")
      const code = String(f.code ?? f.ext_id).toUpperCase().replace(/[^A-Z0-9]+/g, "_")
      if ((await q.get("SELECT 1 FROM emission_factors WHERE code = ? OR ext_id = ?", code, f.ext_id))) throw bad(`ID ${f.ext_id} sudah ada`, 409)
      const value = f.value === null || f.value === "" || f.value === undefined ? null : Number(f.value)
      ;(await q.run(`INSERT INTO emission_factors(code, ext_id, category, name, name_en, activity_unit, gwp_basis, status, value, unit, gas, scope, source, url, version, valid_from, active, non_national, created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`, code, f.ext_id, f.category ?? "Lainnya", f.name, f.name_en ?? f.name, f.activity_unit ?? "-", f.gwp_basis ?? "-",
        f.status ?? (value === null ? "belum_diisi" : "perlu_verifikasi"), value, f.unit ?? "kg CO2e", f.gas ?? "CO2e", String(f.scope ?? "3"), f.source ?? "-", f.url ?? null, version, from, f.non_national ? 1 : 0, user))
      ;(await audit(c, "create", "emission_factor", f.ext_id, null, { ...f, version }))
      n++
    }
  })
  return c.json({ ok: true, version, saved: n })
})
// ADM-01: faktor aktif tidak dapat dihapus, hanya digantikan versi baru
admin.post("/factors", requireRole("admin"), async (c) => {
  const b = await c.req.json()
  if (!b.code || !(Number(b.value) >= 0) || !b.version) throw bad("Kode, nilai, dan versi wajib")
  const old = (await q.get("SELECT * FROM emission_factors WHERE code = ? AND active = 1", b.code))
  if (old && old.version === b.version) throw bad("Versi baru harus berbeda dari versi aktif", 409)
  const from = b.valid_from ?? todayWIB()
  if (old) (await q.run("UPDATE emission_factors SET active = 0, valid_to = ? WHERE id = ?", addDays(from, -1), old.id))
  const r = (await q.run("INSERT INTO emission_factors(code, category, name, value, unit, gas, scope, source, url, version, valid_from, active, non_national, note, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?,?,?)",
    b.code, b.category ?? old?.category, b.name ?? old?.name, Number(b.value), b.unit ?? old?.unit, b.gas ?? old?.gas, b.scope ?? old?.scope, b.source ?? old?.source, b.url ?? old?.url ?? null, b.version, from, b.non_national ? 1 : 0, b.note ?? null, c.get("user").id))
  ;(await audit(c, "new_version", "emission_factor", b.code, old, { ...b, id: r.lastInsertRowid }))
  return c.json({ id: Number(r.lastInsertRowid) })
})
admin.delete("/factors/:id", requireRole("admin"), async (c) => {
  const f = (await q.get("SELECT * FROM emission_factors WHERE id = ?", Number(c.req.param("id"))))
  if (!f) throw bad("Tidak ditemukan", 404)
  if (f.active) throw bad("Faktor aktif tidak dapat dihapus — buat versi baru", 409)
  throw bad("Faktor historis disimpan untuk reprodusibilitas rapor", 409)
})
// CALC-04: hitung ulang terkontrol (pilih lingkup & periode); log sebelum/sesudah
// Hitung ulang Admin: menimpa hari tertutup (termasuk yang sudah terkunci), mis. setelah faktor emisi/baseline baru
admin.post("/recalculate", requireRole("admin"), async (c) => {
  const { orgIds, start, end, policy = "hitung_ulang", reason } = await c.req.json()
  if (!start || !end) throw bad("Periode wajib")
  if (end > todayWIB()) throw bad("Tanggal akhir belum terjadi", 422)
  const ids: number[] = orgIds?.length ? orgIds : (await q.all<{ id: number }>("SELECT id FROM organizations")).map((o) => o.id)
  const log = []
  for (const id of ids) {
    const before = (await q.get<{ s: number }>("SELECT COALESCE(SUM(total),0) AS s FROM day_ledger WHERE org_id = ? AND date BETWEEN ? AND ?", id, start, end))!.s
    const ctx = (await loadContext(id))
    const r = policy === "hitung_ulang" ? (await closeDays(id, start, end, { ctx, force: true })) : { closed: 0, changed: 0 }
    const after = (await q.get<{ s: number }>("SELECT COALESCE(SUM(total),0) AS s FROM day_ledger WHERE org_id = ? AND date BETWEEN ? AND ?", id, start, end))!.s
    log.push({ orgId: id, before, after, days: r.closed, changed: r.changed, feVersion: feVersionSet(ctx.fe) })
  }
  ;(await audit(c, "recalculate", "calculation", `${start}..${end}`, null, { policy, reason, log }))
  return c.json({ log })
})
admin.post("/jobs/daily", requireRole("admin"), async (c) => c.json((await runDailyJob(c.req.query("date") ?? undefined))))

// ADM-02: pustaka jenis pohon; uji persamaan sebelum diaktifkan
admin.get("/species", async (c) => c.json((await q.all("SELECT * FROM species ORDER BY active DESC, local_name"))))
admin.post("/species/test", async (c) => {
  const b = await c.req.json()
  const eq = { equation: b.equation, a: b.a, b: b.b, ah: b.ah, bh: b.bh, density: Number(b.density), carbonFraction: Number(b.carbon_fraction ?? 0.47), rootRatio: Number(b.root_ratio ?? 0), carbonTree: b.carbon_tree !== false }
  const samples = [10, 20, 30, 50].map((d) => ({ dbh: d, height: b.height ?? null, stockCO2: C.treeStockCO2(eq as any, d, b.height) }))
  return c.json({ samples })
})
admin.post("/species", requireRole("admin"), async (c) => {
  const b = await c.req.json()
  if (!b.local_name || !b.equation) throw bad("Nama & persamaan wajib")
  if (!b.tested) throw bad("Uji persamaan dengan contoh sebelum diaktifkan", 422)
  const r = (await q.run("INSERT INTO species(local_name, scientific, description, equation, a, b, ah, bh, density_source, density, growth_default, dbh_min, dbh_max, carbon_fraction, root_ratio, carbon_tree, source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    b.local_name, b.scientific ?? "-", b.description ?? null, b.equation, b.a ?? null, b.b ?? null, b.ah ?? null, b.bh ?? null, b.density_source ?? null, b.density ?? 0.6, b.growth_default ?? 0.8, b.dbh_min ?? 5, b.dbh_max ?? 150, b.carbon_fraction ?? 0.47, b.root_ratio ?? 0.24, b.carbon_tree === false ? 0 : 1, b.source ?? "-"))
  ;(await audit(c, "create", "species", r.lastInsertRowid, null, b))
  return c.json({ id: Number(r.lastInsertRowid) })
})
admin.patch("/species/:id", requireRole("admin"), async (c) => {
  const id = Number(c.req.param("id"))
  const before = (await q.get("SELECT * FROM species WHERE id = ?", id))
  const b = await c.req.json()
  for (const k of ["local_name", "scientific", "description", "equation", "ah", "bh", "density_source", "density", "growth_default", "dbh_min", "dbh_max", "carbon_fraction", "root_ratio", "active", "a", "b", "source"]) if (k in b) (await q.run(`UPDATE species SET ${k} = ? WHERE id = ?`, b[k], id))
  ;(await audit(c, "update", "species", id, before, b))
  // koefisien/berat jenis berubah → stok karbon pohon jenis ini dihitung ulang (hari terbuka)
  for (const o of (await q.all<{ org_id: number }>("SELECT DISTINCT org_id FROM assets WHERE species_id = ?", id))) (await markDirty(o.org_id))
  return c.json({ ok: true })
})

// ADM-04: log audit + ekspor
admin.get("/audit", requireRole("admin"), async (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 200), 2000)
  const rows = (await q.all(`SELECT l.*, u.name AS actor_name, u.email AS actor_email FROM audit_log l LEFT JOIN users u ON u.id = l.actor_id ORDER BY l.id DESC LIMIT ?`, limit))
  if (c.req.query("format") === "csv") {
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`
    const csv = ["id,waktu,aktor,aksi,objek,id_objek,sebelum,sesudah,ip", ...rows.map((r) => [r.id, r.at, r.actor_email, r.action, r.object_type, r.object_id, r.before, r.after, r.ip].map(esc).join(","))].join("\n")
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="audit-${todayWIB()}.csv"` } })
  }
  return c.json(rows)
})

// ADM-03: konfigurasi bobot, ambang anomali, SLA, serta konfigurasi sistem/ENV (khusus Admin)
admin.get("/settings", async (c) => {
  const isAdmin = hasRole(c.get("user"), "admin")
  return c.json({
    completeness_weights: (await weights()), anomaly_kwh_multiplier: (await getSetting("anomaly_kwh_multiplier", 2)),
    sla_days: (await getSetting("sla_days", { rutin: 7, prioritas: 3, baseline: 14, perbaikan: 10 })),
    confidence_thresholds: (await getSetting("confidence_thresholds", { tinggi: 0.8, sedang: 0.4 })),
    last_daily_job: (await getSetting("last_daily_job", null)),
  })
})
admin.put("/settings", requireRole("admin"), async (c) => {
  const b = await c.req.json()
  for (const k of ["completeness_weights", "anomaly_kwh_multiplier", "sla_days", "confidence_thresholds"]) if (k in b) {
    (await audit(c, "setting", "settings", k, (await getSetting(k, null)), b[k]))
    ;(await setSetting(k, b[k]))
  }
  return c.json({ ok: true })
})

// Tenant & pengguna
admin.get("/orgs", async (c) => {
  const ids = (await accessibleOrgIds(c.get("user")))
  if (!ids.length) return c.json([])
  return c.json((await q.all(`SELECT o.*, r.name AS region_name FROM organizations o LEFT JOIN regions r ON r.id = o.region_id WHERE o.id IN (${ids.join(",")}) ORDER BY o.name`)))
})
admin.post("/orgs", requireRole("admin"), async (c) => {
  const b = await c.req.json()
  if (!b.name || !b.short) throw bad("Nama & kode singkat wajib")
  const r = (await q.run("INSERT INTO organizations(region_id, name, short, npsn, type, jenjang, kecamatan, students, teachers, staff, lat, lng) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
    b.region_id ?? 1, b.name, String(b.short).toUpperCase(), b.npsn ?? null, b.type ?? "sekolah", b.jenjang ?? "SMP", b.kecamatan ?? null, b.students ?? 0, b.teachers ?? 0, b.staff ?? 0, b.lat ?? null, b.lng ?? null))
  ;(await audit(c, "create", "organization", r.lastInsertRowid, null, b))
  return c.json({ id: Number(r.lastInsertRowid) })
})
admin.get("/users", async (c) => {
  const u = c.get("user")
  const org = c.req.query("org") ? Number(c.req.query("org")) : null
  if (org) (await assertOrgRole(c, org, "operator", "kepsek", "admin"))
  else if (!hasRole(u, "admin")) throw bad("Tidak punya akses", 403)
  const users = (await q.all(`SELECT DISTINCT u.* FROM users u LEFT JOIN role_assignments r ON r.user_id = u.id ${org ? "WHERE r.org_id = ?" : ""} ORDER BY u.name`, ...(org ? [org, org] : [])))
  return c.json((await Promise.all(users.map(async (x) => ({
    ...x,
    roles: (await q.all("SELECT r.role, r.org_id, o.name AS org_name FROM role_assignments r LEFT JOIN organizations o ON o.id = r.org_id WHERE r.user_id = ?", x.id)),
    verifies: [],
  })))))
})
// AUTH-03: undang pengguna (operator boleh mengundang untuk sekolahnya)
admin.post("/invitations", async (c) => {
  const { email, role, org_id } = await c.req.json()
  const u = c.get("user")
  if (!email || !role) throw bad("Email & peran wajib")
  if (!["admin", "operator", "kepsek", "petugas"].includes(role)) throw bad("Peran tidak dikenal (Admin, Operator, Kepala Sekolah, Petugas Monitoring)")
  if (role !== "admin" && !org_id) throw bad("Pilih lembaga untuk peran ini")
  if (!hasRole(u, "admin")) {
    // operator mengundang untuk sekolahnya sendiri; admin hanya bisa ditetapkan admin
    ;(await assertOrgRole(c, Number(org_id), "operator"))
    if (role === "admin") throw bad("Peran Admin hanya dapat ditetapkan admin", 403)
  }
  const existing = (await q.get("SELECT id FROM users WHERE email = ?", String(email).toLowerCase()))
  if (existing) {
    (await q.run("INSERT INTO role_assignments(user_id, role, org_id) VALUES (?,?,?)", existing.id, role, org_id ?? null))
    ;(await audit(c, "assign_role", "user", existing.id, null, { role, org_id }))
    return c.json({ ok: true, existing: true })
  }
  const token = (await newInvite(email, role, org_id ?? null, u.id))
  ;(await audit(c, "invite", "user", email, null, { role, org_id }))
  const link = `/login?invite=${token}`
  // undangan petugas dibuka di aplikasi petugas (petugas.<domain>), selain itu di admin.<domain>
  return c.json({ ok: true, token, link, app: role === "petugas" ? "petugas" : "admin", waText: `Anda diundang ke Sekolah Lestari (Dashboard Emisi Karbon) sebagai ${role}. Buka: ${link} (berlaku 7 hari)` })
})
// Kelola peran pengguna. Admin: semua lembaga. Operator: hanya lembaganya, peran operator/petugas/kepsek.
admin.delete("/role-assignments", async (c) => {
  const u = c.get("user")
  const { user_id, role, org_id } = await c.req.json()
  if (!user_id || !role) throw bad("Pengguna & peran wajib")
  if (!hasRole(u, "admin")) {
    if (!org_id) throw bad("Pilih lembaga", 403)
    ;(await assertOrgRole(c, Number(org_id), "operator"))
    if (!["operator", "petugas", "kepsek"].includes(role)) throw bad("Peran ini hanya dapat diubah admin", 403)
    if (Number(user_id) === u.id) throw bad("Tidak dapat mencabut peran Anda sendiri", 409)
  }
  if (role === "admin" && Number(user_id) === u.id) throw bad("Tidak dapat mencabut peran admin Anda sendiri", 409)
  const r = await q.run(`DELETE FROM role_assignments WHERE user_id = ? AND role = ? AND ${org_id ? "org_id = ?" : "org_id IS NULL"}`, ...(org_id ? [user_id, role, org_id] : [user_id, role]))
  if (!Number((r as any).changes ?? 1)) throw bad("Peran tidak ditemukan", 404)
  // tanpa peran tersisa → akun dinonaktifkan
  ;(await q.run("UPDATE users SET active = 0 WHERE id = ? AND id NOT IN (SELECT user_id FROM role_assignments WHERE user_id IS NOT NULL)", user_id))
  ;(await audit(c, "revoke_role", "user", user_id, { role, org_id }, null))
  return c.json({ ok: true })
})
// Aktif/nonaktifkan akun & ubah nama (admin)
admin.patch("/users/:id", requireRole("admin"), async (c) => {
  const id = Number(c.req.param("id"))
  const b = await c.req.json()
  if (id === c.get("user").id && b.active === false) throw bad("Tidak dapat menonaktifkan akun Anda sendiri", 409)
  const before = (await q.get("SELECT id, name, active FROM users WHERE id = ?", id))
  if (!before) throw bad("Tidak ditemukan", 404)
  if (typeof b.active === "boolean") (await q.run("UPDATE users SET active = ? WHERE id = ?", b.active ? 1 : 0, id))
  if (b.name) (await q.run("UPDATE users SET name = ? WHERE id = ?", String(b.name).trim().slice(0, 120), id))
  ;(await audit(c, "update", "user", id, before, b))
  return c.json({ ok: true })
})

// AUTH-04: penugasan verifikator eksternal dihapus — persetujuan oleh operator (data bulanan) & admin (baseline/rapor)
admin.all("/verifier-assignments", (c) => c.json({ error: "Verifikator eksternal tidak dipakai lagi" }, 410))

// ======================= PENGELOLA PROGRAM (REP-04) =======================
export const program = new Hono()
program.use("*", requireAuth, requireRole("admin"))
program.get("/overview", async (c) => {
  const kec = c.req.query("kecamatan"), jen = c.req.query("jenjang")
  const ids = (await accessibleOrgIds(c.get("user")))
  const today = todayWIB()
  const orgs = (await q.all(`SELECT * FROM organizations WHERE id IN (${ids.join(",") || 0}) ${kec ? "AND kecamatan = ?" : ""} ${jen ? "AND jenjang = ?" : ""} ORDER BY name`, ...[kec, jen].filter(Boolean)))
  const rows = (await Promise.all(orgs.map(async (o) => {
    const b = (await q.get("SELECT * FROM baselines WHERE org_id = ? ORDER BY version DESC LIMIT 1", o.id))
    const comp = b ? (await baselineCompleteness(o.id, b.period_start, b.period_end)) : null
    const ctx = (await loadContext(o.id))
    const days = (await readDays(o.id, addDays(today, -29), today, ctx))
    const s = summarize(days)
    const lastDay = days[days.length - 1]
    const trees = { stock: lastDay?.tree.stock ?? 0, count: lastDay?.tree.count ?? 0 }
    const pending = (await q.get<{ n: number }>("SELECT COUNT(*) AS n FROM verification_tasks WHERE org_id = ? AND status = 'terbuka'", o.id))!.n
    const overdue = (await q.get<{ n: number }>("SELECT COUNT(*) AS n FROM verification_tasks WHERE org_id = ? AND status = 'terbuka' AND due_at < ?", o.id, today))!.n
    const verifiers = (await q.all("SELECT u.id, u.name, v.kind FROM verifier_assignments v JOIN users u ON u.id = v.user_id WHERE v.org_id = ?", o.id))
    const tasks = (await monitoringTasks(o.id))
    const pop = (o.students ?? 0) + (o.teachers ?? 0) + (o.staff ?? 0)
    return {
      id: o.id, name: o.name, short: o.short, kecamatan: o.kecamatan, jenjang: o.jenjang, population: pop,
      baseline: b ? { version: b.version_label, status: b.status, completeness: comp!.score, estimateShare: b.estimate_share } : null,
      emission30: s.total, perPersonDay: pop && s.activeDays ? s.total / s.activeDays / pop : 0, strongShare: s.strongShare,
      treeStock: trees.stock, treeCount: trees.count, pendingTasks: pending, overdueTasks: overdue, verifiers,
      monitoring: { total: tasks.length, late: tasks.filter((t) => t.status === "terlambat").length },
    }
  })))
  // beban persetujuan per operator/admin
  const verifierLoad = (await q.all(`SELECT u.id, u.name, u.email, (SELECT COUNT(*) FROM verification_tasks t WHERE t.verifier_id = u.id AND t.status = 'terbuka') AS open,
      (SELECT COUNT(*) FROM verification_tasks t WHERE t.verifier_id = u.id AND t.status = 'terbuka' AND t.due_at < ?) AS overdue,
      (SELECT COUNT(DISTINCT r2.org_id) FROM role_assignments r2 WHERE r2.user_id = u.id AND r2.org_id IS NOT NULL) AS schools
    FROM users u WHERE u.active = 1 AND u.id IN (SELECT user_id FROM role_assignments WHERE role IN ('operator','admin')) ORDER BY u.name`, today))
  const filters = {
    kecamatan: (await q.all<{ k: string }>("SELECT DISTINCT kecamatan AS k FROM organizations WHERE kecamatan IS NOT NULL")).map((r) => r.k),
    jenjang: (await q.all<{ j: string }>("SELECT DISTINCT jenjang AS j FROM organizations")).map((r) => r.j),
  }
  return c.json({ orgs: rows, verifierLoad, filters, readOnly: false })
})

// ======================= PUBLIK =======================
export const pub = new Hono()
pub.get("/stats", async (c) => {
  const today = todayWIB()
  const monthStart = today.slice(0, 8) + "01"
  const from = addDays(today, -6) < monthStart ? addDays(today, -6) : monthStart
  const orgs = (await q.all<{ id: number }>("SELECT id FROM organizations"))
  let stock = 0, trees = 0, month = 0, treeDailyKg = 0
  const days = new Map<string, { date: string; total: number; type: string }>()
  const sources: Record<string, number> = {}
  for (const o of orgs) {
    const ds = await readDays(o.id, from, today)
    const last = ds[ds.length - 1]
    if (last) { stock += last.tree.stock; trees += last.tree.count }
    treeDailyKg += ds.find((d) => d.date === today)?.tree.absorbed ?? 0
    for (const d of ds) {
      if (d.date >= addDays(today, -6)) {
        const e = days.get(d.date) ?? { date: d.date, total: 0, type: d.dayType }
        e.total += d.total; if (d.dayType !== "libur") e.type = d.dayType
        days.set(d.date, e)
      }
      if (d.date >= monthStart) { month += d.total; for (const [k, v] of Object.entries(d.sources)) sources[k] = (sources[k] ?? 0) + v.kg }
    }
  }
  const biopori = (await q.get<{ n: number }>("SELECT COUNT(*) AS n FROM assets WHERE type = 'biopori'"))!.n
  const people = (await q.get<{ n: number }>("SELECT COALESCE(SUM(students + teachers + staff),0) AS n FROM organizations"))!.n
  const ctx = await loadContext(orgs[0]?.id ?? 1)
  const series = [...days.values()].sort((x, y) => x.date.localeCompare(y.date))
  return c.json({
    schools: orgs.length, trees, stockTon: stock / 1000, monthEmissionTon: month / 1000, biopori, people, feVersion: feVersionSet(ctx.fe),
    todayKg: series.find((d) => d.date === today)?.total ?? 0, treeDailyKg, days: series, sources,
    factors: { grid: ctx.fe.EL_JAMALI?.value ?? 0.87, motor: ctx.fe.TR_MOTOR?.value ?? 0.082, car: ctx.fe.TR_SEDAN?.value ?? 0.235, wastewater: ctx.fe.WW_ORG_HARI?.value ?? 0.11, lpg: ctx.fe.LPG_BI?.value ?? 3 },
  })
})
pub.get("/trees/:code", async (c) => {
  // TREE-07: tidak menampilkan data pribadi
  const a = (await q.get("SELECT a.id, a.code, a.qr_sig, a.type, a.status, a.species_id, a.lat, a.lng, a.planted_at, a.org_id, a.dead_at, a.name, a.meta, a.created_at, o.name AS org_name, o.kecamatan FROM assets a JOIN organizations o ON o.id = a.org_id WHERE a.code = ?", c.req.param("code")))
  if (!a) throw bad("Aset tidak ditemukan", 404)
  // aset non-pohon (biopori, komposter, panel surya, AC, …): profil ringkas tanpa data pribadi
  if (a.type !== "pohon") {
    const m = json<Record<string, any>>(a.meta, {})
    const SAFE = ["diameter_cm", "depth_cm", "area_m2", "tank_l", "capacity_l", "kind", "kwp", "inverter", "gas", "charge_kg", "room", "name"]
    return c.json({
      kind: "asset", code: a.code, type: a.type, name: a.name, status: a.status, verified: c.req.query("s") ? qrVerify(a.code, c.req.query("s")!) : null,
      org: a.org_name, kecamatan: a.kecamatan, registered: a.status === "belum_dipasang" ? null : a.created_at?.slice(0, 10) ?? null,
      meta: Object.fromEntries(Object.entries(m).filter(([k]) => SAFE.includes(k))),
      location: a.lat ? { lat: +a.lat.toFixed(4), lng: +a.lng.toFixed(4) } : null,
    })
  }
  const sig = c.req.query("s")
  const s = (await treeSummary(a))
  const sp = (await q.get("SELECT * FROM species WHERE id = ?", a.species_id))
  const ms = (await q.all("SELECT id, date, dbh, height, photos FROM tree_measurements WHERE asset_id = ? AND measurer_role = 'operator' AND status != 'ditolak' ORDER BY date", a.id))
  const growth: any[] = []
  if (sp && ms.length) {
    const t = buildTree(a, sp, ms)
    for (let d = ms[0].date; d <= addDays(todayWIB(), 0); d = addDays(d, 30)) { const st = treeAt(t, d); if (st) growth.push({ date: d, dbh: +st.dbh.toFixed(2), stock: +st.stock.toFixed(1) }) }
  }
  const photo = ms.flatMap((m) => json<number[]>(m.photos, [])).pop() ?? null
  return c.json({
    code: a.code, verified: sig ? qrVerify(a.code, sig) : null, status: a.status, org: a.org_name, kecamatan: a.kecamatan,
    species: sp?.local_name, scientific: sp?.scientific, description: sp?.description ?? null, plantedAt: a.planted_at,
    location: a.lat ? { lat: +a.lat.toFixed(4), lng: +a.lng.toFixed(4) } : null,
    dbh: s.state?.dbh ?? null, height: s.last?.height ?? null, stockKg: s.state?.stock ?? 0, label: s.state?.label, lastMeasured: s.last?.date ?? null,
    growth, photo: photo ? `/api/public/photos/${photo}` : null,
    note: "Estimasi serapan untuk pelaporan internal, bukan kredit karbon.",
  })
})
pub.get("/photos/:id", async (c) => {
  // hanya foto yang dipakai pada pengukuran pohon (bukan bukti tagihan)
  const id = Number(c.req.param("id"))
  const used = (await q.get("SELECT 1 FROM tree_measurements WHERE photos LIKE ?", `%${id}%`))
  const e = used ? (await q.get("SELECT * FROM evidence WHERE id = ?", id)) : null
  if (!e) throw bad("Tidak ditemukan", 404)
  return new Response(Bun.file(new URL("../../data/uploads/" + e.path, import.meta.url).pathname), { headers: { "Content-Type": e.mime } })
})
pub.get("/methodology", async (c) => c.json({
  factors: (await q.all("SELECT code, ext_id, category, name, name_en, activity_unit, gwp_basis, status, value, unit, gas, scope, source, url, version, valid_from, non_national, note FROM emission_factors WHERE active = 1 ORDER BY ext_id")),
  species: (await q.all("SELECT local_name, scientific, equation, a, b, density, growth_default, dbh_min, dbh_max, carbon_fraction, root_ratio, carbon_tree, source FROM species WHERE active = 1")),
  weights: (await weights()),
}))
// ACT-02: survei mobilitas tanpa akun, anonim; satu respons per perangkat per survei
pub.get("/surveys/:token", async (c) => {
  const s = (await q.get("SELECT s.id, s.title, s.status, s.classes, o.name AS org_name, o.school_days_per_week FROM mobility_surveys s JOIN organizations o ON o.id = s.org_id WHERE token = ?", c.req.param("token")))
  if (!s) throw bad("Survei tidak ditemukan", 404)
  return c.json({ ...s, classes: Object.keys(json(s.classes, {})) })
})
pub.post("/surveys/:token", async (c) => {
  const s = (await q.get("SELECT * FROM mobility_surveys WHERE token = ?", c.req.param("token")))
  if (!s || s.status !== "aktif") throw bad("Survei tidak aktif", 409)
  const b = await c.req.json()
  if (!MODE_FACTOR[b.mode]) throw bad("Moda tidak dikenal")
  const d = Number(b.distance_km)
  if (!(d >= 0)) throw bad("Jarak tidak valid")
  if (d > 50 && !b.confirm_far) throw bad("Jarak > 50 km — mohon konfirmasi", 422)
  const device = sha256(`${s.id}:${b.device_id ?? c.req.header("user-agent")}`)
  try {
    (await q.run("INSERT INTO mobility_responses(survey_id, class_name, role, mode, distance_km, escort, occupants, days_per_week, device_hash, flags) VALUES (?,?,?,?,?,?,?,?,?,?)",
      s.id, b.class_name ?? null, b.role ?? "siswa", b.mode, d, b.escort === 2 ? 2 : 1, Math.max(Number(b.occupants ?? 1), 1), Math.min(Math.max(Number(b.days_per_week ?? 6), 1), 7), device, JSON.stringify(d > 50 ? ["Jarak > 50 km"] : [])))
  } catch {
    throw bad("Perangkat ini sudah mengisi survei", 409)
  }
  ;(await markDirty(s.org_id))
  return c.json({ ok: true })
})
// QR keaslian rapor
pub.get("/reports/:hash", async (c) => {
  const r = (await q.get("SELECT r.id, r.kind, r.period_label, r.status, r.baseline_version, r.fe_version, r.published_at, r.hash, o.name AS org_name FROM reports r JOIN organizations o ON o.id = r.org_id WHERE hash = ?", c.req.param("hash")))
  if (!r) return c.json({ valid: false })
  return c.json({ valid: r.status === "terkunci", ...r })
})
export { SOURCE_META, DEFAULT_SPECIES, rolesInOrg }
