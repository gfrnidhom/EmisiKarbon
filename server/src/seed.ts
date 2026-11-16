// Data pilot: SMPN 1 Ngasem & SMPN 2 Purwosari (Kab. Bojonegoro). Angka ilustrasi berbasis "Perhitungan Emisi Karbon.xlsx".
import { mkdirSync } from "fs"
import { transaction, q } from "./db"
import { DEFAULT_SPECIES, FE_VERSION } from "./engine/factors"
import { FULL_CATALOG } from "./engine/catalog"
import { addDays, monthOf, qrSign, sha256, todayWIB } from "./lib"
import { recomputeBaseline, baselineHash, createTask } from "./engine/services"
import { drawSample } from "./routes/workflow"

const UPLOAD = new URL("../data/uploads/", import.meta.url).pathname
mkdirSync(UPLOAD, { recursive: true })
let seed = 20261113
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }
const pick = <T,>(arr: [T, number][]) => { let r = rnd() * arr.reduce((s, [, w]) => s + w, 0); for (const [v, w] of arr) { if ((r -= w) <= 0) return v } return arr[0][0] }
const jitter = (v: number, pct: number) => v * (1 + (rnd() * 2 - 1) * pct)
const id = (r: { lastInsertRowid: number | bigint }) => Number(r.lastInsertRowid)

await transaction(async () => {
  // ---------- wilayah, faktor, jenis pohon ----------
  ;(await q.run("INSERT INTO regions(code, name, grid_code) VALUES ('35.22', 'Kabupaten Bojonegoro', 'EL_JAMALI')"))
  for (const f of FULL_CATALOG)
    (await q.run("INSERT INTO emission_factors(code, ext_id, category, name, name_en, activity_unit, gwp_basis, status, value, unit, gas, scope, source, url, version, valid_from, active, non_national, note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)",
      f.code, f.extId, f.category, f.name, f.nameEn, f.activityUnit, f.gwpBasis, f.status, f.value, f.unit, f.gas, f.scope, f.source, f.url ?? null, FE_VERSION, "2026-01-01", f.nonNational ? 1 : 0, f.note ?? null))
  for (const s of DEFAULT_SPECIES)
    (await q.run("INSERT INTO species(local_name, scientific, equation, a, b, density, growth_default, dbh_min, dbh_max, carbon_fraction, root_ratio, carbon_tree, source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
      s.local, s.scientific, s.equation, s.a ?? null, s.b ?? null, s.density, s.growth, s.dbhMin, s.dbhMax, s.carbonFraction, s.rootRatio, s.carbonTree ? 1 : 0, s.source))
  const sp = Object.fromEntries((await q.all("SELECT id, local_name FROM species")).map((s) => [s.local_name, s.id]))

  // ---------- lembaga ----------
  const NGS = id((await q.run(`INSERT INTO organizations(region_id, name, short, npsn, jenjang, kecamatan, address, students, teachers, staff, land_m2, building_m2, lat, lng, sanitation, landfill, school_days_per_week, base_load_kwh, none_sources)
    VALUES (1, 'SMPN 1 Ngasem', 'NGS', '20505812', 'SMP', 'Ngasem', 'Jl. Raya Ngasem, Bojonegoro', 600, 38, 7, 12000, 3200, -7.2321, 111.7792, 'septik', 'TPA Banjarsari', 6, 15, '[]')`)))
  const PWS = id((await q.run(`INSERT INTO organizations(region_id, name, short, npsn, jenjang, kecamatan, address, students, teachers, staff, land_m2, building_m2, lat, lng, sanitation, landfill, school_days_per_week, base_load_kwh, none_sources)
    VALUES (1, 'SMPN 2 Purwosari', 'PWS', '20505977', 'SMP', 'Purwosari', 'Jl. Purwosari–Tambakrejo, Bojonegoro', 480, 32, 6, 9500, 2500, -7.2589, 111.6187, 'septik', 'TPA Banjarsari', 6, 12, '["genset"]')`)))

  // ---------- pengguna & peran ----------
  const user = async (email: string, name: string, role: string, org: number | null) => {
    const u = id((await q.run("INSERT INTO users(email, name) VALUES (?, ?)", email, name)))
    ;(await q.run("INSERT INTO role_assignments(user_id, role, org_id) VALUES (?,?,?)", u, role, org))
    return u
  }
  const ADM = (await user("admin@jejakhijau.id", "Admin Platform", "admin", null))
  // Persetujuan: operator meng-ACC data petugas; admin mengesahkan Survei Awal & rapor
  const V1 = ADM, V2 = ADM, PRG = ADM
  const OP1 = (await user("operator@smpn1ngasem.sch.id", "Budi Operator Ngasem", "operator", NGS))
  const KS1 = (await user("kepsek@smpn1ngasem.sch.id", "Hj. Siti Kepala Sekolah", "kepsek", NGS))
  ;(await user("petugas@smpn1ngasem.sch.id", "Dewi Petugas Monitoring", "petugas", NGS))
  const OP2 = (await user("operator@smpn2purwosari.sch.id", "Andi Operator Purwosari", "operator", PWS))
  ;(await user("kepsek@smpn2purwosari.sch.id", "Drs. Hadi Kepala Sekolah", "kepsek", PWS))
  ;(await user("petugas@smpn2purwosari.sch.id", "Rudi Petugas Monitoring", "petugas", PWS))

  // ---------- kalender akademik ----------
  const holidays: [string, string, string][] = [
    ["2025-08-17", "2025-08-17", "HUT RI"], ["2025-09-05", "2025-09-05", "Maulid Nabi"], ["2025-12-22", "2026-01-03", "Libur semester ganjil"],
    ["2026-02-17", "2026-02-17", "Imlek"], ["2026-03-16", "2026-03-28", "Libur Idul Fitri"], ["2026-05-01", "2026-05-01", "Hari Buruh"],
    ["2026-05-14", "2026-05-14", "Kenaikan Isa Almasih"], ["2026-05-27", "2026-05-27", "Idul Adha"], ["2026-06-01", "2026-06-01", "Hari Lahir Pancasila"],
    ["2026-06-22", "2026-07-11", "Libur kenaikan kelas"], ["2026-12-21", "2027-01-02", "Libur semester ganjil"], ["2025-07-01", "2025-07-12", "Libur kenaikan kelas"],
  ]
  for (const org of [NGS, PWS]) {
    for (const [a, b, note] of holidays) for (let d = a; d <= b; d = addDays(d, 1)) (await q.run("INSERT INTO calendar_days(org_id, date, type, note) VALUES (?,?, 'libur', ?) ON CONFLICT(org_id, date) DO UPDATE SET type = excluded.type, note = excluded.note", org, d, note))
    for (const [a, b] of [["2025-12-01", "2025-12-06"], ["2026-06-01", "2026-06-06"], ["2026-12-07", "2026-12-12"]]) for (let d = a; d <= b; d = addDays(d, 1)) (await q.run("INSERT OR IGNORE INTO calendar_days(org_id, date, type, note) VALUES (?,?, 'ujian', 'Penilaian akhir semester')", org, d))
    ;(await q.run("INSERT INTO calendar_days(org_id, date, type, attendance_pct, note) VALUES (?, '2026-08-17', 'khusus', 40, 'Upacara HUT RI (hari libur)') ON CONFLICT(org_id, date) DO UPDATE SET type = excluded.type, attendance_pct = excluded.attendance_pct, note = excluded.note", org))
    ;(await q.run("INSERT INTO calendar_days(org_id, date, type, attendance_pct, note) VALUES (?, '2026-10-28', 'khusus', 70, 'Peringatan Sumpah Pemuda — pulang awal') ON CONFLICT(org_id, date) DO UPDATE SET type = excluded.type, attendance_pct = excluded.attendance_pct, note = excluded.note", org))
  }

  // ---------- bukti tagihan (placeholder SVG) ----------
  const evidence = async (org: number, label: string, by: number, date: string) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300"><rect width="100%" height="100%" fill="#f8fafc"/><rect x="16" y="16" width="448" height="268" rx="12" fill="#fff" stroke="#cbd5e1"/><text x="36" y="60" font-family="sans-serif" font-size="20" font-weight="700" fill="#0f766e">PLN — Rekening Listrik</text><text x="36" y="100" font-family="monospace" font-size="15" fill="#334155">${label}</text><text x="36" y="250" font-family="sans-serif" font-size="12" fill="#94a3b8">Contoh bukti (data pilot ilustrasi) · ${date}</text></svg>`
    const hash = sha256(svg)
    Bun.write(UPLOAD + hash + ".svg", svg)
    return id((await q.run("INSERT INTO evidence(org_id, filename, mime, size, sha256, path, taken_at, uploaded_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)", org, `tagihan-${label.split(" ")[0]}.svg`, "image/svg+xml", svg.length, hash, hash + ".svg", date, by, date)))
  }

  // ---------- data aktivitas bulanan ----------
  const kwhProfile: Record<string, number> = { "07": 0.55, "08": 1.05, "09": 1.08, "10": 1.12, "11": 1.06, "12": 0.7, "01": 0.95, "02": 1.02, "03": 0.68, "04": 1.04, "05": 1.0, "06": 0.75 }
  const months = (a: string, b: string) => { const o: string[] = []; for (let m = a; m <= b; m = monthOf(addDays(m + "-28", 7))) o.push(m); return o }
  const addRec = async (org: number, source: string, period: string, qty: number, unit: string, status: string, by: number, opts: { ev?: number[]; meta?: any; verifier?: number } = {}) =>
    id((await q.run("INSERT INTO activity_records(org_id, source, period, quantity, unit, meta, status, evidence_ids, created_by, submitted_by, verified_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
      org, source, period, Math.round(qty * 10) / 10, unit, JSON.stringify(opts.meta ?? {}), status, JSON.stringify(opts.ev ?? []), by, status === "draf" ? null : by,
      ["terverifikasi", "terkunci"].includes(status) ? opts.verifier ?? null : null, `${period}-12 09:00:00`)))

  for (const m of months("2025-07", "2026-10")) {
    const inBaseline = m <= "2026-06"
    const st = inBaseline ? "terverifikasi" : m <= "2026-09" ? "terverifikasi" : "draf"
    const p = kwhProfile[m.slice(5)]
    // Ngasem
    const k1 = jitter(2100 * p, 0.04) * (inBaseline ? 1 : 0.94) // sedikit hemat setelah baseline (LED)
    ;(await addRec(NGS, "listrik", m, k1, "kWh", st, OP1, { ev: [(await evidence(NGS, `${Math.round(k1)} kWh ${m} · ID 512340998812`, OP1, `${m}-05`))], meta: { customer_id: "512340998812", power_va: 23000 }, verifier: V1 }))
    if (p > 0.6) (await addRec(NGS, "lpg", m, jitter(18 * p, 0.1), "kg", st, OP1, { meta: { tabung_kg: 3, user: "kantin" }, verifier: V1 }))
    if (["2025-11", "2026-01", "2026-02", "2026-04", "2026-10"].includes(m)) (await addRec(NGS, "genset", m, jitter(12, 0.3), "liter", st, OP1, { meta: { hours: 6 }, verifier: V1 }))
    ;(await addRec(NGS, "kertas", m, Math.round(jitter(10 * p, 0.15)), "rim", st, OP1, { verifier: V1 }))
    if (m >= "2026-01") (await addRec(NGS, "plts", m, jitter(300, 0.12), "kWh", st, OP1, { meta: { kwp: 3 }, verifier: V1 }))
    // Purwosari — dua bulan hilang (Feb, Mar 2026) untuk contoh interpolasi
    if (!["2026-02", "2026-03"].includes(m)) {
      const anomaly = m === "2026-10"
      const k2 = anomaly ? 3650 : jitter(1600 * p, 0.05)
      const st2 = inBaseline ? "draf" : m === "2026-10" ? "draf" : "draf"
      ;(await addRec(PWS, "listrik", m, k2, "kWh", st2, OP2, { ev: [(await evidence(PWS, `${Math.round(k2)} kWh ${m} · ID 512341177302`, OP2, `${m}-06`))], meta: { customer_id: "512341177302", power_va: 16500 } }))
    }
    if (p > 0.6) (await addRec(PWS, "lpg", m, jitter(12 * p, 0.1), "kg", "draf", OP2, { meta: { tabung_kg: 3, user: "kantin" } }))
  }

  // ---------- AC (metode laju bocor), aset lingkungan ----------
  const asset = async (org: number, type: string, code: string, meta: any, lat?: number, lng?: number, extra: Partial<{ species: number; planted: string; status: string; dead: string; flags: string[] }> = {}) =>
    id((await q.run("INSERT INTO assets(org_id, type, code, qr_sig, species_id, lat, lng, gps_accuracy, meta, status, planted_at, dead_at, dead_reason, flags, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      org, type, code, qrSign(code), extra.species ?? null, lat ?? null, lng ?? null, lat ? 4 + rnd() * 6 : null, JSON.stringify(meta), extra.status ?? "hidup", extra.planted ?? null,
      extra.dead ?? null, extra.dead ? "Ditebang untuk perluasan kelas" : null, JSON.stringify(extra.flags ?? []), org === NGS ? OP1 : OP2, "2025-08-20 08:00:00")))
  // ---------- denah GIS sekolah (meter relatif pusat: x timur, y utara) ----------
  const center: Record<number, [number, number]> = { [NGS]: [-7.2321, 111.7792], [PWS]: [-7.2589, 111.6187] }
  const SCALE: Record<number, number> = { [NGS]: 1, [PWS]: 0.88 } // Purwosari lebih kecil (9.500 m² vs 12.000 m²)
  type R = [number, number, number, number]
  const BUILDINGS: [string, R][] = [
    ["Ruang Kelas A", [-50, 30, -10, 42]], ["Ruang Kelas B", [0, 30, 40, 42]], ["Kantor & TU", [-50, 8, -32, 22]], ["Perpustakaan", [-26, 8, -8, 20]],
    ["Aula", [8, 8, 30, 20]], ["Laboratorium", [40, 4, 56, 24]], ["Musala", [44, -46, 56, -34]], ["Kantin", [-56, -46, -40, -36]],
  ]
  const OPEN: [string, string, R][] = [["field", "Lapangan upacara", [-20, -32, 26, -2]], ["garden", "Kebun sekolah", [32, -30, 56, -10]], ["parking", "Parkir", [-56, -28, -34, -8]]]
  const BOUND: [number, number][] = [[-62, -52], [62, -52], [64, 50], [-60, 52]]
  const ll = (org: number, x: number, y: number): [number, number] => {
    const [la, ln] = center[org], k = SCALE[org]
    return [la + (y * k) / 110540, ln + (x * k) / (111320 * Math.cos((la * Math.PI) / 180))]
  }
  const rectCoords = (org: number, [x1, y1, x2, y2]: R) => [ll(org, x1, y1), ll(org, x2, y1), ll(org, x2, y2), ll(org, x1, y2)]
  const siteFeatures = (org: number) => [
    { type: "boundary", name: "Batas lahan", coords: BOUND.map(([x, y]) => ll(org, x, y)) },
    ...OPEN.map(([type, name, r]) => ({ type, name, coords: rectCoords(org, r) })),
    { type: "path", coords: [ll(org, 2, -52), ll(org, 2, 28)] }, { type: "path", coords: [ll(org, -52, 3), ll(org, 58, 3)] },
    ...BUILDINGS.map(([name, r]) => ({ type: "building", name, coords: rectCoords(org, r) })),
    { type: "gate", name: "Gerbang", coords: [ll(org, 2, -52)] },
  ]
  for (const org of [NGS, PWS]) (await q.run("UPDATE organizations SET polygon = ? WHERE id = ?", JSON.stringify(siteFeatures(org)), org))
  const inR = (x: number, y: number, [x1, y1, x2, y2]: R, m = 0) => x >= x1 - m && x <= x2 + m && y >= y1 - m && y <= y2 + m
  const free = (x: number, y: number) => x > -57 && x < 59 && y > -48 && y < 48
    && !BUILDINGS.some(([, r]) => inR(x, y, r, 2.5)) && !OPEN.some(([, , r]) => inR(x, y, r, 1.5)) && Math.abs(x - 2) > 2.5 && Math.abs(y - 3) > 2.5
  const rand = (a: number, b: number) => a + rnd() * (b - a)
  /** Titik acak bebas bangunan: 60% di tepi lahan (pohon peneduh), sisanya di sela gedung. */
  const treeSpot = (org: number) => {
    for (let i = 0; i < 400; i++) {
      const edge = rnd() < 0.6
      const x = edge ? (rnd() < 0.5 ? rand(-57, -50) : rand(50, 58)) * (rnd() < 0.5 ? 1 : 1) : rand(-56, 58)
      const y = edge && rnd() < 0.5 ? (rnd() < 0.5 ? rand(-48, -42) : rand(44, 48)) : rand(-47, 47)
      if (free(x, y)) return ll(org, x, y)
    }
    return ll(org, rand(-5, 5), rand(-45, -40))
  }
  const inBuilding = (org: number, name: string) => { const r = BUILDINGS.find(([n]) => n === name)![1]; return ll(org, rand(r[0] + 2, r[2] - 2), rand(r[1] + 2, r[3] - 2)) }
  const onEdge = (org: number, [x1, y1, x2, y2]: R) => {
    const side = Math.floor(rnd() * 4), off = 1.8
    const [x, y] = side === 0 ? [rand(x1, x2), y1 - off] : side === 1 ? [rand(x1, x2), y2 + off] : side === 2 ? [x1 - off, rand(y1, y2)] : [x2 + off, rand(y1, y2)]
    return ll(org, x, y)
  }
  const AC_ROOM: Record<string, string> = { "Kepala Sekolah": "Kantor & TU", Guru: "Kantor & TU", "Lab IPA": "Laboratorium", "Lab Komputer": "Laboratorium", Perpustakaan: "Perpustakaan", TU: "Kantor & TU", "Lab Komputer 2": "Laboratorium", Aula: "Aula" }
  const ngsRooms = ["Kepala Sekolah", "Guru", "Lab IPA", "Lab Komputer", "Perpustakaan", "TU", "Lab Komputer 2", "Aula"]
  for (let i = 1; i <= 8; i++) (await asset(NGS, "ac", `NGS-AC-${String(i).padStart(4, "0")}`, { gas: i <= 6 ? "R32" : "R410A", charge_kg: i <= 6 ? 0.8 : 1.1, pk: 1, year: 2019 + (i % 5), room: `Ruang ${ngsRooms[i - 1]}` }, ...inBuilding(NGS, AC_ROOM[ngsRooms[i - 1]])))
  for (let i = 1; i <= 3; i++) (await asset(PWS, "ac", `PWS-AC-${String(i).padStart(4, "0")}`, { gas: "R32", charge_kg: 0.8, pk: 1, year: 2021, room: ["Kepala Sekolah", "Guru", "Lab Komputer"][i - 1] }, ...inBuilding(PWS, AC_ROOM[["Kepala Sekolah", "Guru", "Lab Komputer"][i - 1]])))
  for (let i = 1; i <= 30; i++) (await asset(NGS, "biopori", `NGS-BP-${String(i).padStart(4, "0")}`, { diameter_cm: 10, depth_cm: 100 }, ...onEdge(NGS, i % 3 === 0 ? OPEN[1][2] : OPEN[0][2])))
  for (let i = 1; i <= 15; i++) (await asset(PWS, "biopori", `PWS-BP-${String(i).padStart(4, "0")}`, { diameter_cm: 10, depth_cm: 100 }, ...onEdge(PWS, i % 3 === 0 ? OPEN[1][2] : OPEN[0][2])))
  ;(await asset(NGS, "komposter", "NGS-KP-0001", { capacity_l: 200, kind: "Takakura" }, ...ll(NGS, 36, -27)))
  ;(await asset(NGS, "komposter", "NGS-KP-0002", { capacity_l: 120, kind: "Keranjang" }, ...ll(NGS, 40, -27)))
  ;(await asset(NGS, "bank_sampah", "NGS-BS-0001", { name: "Bank Sampah Hijau Lestari" }, ...ll(NGS, -37, -41)))
  ;(await asset(NGS, "panel", "NGS-PV-0001", { kwp: 3, installed: "2026-01-05", inverter: "Growatt 3kW" }, ...ll(NGS, 19, 14)))
  ;(await asset(NGS, "atap", "NGS-AT-0001", { area_m2: 120, tank_l: 2000 }, ...ll(NGS, 26, 17)))
  ;(await asset(NGS, "atap", "NGS-AT-0002", { area_m2: 200, tank_l: 3000 }, ...ll(NGS, 20, 36)))
  ;(await asset(PWS, "atap", "PWS-AT-0001", { area_m2: 90, tank_l: 1000 }, ...ll(PWS, 20, 36)))
  const rain: Record<string, number> = { "01": 300, "02": 280, "03": 250, "04": 150, "05": 90, "06": 50, "07": 30, "08": 20, "09": 40, "10": 110, "11": 180, "12": 250 }
  for (const m of months("2025-07", "2026-10")) for (const org of [NGS, PWS]) (await q.run("INSERT INTO rainfall(org_id, period, mm) VALUES (?,?,?)", org, m, Math.round(jitter(rain[m.slice(5)], 0.15))))

  // ---------- pohon ber-QR ----------
  const tree = async (org: number, n: number, speciesName: string, measures: { date: string; dbh: number; h: number }[], extra: any = {}) => {
    const code = `${org === NGS ? "NGS" : "PWS"}-PH-${String(n).padStart(4, "0")}`
    const [lat, lng] = treeSpot(org)
    const a = (await asset(org, "pohon", code, {}, lat, lng, { species: sp[speciesName], planted: extra.planted, status: extra.status, dead: extra.dead, flags: extra.flags }))
    for (const m of measures)
      (await q.run("INSERT INTO tree_measurements(asset_id, date, dbh, height, condition, lat, lng, accuracy, measured_by, measurer_role, status) VALUES (?,?,?,?,?,?,?,?,?, 'operator', 'terverifikasi')",
        a, m.date, Math.round(m.dbh * 10) / 10, Math.round(m.h * 10) / 10, "baik", lat, lng, 5, org === NGS ? OP1 : OP2))
    return a
  }
  const mix: [string, number][] = [["Mahoni", 20], ["Trembesi", 6], ["Ketapang", 8], ["Jati", 6], ["Sengon", 4], ["Palem", 4]]
  const growthOf: Record<string, number> = { Mahoni: 0.9, Trembesi: 1.0, Ketapang: 0.8, Jati: 1.2, Sengon: 2.0, Palem: 0 }
  // TREE-001 sesuai contoh Excel (Kalk_Pohon)
  ;(await tree(NGS, 1, "Mahoni", [{ date: "2026-01-15", dbh: 24, h: 11 }, { date: "2026-07-15", dbh: 24.6, h: 11.3 }], { planted: "2016-01-10" }))
  let n = 2
  for (const [name, count] of mix) for (let i = 0; i < (name === "Mahoni" ? count - 1 : count); i++) {
    const d0 = name === "Palem" ? jitter(22, 0.2) : jitter(name === "Sengon" ? 28 : 22, 0.45)
    const g = growthOf[name] * jitter(1, 0.35)
    const h = Math.max(4, d0 * 0.42 + rnd() * 3)
    const t0 = "2025-08-" + String(18 + Math.floor(rnd() * 5)).padStart(2, "0")
    const ms = [{ date: t0, dbh: d0, h }]
    const r = rnd()
    if (r < 0.75) ms.push({ date: addDays(t0, 182 + Math.floor(rnd() * 10)), dbh: d0 + g * 0.5, h: h + 0.3 })
    if (r < 0.35) ms.push({ date: addDays(t0, 364 + Math.floor(rnd() * 10)), dbh: d0 + g * 1.0, h: h + 0.6 })
    const extra: any = {}
    if (n === 14) { extra.status = "ditebang"; extra.dead = "2026-05-20" }
    if (n === 9) extra.flags = ["Lokasi diragukan: akurasi GPS > 15 m"]
    ;(await tree(NGS, n++, name, ms, extra))
  }
  // Purwosari: sensus t0 Agustus 2026
  const mix2: [string, number][] = [["Mahoni", 12], ["Trembesi", 5], ["Ketapang", 6], ["Jati", 4], ["Akasia", 3]]
  let n2 = 1
  for (const [name, count] of mix2) for (let i = 0; i < count; i++) {
    const d0 = jitter(20, 0.45)
    ;(await tree(PWS, n2++, name, [{ date: "2026-08-" + String(3 + Math.floor(rnd() * 5)).padStart(2, "0"), dbh: d0, h: Math.max(4, d0 * 0.42 + rnd() * 3) }]))
  }

  // ---------- sesi penimbangan sampah ----------
  const ngsRows: [string, string, number[]][] = [
    ["makanan", "kompos", [9, 7, 8, 8, 9, 7, 8, 8]], ["makanan", "tpa", [9, 8, 8, 7, 9, 7, 8, 8]], ["kertas", "bank_sampah", [7, 5, 6, 6, 7, 5, 6, 6]],
    ["kertas", "tpa", [3, 3, 3, 3, 4, 2, 3, 3]], ["plastik", "bank_sampah", [5, 5, 6, 4, 6, 4, 5, 5]], ["residu", "tpa", [8, 8, 8, 7, 9, 8, 8, 8]],
  ]
  const FC: Record<string, string> = { "makanan|kompos": "WS_KOMPOS", "makanan|tpa": "WS_MAKANAN_TPA", "kertas|bank_sampah": "WS_DAUR_ULANG", "kertas|tpa": "WS_KERTAS_TPA", "plastik|bank_sampah": "WS_DAUR_ULANG", "residu|tpa": "WS_RESIDU_TPA" }
  const schoolDays = async (start: string, n: number, org: number) => {
    const out: string[] = []
    for (let d = start; out.length < n; d = addDays(d, 1)) {
      const dow = new Date(d + "T00:00:00Z").getUTCDay()
      const cal = (await q.get("SELECT type FROM calendar_days WHERE org_id = ? AND date = ?", org, d))
      if (dow !== 0 && cal?.type !== "libur") out.push(d)
    }
    return out
  }
  const session = async (org: number, kind: string, start: string, rows: [string, string, number[]][], scale = 1) => {
    const ndays = rows[0][2].length
    const dates = (await schoolDays(start, ndays, org))
    const s = id((await q.run("INSERT INTO waste_sessions(org_id, kind, start_date, end_date, days, status, created_by) VALUES (?,?,?,?,?, 'selesai', ?)", org, kind, dates[0], dates[ndays - 1], kind === "baseline" ? 8 : 5, org === NGS ? OP1 : OP2)))
    for (const [cat, treat, vals] of rows) for (const [i, v] of vals.entries()) (await q.run("INSERT INTO waste_weighings(session_id, date, category, treatment, factor_code, kg) VALUES (?,?,?,?,?,?)", s, dates[i], cat, treat, FC[`${cat}|${treat}`], Math.round(v * scale * 10) / 10))
  }
  ;(await session(NGS, "baseline", "2025-09-08", ngsRows))
  // sesi ulang 5 hari: lebih banyak dikompos, lebih sedikit ke TPA
  ;(await session(NGS, "ulang", "2026-08-10", [["makanan", "kompos", [11, 10, 11, 12, 10]], ["makanan", "tpa", [5, 6, 5, 5, 6]], ["kertas", "bank_sampah", [7, 6, 7, 7, 6]], ["kertas", "tpa", [2, 2, 2, 3, 2]], ["plastik", "bank_sampah", [6, 5, 6, 5, 6]], ["residu", "tpa", [7, 7, 8, 7, 7]]]))
  ;(await session(NGS, "ulang", "2026-10-12", [["makanan", "kompos", [12, 11, 12, 12, 11]], ["makanan", "tpa", [4, 5, 4, 4, 5]], ["kertas", "bank_sampah", [7, 7, 7, 8, 7]], ["kertas", "tpa", [2, 1, 2, 2, 2]], ["plastik", "bank_sampah", [6, 6, 6, 5, 6]], ["residu", "tpa", [6, 7, 7, 6, 7]]]))
  ;(await session(PWS, "baseline", "2026-09-14", ngsRows.map(([a, b, v]) => [a, b === "kompos" ? "tpa" : b, v.map((x) => x * 0.78)] as [string, string, number[]]).filter((r, i, arr) => arr.findIndex((x) => x[0] === r[0] && x[1] === r[1]) === i)))

  // ---------- survei mobilitas (respons individual anonim) ----------
  const classes = (prefix: string[], per: number) => Object.fromEntries(prefix.map((p) => [p, per]))
  const survey = async (org: number, title: string, period: string, classMap: Record<string, number>, staff: number, rate: number, walkBoost = 0) => {
    const s = id((await q.run("INSERT INTO mobility_surveys(org_id, title, token, period, classes, status, created_by, created_at) VALUES (?,?,?,?,?,?,?,?)", org, title, sha256(title).slice(0, 10), period, JSON.stringify(classMap), period < "2026-07-01" ? "ditutup" : "aktif", org === NGS ? OP1 : OP2, period + " 07:00:00")))
    let dev = 0
    const student: [string, number][] = [["boncengan", 80], ["antar_pp", 150], ["antar_searah", 60], ["mobil", 10], ["angkot", 40], ["jalan", 185 + walkBoost], ["motor_sendiri", 20]]
    const add = async (cls: string | null, role: string, kind: string) => {
      const d = Math.max(0.3, jitter({ boncengan: 5, antar_pp: 3, antar_searah: 4, mobil: 6, angkot: 5, jalan: 1, motor_sendiri: 4 }[kind]!, 0.5))
      const mode = kind === "mobil" ? "mobil" : kind === "angkot" ? "angkot" : kind === "jalan" ? (rnd() < 0.5 ? "jalan" : "sepeda") : "motor"
      ;(await q.run("INSERT INTO mobility_responses(survey_id, class_name, role, mode, distance_km, escort, occupants, days_per_week, device_hash) VALUES (?,?,?,?,?,?,?,?,?)",
        s, cls, role, mode, Math.round(d * 10) / 10, ["antar_pp", "mobil"].includes(kind) ? 2 : 1, kind === "boncengan" ? 2 : kind === "angkot" ? 8 : 1, 6, sha256(`${s}:${dev++}`)))
    }
    for (const [cls, size] of Object.entries(classMap)) for (let i = 0; i < Math.round(size * jitter(rate, 0.06)); i++) (await add(cls, "siswa", pick(student)))
    for (let i = 0; i < Math.round(staff * 0.9); i++) (await add(null, "guru", pick([["motor_sendiri", 85], ["mobil", 10], ["jalan", 5]])))
    return s
  }
  const ngsClasses = classes(["7A", "7B", "7C", "7D", "7E", "7F", "8A", "8B", "8C", "8D", "8E", "8F", "9A", "9B", "9C", "9D", "9E", "9F"], 33)
  ;(await survey(NGS, "Survei mobilitas baseline 2025/2026", "2025-08-25", ngsClasses, 45, 0.9))
  ;(await survey(NGS, "Survei mobilitas semester ganjil 2026/2027", "2026-07-27", ngsClasses, 45, 0.86, 60))
  ;(await survey(PWS, "Survei mobilitas baseline Purwosari", "2026-08-18", classes(["7A", "7B", "7C", "7D", "7E", "8A", "8B", "8C", "8D", "8E", "9A", "9B", "9C", "9D", "9E"], 32), 38, 0.78))
})

// ---------- sensor IoT (beta V3): meter kWh utama Ngasem, pembacaan kumulatif harian ----------
{
  const nowStr = new Date().toISOString().replace("T", " ").slice(0, 19)
  const dev = id(await q.run("INSERT INTO iot_devices(org_id, name, kind, unit, source, token, location, interval_sec, firmware, rssi, created_at) VALUES (1, 'Meter utama PLN', 'kwh_meter', 'kWh', 'listrik', 'demo-ngs-meter-utama', 'Panel listrik utama, ruang TU', 900, 'ESP32-PZEM004T v1.2', -61, '2026-09-28 08:00:00')"))
  let total = 48210, lastAt: string | null = null
  for (let d = "2026-09-30"; d <= todayWIB(); d = addDays(d, 1)) {
    const at = `${d} 16:59:00`
    if (at > nowStr) break // tidak membuat data di masa depan
    const dow = new Date(d + "T00:00:00Z").getUTCDay()
    const cal = await q.get("SELECT type FROM calendar_days WHERE org_id = 1 AND date = ?", d)
    total += (dow === 0 || cal?.type === "libur" ? 14 : 88) * (0.92 + Math.random() * 0.16)
    await q.run("INSERT INTO iot_readings(device_id, at, value) VALUES (?,?,?)", dev, at, Math.round(total * 10) / 10)
    lastAt = at
  }
  await q.run("UPDATE iot_devices SET last_seen_at = ?, paired_at = '2026-09-30 02:00:00', last_ip = '192.168.1.40' WHERE id = ?", lastAt, dev)
  await q.run("INSERT INTO iot_devices(org_id, name, kind, unit, source, token, location, status, interval_sec) VALUES (1, 'Meter PLTS (inverter)', 'kwh_meter', 'kWh', 'plts', 'demo-ngs-inverter', 'Atap gedung B', 'aktif', 300)")
}

// ---------- baseline Ngasem: dikunci (BL-2025-v1); Purwosari: draf ----------
const NGS = 1, PWS = 2
const V1 = (await q.get("SELECT id FROM users WHERE email = 'admin@jejakhijau.id'"))!.id
const OP1 = (await q.get("SELECT id FROM users WHERE email = 'operator@smpn1ngasem.sch.id'"))!.id
const KS1 = (await q.get("SELECT id FROM users WHERE email = 'kepsek@smpn1ngasem.sch.id'"))!.id
const b1 = id((await q.run("INSERT INTO baselines(org_id, version_label, version, period_start, period_end, status, submitted_by, approved_by, verified_by, created_at) VALUES (?, 'BL-2025-v1', 1, '2025-07-01', '2026-06-30', 'terverifikasi', ?, ?, ?, '2026-08-01 08:00:00')", NGS, OP1, KS1, V1)))
;(await recomputeBaseline(b1))
// riwayat temuan minor yang sudah diperbaiki (UAT-02)
;(await q.run("INSERT INTO findings(org_id, object_type, object_id, category, note, status, created_by, created_at, resolved_at, resolution) VALUES (?, 'baseline', ?, 'minor', 'Foto tagihan Maret 2026 buram; unggah ulang', 'selesai', ?, '2026-08-12 10:00:00', '2026-08-14 09:00:00', 'Foto diunggah ulang')", NGS, b1, V1))
// kunjungan lapangan: sampel acak 10% (seed tersimpan), lolos
const sample = (await drawSample(NGS, 4242))
const fs = id((await q.run("INSERT INTO field_samples(org_id, seed, asset_ids, status, planned_date, result, created_by, created_at) VALUES (?, 4242, ?, 'lolos', '2026-08-20', ?, ?, '2026-08-18 08:00:00')", NGS, JSON.stringify(sample), JSON.stringify({ passRate: 1 }), V1)))
for (const aid of sample) {
  const op = (await q.get("SELECT * FROM tree_measurements WHERE asset_id = ? ORDER BY date DESC LIMIT 1", aid))
  if (op) (await q.run("INSERT INTO tree_measurements(asset_id, date, dbh, height, lat, lng, accuracy, measured_by, measurer_role, status, created_at) VALUES (?, '2026-08-20', ?, ?, ?, ?, 4, ?, 'verifikator', 'terverifikasi', '2026-08-20 10:00:00')", aid, Math.round(op.dbh * (1 + (rnd() * 0.06 - 0.03)) * 10) / 10, op.height, op.lat, op.lng, V1))
}
;(await q.run("UPDATE activity_records SET status = 'terkunci' WHERE org_id = ? AND period BETWEEN '2025-07' AND '2026-06'", NGS))
;(await q.run("UPDATE baselines SET status = 'terkunci', data_hash = ?, locked_by = ?, locked_at = '2026-08-25 10:00:00' WHERE id = ?", (await baselineHash(b1)), V1, b1))
void fs

const b2 = id((await q.run("INSERT INTO baselines(org_id, version_label, version, period_start, period_end, status, created_at) VALUES (?, 'BL-2025-v1', 1, '2025-07-01', '2026-06-30', 'draf', '2026-09-01 08:00:00')", PWS)))
;(await recomputeBaseline(b2))

// ---------- antrian verifikasi ----------
const ngsOct = (await q.get("SELECT id FROM activity_records WHERE org_id = ? AND source = 'listrik' AND period = '2026-10'", NGS))!.id
;(await q.run("UPDATE activity_records SET status = 'diajukan', submitted_by = ? WHERE id = ?", OP1, ngsOct))
;(await createTask(NGS, "activity", ngsOct, "Listrik PLN 2026-10 — SMPN 1 Ngasem", "normal"))
const pwsOct = (await q.get("SELECT * FROM activity_records WHERE org_id = ? AND source = 'listrik' AND period = '2026-10'", PWS))!
;(await q.run("UPDATE activity_records SET status = 'diajukan', submitted_by = created_by, flags = ? WHERE id = ?", JSON.stringify(["Anomali: 3650 kWh > 2× acuan 1690 kWh"]), pwsOct.id))
;(await createTask(PWS, "activity", pwsOct.id, "Listrik PLN 2026-10 — SMPN 2 Purwosari: 3650 kWh", "tinggi", "Anomali: 3650 kWh > 2× acuan bulan sama"))

// ---------- rapor terbit ----------
const { buildReportSnapshot } = await import("./routes/workflow")
const snap = (await buildReportSnapshot(NGS, "karbon", "2026-07-01", "2026-09-30"))
const hash = sha256(JSON.stringify(snap) + "BL-2025-v1" + snap.feVersion)
;(await q.run("INSERT INTO reports(org_id, kind, period_type, period_label, start_date, end_date, status, baseline_version, fe_version, snapshot, hash, submitted_by, approved_by, verified_by, created_at, published_at) VALUES (?, 'karbon', 'triwulan', 'Juli–September 2026', '2026-07-01', '2026-09-30', 'terkunci', 'BL-2025-v1', ?, ?, ?, ?, ?, ?, '2026-10-15 09:00:00', '2026-10-20 10:00:00')",
  NGS, snap.feVersion, JSON.stringify(snap), hash, OP1, KS1, V1))
const snap2 = (await buildReportSnapshot(NGS, "jasa", "2026-07-01", "2026-09-30"))
;(await q.run("INSERT INTO reports(org_id, kind, period_type, period_label, start_date, end_date, status, baseline_version, fe_version, snapshot, hash, created_at, published_at, submitted_by, approved_by, verified_by) VALUES (?, 'jasa', 'triwulan', 'Juli–September 2026', '2026-07-01', '2026-09-30', 'terkunci', 'BL-2025-v1', ?, ?, ?, '2026-10-15 09:00:00', '2026-10-20 10:00:00', ?, ?, ?)",
  NGS, snap2.feVersion, JSON.stringify(snap2), sha256(JSON.stringify(snap2) + "BL-2025-v1" + snap2.feVersion), OP1, KS1, V1))

;(await q.run("INSERT INTO notifications(user_id, title, body, link) VALUES (?, 'Pengingat input bulanan', 'Input tagihan listrik, LPG, dan kertas bulan Oktober paling lambat tanggal 10.', '/app/input')", OP1))
;(await q.run("INSERT INTO notifications(user_id, title, body, link) VALUES (?, 'Rapor terbit', 'Rapor Karbon Juli–September 2026 terbit & terkunci.', '/app/reports')", KS1))
;(await q.run("INSERT INTO audit_log(actor_id, action, object_type, object_id, after, ip) VALUES (NULL, 'seed', 'system', 'pilot', ?, 'local')", JSON.stringify({ at: new Date().toISOString(), today: todayWIB() })))
console.log("[seed] selesai: 2 sekolah, 11 akun, pohon, sampah, survei, baseline, rapor")

