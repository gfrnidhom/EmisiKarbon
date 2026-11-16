/**
 * Ubah & hapus data operasional — sesuai peran:
 *   Admin    : semua lembaga
 *   Operator : hanya lembaganya
 *   Kepsek   : lihat saja (semua endpoint di sini menolak)
 *   Petugas  : tidak boleh menghapus (mengubah lewat aplikasi petugas sebelum disahkan)
 * Data yang sudah tutup buku (lewat tgl 15 bulan berikutnya) atau termasuk Survei Awal terkunci tidak dapat diubah/dihapus.
 * Setiap perubahan dicatat di log audit dan memicu hitung ulang engine (markDirty).
 */
import { Hono } from "hono"
import { q } from "../db"
import { assertOrgRole, audit, bad, hasRole, requireAuth, requireRole, rowId } from "../lib"
import { isLocked, markDirty } from "../engine/ledger"

export const crud = new Hono()
crud.use("*", requireAuth)

const MANAGE = ["operator", "admin"] as const

/** Tolak bila tanggal/bulan sudah tutup buku atau bagian Survei Awal yang terkunci. */
async function assertEditable(orgId: number, dateOrMonth: string | null | undefined, what = "Data") {
  if (!dateOrMonth) return
  const d = dateOrMonth.length === 7 ? `${dateOrMonth}-01` : dateOrMonth.slice(0, 10)
  if (isLocked(d)) throw bad(`${what} bulan ${d.slice(0, 7)} sudah tutup buku (lewat tanggal 15 bulan berikutnya) dan tidak dapat diubah/dihapus`, 409)
  const bl = await q.get("SELECT 1 FROM baselines WHERE org_id = ? AND status = 'terkunci' AND ? BETWEEN substr(period_start,1,7) AND substr(period_end,1,7)", orgId, d.slice(0, 7))
  if (bl) throw bad(`${what} ini bagian Survei Awal yang sudah dikunci Admin`, 409)
}

// ---------------- data bulanan (aktivitas) ----------------
crud.delete("/orgs/:orgId/activities/:id", async (c) => {
  const orgId = Number(c.req.param("orgId"))
  await assertOrgRole(c, orgId, ...MANAGE)
  const r = await q.get("SELECT * FROM activity_records WHERE id = ? AND org_id = ?", Number(c.req.param("id")), orgId)
  if (!r) throw bad("Data tidak ditemukan", 404)
  if (r.status === "terkunci") throw bad("Data terkunci (bagian rapor/Survei Awal)", 409)
  await assertEditable(orgId, r.period)
  await q.run("UPDATE verification_tasks SET status = 'dibatalkan' WHERE object_type = 'activity' AND object_id = ? AND status = 'terbuka'", r.id)
  await q.run("DELETE FROM activity_records WHERE id = ?", r.id)
  // revisi dihapus → revisi sebelumnya aktif kembali
  if (r.parent_id) await q.run("UPDATE activity_records SET superseded = 0 WHERE id = ?", r.parent_id)
  await audit(c, "delete", "activity", r.id, r, null)
  await markDirty(orgId)
  return c.json({ ok: true, restored: r.parent_id ?? null })
})

// ---------------- aset (pohon, biopori, AC, …) ----------------
crud.delete("/assets/:id", async (c) => {
  const a = await q.get("SELECT * FROM assets WHERE id = ?", await rowId("assets", c.req.param("id")))
  if (!a) throw bad("Aset tidak ditemukan", 404)
  await assertOrgRole(c, a.org_id, ...MANAGE)
  const first = await q.get<{ d: string | null }>("SELECT MIN(date) AS d FROM tree_measurements WHERE asset_id = ?", a.id)
  if (first?.d) await assertEditable(a.org_id, first.d, "Pengukuran aset")
  await q.run("DELETE FROM tree_measurements WHERE asset_id = ?", a.id)
  await q.run("DELETE FROM env_records WHERE asset_id = ?", a.id)
  await q.run("DELETE FROM assets WHERE id = ?", a.id)
  await audit(c, "delete", "asset", a.id, a, null)
  await markDirty(a.org_id)
  return c.json({ ok: true })
})

// ---------------- pengukuran pohon ----------------
async function measurement(id: string) {
  const m = await q.get("SELECT m.*, a.org_id FROM tree_measurements m JOIN assets a ON a.id = m.asset_id WHERE m.id = ?", Number(id))
  if (!m) throw bad("Pengukuran tidak ditemukan", 404)
  return m
}
crud.patch("/measurements/:id", async (c) => {
  const m = await measurement(c.req.param("id"))
  await assertOrgRole(c, m.org_id, ...MANAGE)
  await assertEditable(m.org_id, m.date, "Pengukuran")
  const b = await c.req.json()
  if (b.date) await assertEditable(m.org_id, b.date, "Pengukuran")
  if ("dbh" in b && !(Number(b.dbh) > 0)) throw bad("DBH harus lebih dari 0")
  for (const k of ["date", "dbh", "height", "condition"]) if (k in b) await q.run(`UPDATE tree_measurements SET ${k} = ? WHERE id = ?`, b[k] === "" ? null : b[k], m.id)
  await audit(c, "update", "measurement", m.id, m, b)
  await markDirty(m.org_id)
  return c.json({ ok: true })
})
crud.delete("/measurements/:id", async (c) => {
  const m = await measurement(c.req.param("id"))
  await assertOrgRole(c, m.org_id, ...MANAGE)
  await assertEditable(m.org_id, m.date, "Pengukuran")
  await q.run("DELETE FROM tree_measurements WHERE id = ?", m.id)
  await audit(c, "delete", "measurement", m.id, m, null)
  await markDirty(m.org_id)
  return c.json({ ok: true })
})

// ---------------- penimbangan sampah ----------------
/** Hitung ulang status sesi setelah timbangan dihapus/diubah: hari terisi < target → kembali "berjalan" (tombol Catat timbangan muncul lagi). */
async function refreshSession(sessionId: number) {
  const s = await q.get("SELECT days FROM waste_sessions WHERE id = ?", sessionId)
  if (!s) return
  const n = Number((await q.get<{ n: number }>("SELECT COUNT(DISTINCT date) AS n FROM waste_weighings WHERE session_id = ?", sessionId))?.n ?? 0)
  const last = (await q.get<{ d: string | null }>("SELECT MAX(date) AS d FROM waste_weighings WHERE session_id = ?", sessionId))?.d ?? null
  await q.run("UPDATE waste_sessions SET status = ?, end_date = ? WHERE id = ?", n >= s.days ? "selesai" : "berjalan", last, sessionId)
}
crud.delete("/waste/sessions/:id", async (c) => {
  const s = await q.get("SELECT * FROM waste_sessions WHERE id = ?", await rowId("waste_sessions", c.req.param("id")))
  if (!s) throw bad("Sesi tidak ditemukan", 404)
  await assertOrgRole(c, s.org_id, ...MANAGE)
  await assertEditable(s.org_id, s.start_date, "Sesi timbang")
  await q.run("DELETE FROM waste_weighings WHERE session_id = ?", s.id)
  await q.run("DELETE FROM waste_sessions WHERE id = ?", s.id)
  await audit(c, "delete", "waste_session", s.id, s, null)
  await markDirty(s.org_id)
  return c.json({ ok: true })
})
async function weighing(id: string) {
  const w = await q.get("SELECT w.*, s.org_id FROM waste_weighings w JOIN waste_sessions s ON s.id = w.session_id WHERE w.id = ?", Number(id))
  if (!w) throw bad("Data timbang tidak ditemukan", 404)
  return w
}
crud.patch("/waste/weighings/:id", async (c) => {
  const w = await weighing(c.req.param("id"))
  await assertOrgRole(c, w.org_id, ...MANAGE)
  await assertEditable(w.org_id, w.date, "Data timbang")
  const b = await c.req.json()
  if (!(Number(b.kg) >= 0)) throw bad("Berat tidak valid")
  await q.run("UPDATE waste_weighings SET kg = ? WHERE id = ?", Number(b.kg), w.id)
  await audit(c, "update", "waste_weighing", w.id, w, b)
  await markDirty(w.org_id)
  return c.json({ ok: true })
})
crud.delete("/waste/weighings/:id", async (c) => {
  const w = await weighing(c.req.param("id"))
  await assertOrgRole(c, w.org_id, ...MANAGE)
  await assertEditable(w.org_id, w.date, "Data timbang")
  await q.run("DELETE FROM waste_weighings WHERE id = ?", w.id)
  await refreshSession(w.session_id)
  await audit(c, "delete", "waste_weighing", w.id, w, null)
  await markDirty(w.org_id)
  return c.json({ ok: true })
})

// ---------------- survei mobilitas ----------------
crud.delete("/mobility/surveys/:id", async (c) => {
  const s = await q.get("SELECT * FROM mobility_surveys WHERE id = ?", await rowId("mobility_surveys", c.req.param("id")))
  if (!s) throw bad("Survei tidak ditemukan", 404)
  await assertOrgRole(c, s.org_id, ...MANAGE)
  await assertEditable(s.org_id, s.period ?? s.created_at, "Survei")
  await q.run("DELETE FROM mobility_responses WHERE survey_id = ?", s.id)
  await q.run("DELETE FROM mobility_surveys WHERE id = ?", s.id)
  await audit(c, "delete", "mobility_survey", s.id, s, null)
  await markDirty(s.org_id)
  return c.json({ ok: true })
})
crud.delete("/mobility/responses/:id", async (c) => {
  const r = await q.get("SELECT r.*, s.org_id, s.period, s.created_at AS survey_at FROM mobility_responses r JOIN mobility_surveys s ON s.id = r.survey_id WHERE r.id = ?", Number(c.req.param("id")))
  if (!r) throw bad("Jawaban tidak ditemukan", 404)
  await assertOrgRole(c, r.org_id, ...MANAGE)
  await assertEditable(r.org_id, r.period ?? r.survey_at, "Survei")
  await q.run("DELETE FROM mobility_responses WHERE id = ?", r.id)
  await audit(c, "delete", "mobility_response", r.id, r, null)
  await markDirty(r.org_id)
  return c.json({ ok: true })
})

// ---------------- sensor IoT ----------------
crud.delete("/iot/:id", async (c) => {
  const d = await q.get("SELECT * FROM iot_devices WHERE id = ?", await rowId("iot_devices", c.req.param("id")))
  if (!d) throw bad("Perangkat tidak ditemukan", 404)
  await assertOrgRole(c, d.org_id, ...MANAGE)
  const first = await q.get<{ at: string | null }>("SELECT MIN(at) AS at FROM iot_readings WHERE device_id = ?", d.id)
  if (first?.at) await assertEditable(d.org_id, first.at, "Bacaan sensor")
  await q.run("DELETE FROM iot_readings WHERE device_id = ?", d.id)
  await q.run("DELETE FROM iot_heartbeats WHERE device_id = ?", d.id)
  await q.run("DELETE FROM iot_devices WHERE id = ?", d.id)
  await audit(c, "delete", "iot_device", d.id, { ...d, token: undefined }, null)
  await markDirty(d.org_id)
  return c.json({ ok: true })
})

// ---------------- undangan ----------------
crud.delete("/admin/invitations/:id", async (c) => {
  const inv = await q.get("SELECT * FROM invitations WHERE id = ?", Number(c.req.param("id")))
  if (!inv) throw bad("Undangan tidak ditemukan", 404)
  if (inv.accepted_at) throw bad("Undangan sudah diterima — cabut perannya lewat daftar pengguna", 409)
  if (!hasRole(c.get("user"), "admin")) {
    if (!inv.org_id || inv.role === "admin") throw bad("Hanya admin yang dapat membatalkan undangan ini", 403)
    await assertOrgRole(c, inv.org_id, "operator")
  }
  await q.run("DELETE FROM invitations WHERE id = ?", inv.id)
  await audit(c, "revoke_invite", "invitation", inv.id, { ...inv, token: undefined }, null)
  return c.json({ ok: true })
})

// ---------------- jenis pohon (admin) ----------------
crud.delete("/admin/species/:id", requireRole("admin"), async (c) => {
  const id = Number(c.req.param("id"))
  const sp = await q.get("SELECT * FROM species WHERE id = ?", id)
  if (!sp) throw bad("Jenis tidak ditemukan", 404)
  const used = await q.get<{ n: number }>("SELECT COUNT(*) AS n FROM assets WHERE species_id = ?", id)
  if (used && Number(used.n) > 0) throw bad(`Dipakai ${used.n} pohon — nonaktifkan saja agar perhitungan lama tetap utuh`, 409)
  await q.run("DELETE FROM species WHERE id = ?", id)
  await audit(c, "delete", "species", id, sp, null)
  return c.json({ ok: true })
})

// hapus seluruh timbangan satu hari dalam sesi
crud.delete("/waste/sessions/:id/days/:date", async (c) => {
  const s = await q.get("SELECT * FROM waste_sessions WHERE id = ?", await rowId("waste_sessions", c.req.param("id")))
  if (!s) throw bad("Sesi tidak ditemukan", 404)
  await assertOrgRole(c, s.org_id, ...MANAGE)
  const date = c.req.param("date")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw bad("Tanggal tidak valid")
  await assertEditable(s.org_id, date, "Data timbang")
  const before = await q.all("SELECT * FROM waste_weighings WHERE session_id = ? AND date = ?", s.id, date)
  await q.run("DELETE FROM waste_weighings WHERE session_id = ? AND date = ?", s.id, date)
  await refreshSession(s.id)
  await audit(c, "delete", "waste_day", `${s.id}:${date}`, before, null)
  await markDirty(s.org_id)
  return c.json({ ok: true })
})

// daftar undangan yang belum diterima (admin: semua; operator: lembaganya)
crud.get("/admin/invitations", async (c) => {
  const u = c.get("user")
  const org = c.req.query("org") ? Number(c.req.query("org")) : null
  if (!hasRole(u, "admin")) {
    if (!org) throw bad("Pilih lembaga", 403)
    await assertOrgRole(c, org, "operator", "kepsek")
  }
  const rows = await q.all(`SELECT i.id, i.email, i.role, i.org_id, i.expires_at, o.name AS org_name, x.name AS invited_by_name
    FROM invitations i LEFT JOIN organizations o ON o.id = i.org_id LEFT JOIN users x ON x.id = i.invited_by
    WHERE i.accepted_at IS NULL ${org ? "AND i.org_id = ?" : ""} ORDER BY i.id DESC`, ...(org ? [org] : []))
  return c.json(rows)
})

// Lampirkan bukti (foto/PDF tagihan) ke data bulanan yang sudah ada — tanpa membuat revisi baru.
// Dipakai tabel Survei Awal dan Input Berkala. Petugas boleh (bukti bagian dari isian).
crud.post("/orgs/:orgId/activities/:id/evidence", async (c) => {
  const orgId = Number(c.req.param("orgId"))
  await assertOrgRole(c, orgId, "operator", "petugas", "admin")
  const r = await q.get("SELECT * FROM activity_records WHERE id = ? AND org_id = ?", Number(c.req.param("id")), orgId)
  if (!r) throw bad("Data tidak ditemukan", 404)
  if (r.status === "terkunci") throw bad("Data terkunci (bagian rapor/Survei Awal)", 409)
  const bl = await q.get("SELECT status FROM baselines WHERE org_id = ? AND ? BETWEEN substr(period_start,1,7) AND substr(period_end,1,7) ORDER BY version DESC LIMIT 1", orgId, r.period)
  if (bl) { if (!["draf", "perlu_perbaikan"].includes(bl.status)) throw bad("Survei Awal sedang diproses/terkunci — bukti tidak dapat diubah", 409) }
  else await assertEditable(orgId, r.period)
  const { add = [], remove = [] } = await c.req.json<{ add?: number[]; remove?: number[] }>()
  const valid: number[] = []
  for (const e of add.map(Number)) if (await q.get("SELECT 1 FROM evidence WHERE id = ? AND org_id = ?", e, orgId)) valid.push(e)
  const cur: number[] = JSON.parse(r.evidence_ids || "[]")
  const next = [...new Set([...cur.filter((x) => !remove.map(Number).includes(x)), ...valid])]
  await q.run("UPDATE activity_records SET evidence_ids = ? WHERE id = ?", JSON.stringify(next), r.id)
  await audit(c, "evidence", "activity", r.id, { evidence_ids: cur }, { evidence_ids: next })
  return c.json({ ok: true, evidence_ids: next })
})
