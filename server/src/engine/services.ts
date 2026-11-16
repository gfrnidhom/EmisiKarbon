// Layanan turunan: baseline, kelengkapan, tugas pemantauan, verifikasi otomatis, job harian.
import { q, json, getSetting, type Row } from "../db"
import { addDays, addWorkingDays, daysBetween, monthOf, sha256, todayWIB, orgApprovers, notify } from "../lib"
import { COMPLETENESS_WEIGHTS, REQUIRED_COMPONENTS, SOURCE_META } from "./factors"
import * as C from "./calc"
import { computeDay, computeRange, feVersionSet, loadContext, loadTrees, treeStock, type DayResult } from "./engine"

export const weights = async () => (await getSetting("completeness_weights", COMPLETENESS_WEIGHTS))
export const anomalyMultiplier = async () => (await getSetting("anomaly_kwh_multiplier", 2))
export const SLA_DAYS = async () => (await getSetting("sla_days", { rutin: 7, prioritas: 3, baseline: 14, perbaikan: 10 }))

export function populationOf(org: Row) {
  return (org.students ?? 0) + (org.teachers ?? 0) + (org.staff ?? 0)
}

/** Status kelengkapan tiap komponen baseline (BASE-04). */
export async function baselineCompleteness(orgId: number, start: string, end: string) {
  const org = (await q.get("SELECT * FROM organizations WHERE id = ?", orgId))!
  const none: string[] = json(org.none_sources, [])
  const months = monthsBetween(start, end)
  const recs = (await q.all("SELECT source, period, evidence_ids, method, status FROM activity_records WHERE org_id = ? AND superseded = 0 AND period BETWEEN ? AND ?", orgId, monthOf(start), monthOf(end)))
  const bySrc = (s: string) => recs.filter((r) => r.source === s)
  const withEvidence = (s: string) => bySrc(s).filter((r) => json(r.evidence_ids, []).length > 0 || r.method !== "aktual")
  const sessions = (await q.all("SELECT s.*, (SELECT COUNT(DISTINCT date) FROM waste_weighings w WHERE w.session_id = s.id) AS ndays FROM waste_sessions s WHERE org_id = ? AND kind = 'baseline'", orgId))
  const surveys = (await q.all("SELECT s.id, (SELECT COALESCE(SUM(count),0) FROM mobility_responses r WHERE r.survey_id = s.id) AS n FROM mobility_surveys s WHERE org_id = ?", orgId))
  const nResp = Math.max(0, ...surveys.map((s) => s.n))
  const pop = populationOf(org)
  const trees = (await q.get<{ n: number }>("SELECT COUNT(DISTINCT a.id) AS n FROM assets a JOIN tree_measurements m ON m.asset_id = a.id WHERE a.org_id = ? AND a.type = 'pohon'", orgId))!.n
  const acUnits = (await q.get<{ n: number }>("SELECT COUNT(*) AS n FROM assets WHERE org_id = ? AND type = 'ac'", orgId))!.n
  const comp: Record<string, { filled: boolean; detail: string; progress: number }> = {
    listrik: { filled: withEvidence("listrik").length >= Math.min(3, months.length), detail: `${bySrc("listrik").length}/${months.length} bulan, ${withEvidence("listrik").length} dengan bukti`, progress: bySrc("listrik").length / months.length },
    mobilitas: { filled: nResp > 0, detail: `${nResp} respons dari ${pop} warga (${pop ? Math.round((nResp / pop) * 100) : 0}%)`, progress: pop ? Math.min(nResp / pop / 0.7, 1) : 0 },
    sampah: { filled: sessions.some((s) => s.ndays >= 8), detail: sessions.length ? `Sesi baseline ${Math.max(...sessions.map((s) => s.ndays))}/8 hari` : "Belum ada sesi penimbangan", progress: sessions.length ? Math.min(Math.max(...sessions.map((s) => s.ndays)) / 8, 1) : 0 },
    pohon: { filled: trees > 0 || none.includes("pohon"), detail: `${trees} pohon terukur (sensus t₀)`, progress: trees > 0 ? 1 : 0 },
    lpg: optional("lpg"),
    ac: { filled: acUnits > 0 || bySrc("ac").length > 0 || none.includes("ac"), detail: none.includes("ac") ? "Tidak ada AC" : `${acUnits} unit AC terdata`, progress: acUnits > 0 || none.includes("ac") ? 1 : 0 },
    genset: optional("genset"),
    air_limbah: { filled: !!org.sanitation, detail: `Sanitasi: ${org.sanitation ?? "-"}`, progress: org.sanitation ? 1 : 0 },
    kertas: optional("kertas"),
  }
  const profil = { filled: pop > 0 && org.building_m2 > 0, detail: `${pop} warga, bangunan ${org.building_m2} m²`, progress: pop > 0 && org.building_m2 > 0 ? 1 : 0 }
  const w = (await weights())
  const score = C.completenessScore(Object.fromEntries(Object.entries(comp).map(([k, v]) => [k, v.filled])), w)
  const missingRequired = REQUIRED_COMPONENTS.filter((k) => !(k === "profil" ? profil.filled : comp[k]?.filled))
  return { components: comp, profil, score, missingRequired, weights: w, months: months.length }

  function optional(s: string) {
    const n = bySrc(s).length
    return { filled: n > 0 || none.includes(s), detail: none.includes(s) ? "Tidak dipakai lembaga" : `${n}/${months.length} bulan`, progress: none.includes(s) ? 1 : n / months.length }
  }
}

export function monthsBetween(start: string, end: string) {
  const out: string[] = []
  for (let m = monthOf(start); m <= monthOf(end); m = monthOf(addDays(m + "-28", 7))) out.push(m)
  return out
}

/** Hitung komponen baseline (BASE-04/§4.5) dan simpan. */
export async function recomputeBaseline(baselineId: number) {
  const b = (await q.get("SELECT * FROM baselines WHERE id = ?", baselineId))!
  if (b.status === "terkunci") return b
  const ctx = (await loadContext(b.org_id, { baselineMode: true }))
  const days = (await computeRange(b.org_id, b.period_start, b.period_end, ctx))
  const comps = aggregateComponents(days)
  ;(await q.run("DELETE FROM baseline_components WHERE baseline_id = ?", baselineId))
  let total = 0, estimate = 0
  for (const [src, c] of Object.entries(comps)) {
    total += c.total
    estimate += c.estimateKg
    ;(await q.run("INSERT INTO baseline_components(baseline_id, source, total_kg, daily_active_kg, daily_holiday_kg, method, detail) VALUES (?,?,?,?,?,?,?)",
      baselineId, src, c.total, c.activeAvg, c.holidayAvg, c.method, JSON.stringify({ labels: c.labels, activeDays: c.activeDays, holidayDays: c.holidayDays })))
  }
  const comp = (await baselineCompleteness(b.org_id, b.period_start, b.period_end))
  const pop = populationOf(ctx.org)
  const trees = treeStock((await loadTrees(b.org_id)), b.period_end)
  const summary = {
    total, perPersonYear: pop ? (total / days.length) * 365 / pop : 0, perM2Year: ctx.org.building_m2 ? (total / days.length) * 365 / ctx.org.building_m2 : 0,
    activeDays: days.filter((d) => d.k > 0).length, days: days.length, treeStock: trees.stock, treeCount: trees.count,
    completeness: comp,
  }
  ;(await q.run("UPDATE baselines SET completeness = ?, estimate_share = ?, population = ?, fe_version = ?, summary = ?, updated_at = datetime('now') WHERE id = ?",
    comp.score, total ? estimate / total : 0, pop, feVersionSet(ctx.fe), JSON.stringify(summary), baselineId))
  return (await q.get("SELECT * FROM baselines WHERE id = ?", baselineId))!
}

export function aggregateComponents(days: DayResult[]) {
  const out: Record<string, { total: number; activeAvg: number; holidayAvg: number; method: string; labels: Record<string, number>; estimateKg: number; activeDays: number; holidayDays: number }> = {}
  const act = days.filter((d) => d.k > 0), hol = days.filter((d) => d.k === 0)
  const sources = new Set(days.flatMap((d) => Object.keys(d.sources)))
  for (const src of sources) {
    const labels: Record<string, number> = {}
    let total = 0, aSum = 0, hSum = 0
    for (const d of days) {
      const s = d.sources[src]
      if (!s) continue
      total += s.kg
      labels[s.label] = (labels[s.label] ?? 0) + s.kg
      if (d.k > 0) aSum += s.kg
      else hSum += s.kg
    }
    const method = Object.entries(labels).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "kosong"
    out[src] = {
      total, activeAvg: act.length ? aSum / act.length : 0, holidayAvg: hol.length ? hSum / hol.length : 0, method, labels,
      estimateKg: (labels.estimasi ?? 0), activeDays: act.length, holidayDays: hol.length,
    }
  }
  return out
}

export async function baselineHash(baselineId: number) {
  const b = (await q.get("SELECT * FROM baselines WHERE id = ?", baselineId))!
  const comps = (await q.all("SELECT source, total_kg, daily_active_kg, daily_holiday_kg, method FROM baseline_components WHERE baseline_id = ? ORDER BY source", baselineId))
  const recs = (await q.all("SELECT id, source, period, quantity, revision FROM activity_records WHERE org_id = ? AND superseded = 0 AND period BETWEEN ? AND ? ORDER BY id", b.org_id, monthOf(b.period_start), monthOf(b.period_end)))
  return sha256(JSON.stringify({ b: [b.org_id, b.period_start, b.period_end, b.fe_version], comps, recs }))
}

// ---------------- validasi otomatis & antrian verifikasi (§5.3, VER-01) ----------------
export async function validateActivity(rec: Row): Promise<{ flags: string[]; priority: "tinggi" | "normal" }> {
  const flags: string[] = []
  if (rec.source === "listrik") {
    const sameMonth = (await q.all<{ quantity: number }>(
      "SELECT quantity FROM activity_records WHERE org_id = ? AND source = 'listrik' AND superseded = 0 AND substr(period,6,2) = ? AND id != ? AND period < ?",
      rec.org_id, rec.period.slice(5, 7), rec.id, rec.period))
    const all = (await q.all<{ quantity: number }>("SELECT quantity FROM activity_records WHERE org_id = ? AND source = 'listrik' AND superseded = 0 AND id != ?", rec.org_id, rec.id)).map((r) => r.quantity).sort((a, b) => a - b)
    const ref = sameMonth.length ? sameMonth.reduce((s, r) => s + r.quantity, 0) / sameMonth.length : all.length ? all[Math.floor(all.length / 2)] : 0
    if (ref > 0 && rec.quantity > (await anomalyMultiplier()) * ref) flags.push(`Anomali: ${rec.quantity} kWh > ${(await anomalyMultiplier())}× acuan ${Math.round(ref)} kWh`)
  }
  if (json(rec.evidence_ids, []).length === 0 && rec.method === "aktual") flags.push("Tanpa bukti")
  return { flags, priority: flags.some((f) => f.startsWith("Anomali")) ? "tinggi" : "normal" }
}

export async function createTask(orgId: number, objectType: string, objectId: number, title: string, priority: "tinggi" | "normal", reason?: string) {
  const sla = (await SLA_DAYS())
  const days = objectType === "baseline" ? sla.baseline : priority === "tinggi" ? sla.prioritas : sla.rutin
  const approvers = (await orgApprovers(orgId, objectType))
  ;(await q.run("UPDATE verification_tasks SET status = 'dibatalkan' WHERE object_type = ? AND object_id = ? AND status = 'terbuka'", objectType, objectId))
  const r = (await q.run("INSERT INTO verification_tasks(org_id, object_type, object_id, title, priority, reason, verifier_id, due_at) VALUES (?,?,?,?,?,?,?,?)",
    orgId, objectType, objectId, title, priority, reason ?? null, approvers[0] ?? null, addWorkingDays(todayWIB(), days)))
  const tk = (await q.get<{ uuid: string }>("SELECT uuid FROM verification_tasks WHERE id = ?", Number(r.lastInsertRowid)))
  if (approvers.length) (await notify(approvers, "Menunggu persetujuan", title, `/approvals/${tk?.uuid ?? r.lastInsertRowid}`))
  return Number(r.lastInsertRowid)
}

// ---------------- daftar tugas pemantauan (ENG-11, §14) ----------------
export async function monitoringTasks(orgId: number) {
  const today = todayWIB()
  const tasks: { kind: string; title: string; due: string; status: "jatuh_tempo" | "terlambat" | "akan_datang"; link: string; detail?: string }[] = []
  const st = (due: string) => (today > due ? "terlambat" : daysBetween(today, due) <= 3 ? "jatuh_tempo" : "akan_datang") as any
  // tagihan bulan lalu: tanggal 10
  const lastMonth = monthOf(addDays(today.slice(0, 7) + "-01", -1))
  const org = (await q.get("SELECT none_sources FROM organizations WHERE id = ?", orgId))
  const none: string[] = json(org?.none_sources, [])
  for (const src of ["listrik", "lpg", "genset", "kertas"]) {
    if (none.includes(src)) continue
    const has = (await q.get("SELECT 1 FROM activity_records WHERE org_id = ? AND source = ? AND period = ? AND superseded = 0", orgId, src, lastMonth))
    if (!has) tasks.push({ kind: "input", title: `Input ${SOURCE_META[src].label} ${lastMonth}`, due: `${today.slice(0, 7)}-10`, status: st(`${today.slice(0, 7)}-10`), link: "/app/input", detail: "Bulan itu tetap Proyeksi sampai diinput" })
  }
  // penimbangan sampah minggu ke-2 tiap bulan
  const lastSession = (await q.get("SELECT * FROM waste_sessions WHERE org_id = ? ORDER BY start_date DESC LIMIT 1", orgId))
  if (!lastSession || monthOf(lastSession.start_date) < today.slice(0, 7)) {
    const due = `${today.slice(0, 7)}-08`
    tasks.push({ kind: "sampah", title: "Penimbangan sampah 5 hari", due, status: st(due), link: "/app/waste", detail: lastSession ? `Sesi terakhir ${lastSession.start_date}` : "Belum ada sesi" })
  }
  // ukur ulang pohon 6 bulan
  const trees = (await q.all("SELECT a.id, a.code, MAX(m.date) AS last FROM assets a JOIN tree_measurements m ON m.asset_id = a.id AND m.measurer_role = 'operator' WHERE a.org_id = ? AND a.type = 'pohon' AND a.status = 'hidup' GROUP BY a.id", orgId))
  const due = trees.filter((t) => daysBetween(t.last, today) >= 180 - 14)
  if (due.length) {
    const earliest = due.map((t) => addDays(t.last, 182)).sort()[0]
    const stopped = due.filter((t) => daysBetween(t.last, today) > 365).length
    tasks.push({ kind: "pohon", title: `Ukur ulang ${due.length} pohon`, due: earliest, status: st(earliest), link: "/app/trees?filter=due", detail: stopped ? `${stopped} pohon > 12 bulan: proyeksi berhenti` : undefined })
  }
  // survei mobilitas tiap semester
  const lastSurvey = (await q.get("SELECT * FROM mobility_surveys WHERE org_id = ? ORDER BY created_at DESC LIMIT 1", orgId))
  const semStart = Number(today.slice(5, 7)) >= 7 ? `${today.slice(0, 4)}-07-15` : `${today.slice(0, 4)}-01-05`
  if (!lastSurvey || lastSurvey.created_at.slice(0, 10) < addDays(semStart, -30)) tasks.push({ kind: "mobilitas", title: "Survei mobilitas semester ini", due: addDays(semStart, 30), status: st(addDays(semStart, 30)), link: "/app/mobility" })
  // data dikembalikan
  const returned = (await q.all("SELECT id, source, period FROM activity_records WHERE org_id = ? AND status = 'perlu_perbaikan' AND superseded = 0", orgId))
  for (const r of returned) tasks.push({ kind: "perbaikan", title: `Perbaiki ${SOURCE_META[r.source]?.label ?? r.source} ${r.period}`, due: today, status: "jatuh_tempo", link: "/app/input" })
  const bl = (await q.get("SELECT * FROM baselines WHERE org_id = ? ORDER BY version DESC LIMIT 1", orgId))
  if (bl?.status === "perlu_perbaikan") tasks.push({ kind: "perbaikan", title: "Perbaiki Survei Awal sesuai catatan Admin", due: today, status: "jatuh_tempo", link: "/app/baseline" })
  return tasks.sort((a, b) => a.due.localeCompare(b.due))
}

// ---------------- job harian 00.30 WIB (CALC-02) ----------------
export async function runDailyJob(_date?: string) {
  // Tutup buku: simpan hari kemarin + catch-up hari terlewat + hitung ulang hari terbuka yang punya data baru
  const { runClosing } = await import("./ledger")
  const r = await runClosing()
  ;(await q.run("INSERT INTO settings(key, value) VALUES ('last_daily_job', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", JSON.stringify({ ...r, at: new Date().toISOString() })))
  return { ...r, orgs: (await q.all("SELECT id FROM organizations")).length }
}

/** Eskalasi SLA (VER-07) */
export async function runSlaEscalation() {
  const today = todayWIB()
  const late = (await q.all("SELECT * FROM verification_tasks WHERE status = 'terbuka' AND due_at < ? AND (note IS NULL OR note NOT LIKE '%[eskalasi]%')", today))
  for (const t of late) {
    // lewat tenggat → admin ikut diberi tahu
    const admins = (await orgApprovers(t.org_id, "baseline"))
    ;(await notify(admins, "Persetujuan melewati tenggat", `${t.title} melewati tenggat ${t.due_at}`, `/approvals/${t.uuid ?? t.id}`))
    ;(await q.run("UPDATE verification_tasks SET note = COALESCE(note,'') || ' [eskalasi]' WHERE id = ?", t.id))
  }
  return late.length
}

/** Migrasi klasifikasi GHG Protocol untuk baseline lama: komponen "sampah" dipecah menjadi
 *  "sampah_lokal" (dikompos/dibakar di sekolah, Scope 1) + "sampah" (ke TPA, Scope 3) secara proporsional.
 *  Total tidak berubah. Baseline terkunci: hash data dihitung ulang & dicatat di log audit. Idempoten. */
export async function splitLegacyWasteComponents() {
  const rows = await q.all<{ id: number }>(`SELECT b.id FROM baselines b WHERE EXISTS (SELECT 1 FROM baseline_components c WHERE c.baseline_id = b.id AND c.source = 'sampah' AND c.total_kg > 0)
    AND NOT EXISTS (SELECT 1 FROM baseline_components c WHERE c.baseline_id = b.id AND c.source = 'sampah_lokal')`)
  const done: { id: number; local: number; landfill: number }[] = []
  for (const { id } of rows) {
    const b = (await q.get("SELECT * FROM baselines WHERE id = ?", id))!
    const ctx = await loadContext(b.org_id, { baselineMode: true })
    const comps = aggregateComponents(await computeRange(b.org_id, b.period_start, b.period_end, ctx))
    const local = comps.sampah_lokal?.total ?? 0, tpa = comps.sampah?.total ?? 0
    if (local <= 0 || local + tpa <= 0) continue
    const share = local / (local + tpa)
    const old = (await q.get("SELECT * FROM baseline_components WHERE baseline_id = ? AND source = 'sampah'", id))!
    const oldHash = b.data_hash
    await q.run("INSERT INTO baseline_components(baseline_id, source, total_kg, daily_active_kg, daily_holiday_kg, method, detail) VALUES (?,?,?,?,?,?,?)",
      id, "sampah_lokal", old.total_kg * share, old.daily_active_kg * share, old.daily_holiday_kg * share, old.method, old.detail)
    await q.run("UPDATE baseline_components SET total_kg = ?, daily_active_kg = ?, daily_holiday_kg = ? WHERE id = ?",
      old.total_kg * (1 - share), old.daily_active_kg * (1 - share), old.daily_holiday_kg * (1 - share), old.id)
    let newHash: string | null = null
    if (b.status === "terkunci") { newHash = await baselineHash(id); await q.run("UPDATE baselines SET data_hash = ? WHERE id = ?", newHash, id) }
    await q.run("INSERT INTO audit_log(actor_id, action, object_type, object_id, before, after) VALUES (NULL, 'reclassify', 'baseline', ?, ?, ?)",
      String(id), JSON.stringify({ sampah_kg: old.total_kg, data_hash: oldHash }),
      JSON.stringify({ sampah_kg: old.total_kg * (1 - share), sampah_lokal_kg: old.total_kg * share, data_hash: newHash ?? oldHash, alasan: "GHG Protocol: sampah diolah di sekolah = Scope 1" }))
    done.push({ id, local: old.total_kg * share, landfill: old.total_kg * (1 - share) })
  }
  return done
}
