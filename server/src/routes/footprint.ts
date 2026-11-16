// Kalkulator jejak karbon pribadi (peran "user" dan semua pengguna yang masuk).
// Sektor: transportasi darat, penerbangan, rumah (listrik, LPG, sampah), dan makanan.
// Faktor diambil dari katalog resmi Sekolah Lestari bila ada; makanan memakai referensi ilmiah (ditandai non-nasional).
import { Hono } from "hono"
import { q } from "../db"
import { audit, bad, requireAuth } from "../lib"
import { loadFactors } from "../engine/engine"

export const footprint = new Hono()
footprint.use("*", requireAuth)

const WEEKS = 4.345 // minggu per bulan

// ---------- referensi ----------
const TRANSPORT = [
  { k: "motor", label: "Sepeda motor", code: "TR_MOTOR", per: "kendaraan", occupancy: 1 },
  { k: "ojek", label: "Ojek online (motor)", code: "TR_MOTOR", per: "kendaraan", occupancy: 1 },
  { k: "mobil", label: "Mobil pribadi", code: "TR_SEDAN", per: "kendaraan", occupancy: 1, shareable: true },
  { k: "taksi", label: "Taksi / ojol mobil", code: "TR_TAKSI", per: "kendaraan", occupancy: 1 },
  { k: "angkot", label: "Angkot / minibus", code: "TR_ANGKOT", per: "penumpang", occupancy: 8 },
  { k: "bus", label: "Bus kota / antarkota", code: "TR_BUS_BESAR", per: "penumpang", occupancy: 30 },
  { k: "kereta", label: "Kereta / KRL", code: "TR_KAI_EKO", per: "penumpang", occupancy: 1 },
  { k: "sepeda", label: "Sepeda / jalan kaki", code: null, per: "penumpang", occupancy: 1 },
]
const FLIGHT_BANDS = [
  { k: "dom1", label: "Domestik < 926 km (mis. Surabaya–Jakarta)", code: "TR_PSW_DOM1", km: 700 },
  { k: "dom2", label: "Domestik 926–1.852 km (mis. Jakarta–Makassar)", code: "TR_PSW_DOM2", km: 1400 },
  { k: "dom3", label: "Domestik > 1.852 km (mis. Jakarta–Jayapura)", code: "TR_PSW_DOM3", km: 3700 },
  { k: "int", label: "Internasional", code: "TR_PSW_INT", km: 5000 },
]
// Poore & Nemecek (2018), Science 360:987 — median global kg CO₂e per kg produk (via Our World in Data). Non-nasional.
const FOODS = [
  { k: "sapi", label: "Daging sapi", kgPerKg: 99.48, portion: 0.1, portionLabel: "100 g" },
  { k: "kambing", label: "Daging kambing/domba", kgPerKg: 39.72, portion: 0.1, portionLabel: "100 g" },
  { k: "udang", label: "Udang/seafood budidaya", kgPerKg: 26.87, portion: 0.1, portionLabel: "100 g" },
  { k: "keju", label: "Keju & olahan susu", kgPerKg: 23.88, portion: 0.03, portionLabel: "30 g" },
  { k: "ikan", label: "Ikan budidaya", kgPerKg: 13.63, portion: 0.1, portionLabel: "100 g" },
  { k: "babi", label: "Daging babi", kgPerKg: 12.31, portion: 0.1, portionLabel: "100 g" },
  { k: "ayam", label: "Daging ayam", kgPerKg: 9.87, portion: 0.1, portionLabel: "100 g" },
  { k: "telur", label: "Telur", kgPerKg: 4.67, portion: 0.06, portionLabel: "1 butir" },
  { k: "beras", label: "Nasi (beras)", kgPerKg: 4.45, portion: 0.08, portionLabel: "1 piring (80 g beras)" },
  { k: "susu", label: "Susu", kgPerKg: 3.15, portion: 0.25, portionLabel: "1 gelas 250 ml" },
  { k: "tahu", label: "Tahu/tempe", kgPerKg: 3.16, portion: 0.1, portionLabel: "100 g" },
  { k: "sayur", label: "Sayur & buah", kgPerKg: 0.53, portion: 0.1, portionLabel: "100 g" },
]
const FOOD_SOURCE = "Poore & Nemecek (2018), Science — median global (non-nasional)"
// Peralatan rumah: daya tipikal (W) & jam/hari bawaan
const APPLIANCES = [
  { k: "lampu_led", label: "Lampu LED", watt: 10, hours: 8 },
  { k: "lampu_biasa", label: "Lampu pijar/neon", watt: 40, hours: 8 },
  { k: "ac_05", label: "AC ½ PK", watt: 400, hours: 8 },
  { k: "ac_1", label: "AC 1 PK", watt: 800, hours: 8 },
  { k: "ac_15", label: "AC 1½ PK", watt: 1200, hours: 8 },
  { k: "kulkas", label: "Kulkas", watt: 100, hours: 12 },
  { k: "tv", label: "Televisi", watt: 80, hours: 5 },
  { k: "rice_cooker", label: "Rice cooker (masak + hangat)", watt: 300, hours: 4 },
  { k: "mesin_cuci", label: "Mesin cuci", watt: 350, hours: 1 },
  { k: "pompa", label: "Pompa air", watt: 250, hours: 2 },
  { k: "dispenser", label: "Dispenser air panas", watt: 350, hours: 6 },
  { k: "setrika", label: "Setrika", watt: 350, hours: 1 },
  { k: "komputer", label: "Laptop / komputer", watt: 80, hours: 6 },
  { k: "water_heater", label: "Pemanas air", watt: 1500, hours: 1 },
]
// Tarif listrik rumah tangga PLN (Rp/kWh) untuk mengubah tagihan rupiah menjadi kWh — perkiraan, cek tarif terbaru.
const TARIFFS = [
  { k: "r1_450", label: "450 VA (subsidi)", rpPerKwh: 415 },
  { k: "r1_900s", label: "900 VA subsidi", rpPerKwh: 605 },
  { k: "r1_900", label: "900 VA (RTM)", rpPerKwh: 1352 },
  { k: "r1_1300", label: "1.300–2.200 VA", rpPerKwh: 1444.7 },
  { k: "r2", label: "3.500–5.500 VA", rpPerKwh: 1699.53 },
  { k: "r3", label: "≥ 6.600 VA", rpPerKwh: 1699.53 },
]
// Pembanding kasar: emisi CO₂ fosil per kapita per tahun (Our World in Data, 2022). Mencakup seluruh ekonomi, bukan hanya rumah tangga.
const AVERAGES = [
  { k: "id", label: "Rata-rata Indonesia", tPerYear: 2.6, source: "Our World in Data (2022), CO₂ fosil per kapita" },
  { k: "world", label: "Rata-rata dunia", tPerYear: 4.7, source: "Our World in Data (2022), CO₂ fosil per kapita" },
  { k: "target", label: "Target gaya hidup 1,5 °C (2030)", tPerYear: 2.5, source: "IGES (2019), 1.5-Degree Lifestyles" },
]

async function reference() {
  const fe = await loadFactors()
  const v = (code: string | null, d = 0) => (code ? fe[code]?.value ?? d : 0)
  const grids = Object.values(fe).filter((f: any) => /^EL_/.test(f.code) && f.value).map((f: any) => ({ code: f.code, name: f.name, value: f.value }))
  return {
    fe, v, grids,
    transport: TRANSPORT.map((t) => ({ ...t, factor: t.code ? v(t.code) / t.occupancy : 0, source: t.code ? fe[t.code]?.source ?? "" : "" })),
    flights: FLIGHT_BANDS.map((f) => ({ ...f, factor: v(f.code, 0.1), source: fe[f.code]?.source ?? "" })),
    foods: FOODS.map((f) => ({ ...f, perPortion: f.kgPerKg * f.portion, source: FOOD_SOURCE })),
    appliances: APPLIANCES, tariffs: TARIFFS, averages: AVERAGES,
    lpg: v("LPG_BI", 3.015), wasteTpa: v("WS_MAKANAN_TPA", 0.84), wasteCompost: v("WS_KOMPOS", 0.1756),
  }
}

type Data = {
  v: 2; household: number
  transport: { mode: string; kmWeek: number; share?: number }[]
  flights: { band: string; trips: number; roundTrip: boolean }[]
  electricity: { method: "kwh" | "tagihan" | "alat"; kwh: number; rupiah: number; tariff: string; grid: string; appliances: Record<string, { count: number; hours: number }> }
  lpg: number
  waste: { kgWeek: number; sortedPct: number }
  food: Record<string, number>
}
/** Data versi lama (v1) diubah ke struktur v2 agar riwayat tetap terbaca. */
function normalize(raw: any, household = 1): Data {
  if (raw?.v === 2) return { ...raw, household: raw.household ?? household }
  const r = raw ?? {}
  return {
    v: 2, household,
    transport: [["motor", r.motor], ["mobil", r.mobil], ["angkot", r.umum]].filter(([, km]) => Number(km) > 0).map(([mode, km]) => ({ mode: String(mode), kmWeek: Number(km) })),
    flights: [],
    electricity: { method: "kwh", kwh: Number(r.listrik ?? 0), rupiah: 0, tariff: "r1_1300", grid: "EL_JAMALI", appliances: {} },
    lpg: Number(r.lpg ?? 0),
    waste: { kgWeek: Number(r.sampah ?? 0), sortedPct: 0 },
    food: {},
  }
}
const clamp = (x: unknown, max: number) => Math.max(0, Math.min(Number(x) || 0, max))

/** Hitung emisi bulanan per item & sektor. Rumah dibagi jumlah penghuni; transportasi, penerbangan, makanan = pribadi. */
function compute(d: Data, ref: Awaited<ReturnType<typeof reference>>) {
  const items: { sector: string; key: string; label: string; detail: string; kgMonth: number }[] = []
  const hh = Math.max(1, Math.min(Number(d.household) || 1, 30))
  for (const t of d.transport ?? []) {
    const m = ref.transport.find((x) => x.k === t.mode); if (!m) continue
    const share = m.shareable ? Math.max(1, Number(t.share) || 1) : 1
    const km = clamp(t.kmWeek, 10000) * WEEKS
    items.push({ sector: "transport", key: `tr-${t.mode}`, label: m.label, detail: `${Math.round(km)} km/bulan${share > 1 ? ` · berbagi ${share} orang` : ""}`, kgMonth: (km * m.factor) / share })
  }
  for (const f of d.flights ?? []) {
    const b = ref.flights.find((x) => x.k === f.band); if (!b) continue
    const trips = clamp(f.trips, 100)
    const km = b.km * trips * (f.roundTrip ? 2 : 1)
    items.push({ sector: "flight", key: `fl-${f.band}`, label: `Penerbangan ${b.label.split(" (")[0].toLowerCase()}`, detail: `${trips}× ${f.roundTrip ? "pulang-pergi" : "sekali jalan"} per tahun · ±${num(km)} km`, kgMonth: (km * b.factor) / 12 })
  }
  const e = d.electricity ?? ({} as Data["electricity"])
  const grid = ref.grids.find((g) => g.code === e.grid) ?? ref.grids.find((g) => g.code === "EL_JAMALI") ?? { code: "EL_JAMALI", value: 0.87, name: "Jawa-Madura-Bali" }
  const tariff = TARIFFS.find((x) => x.k === e.tariff) ?? TARIFFS[3]
  const applianceKwh = Object.entries(e.appliances ?? {}).reduce((s, [k, a]) => { const ap = APPLIANCES.find((x) => x.k === k); return ap ? s + (clamp(a.count, 100) * ap.watt * clamp(a.hours, 24) * 30) / 1000 : s }, 0)
  const kwh = e.method === "tagihan" ? clamp(e.rupiah, 1e8) / tariff.rpPerKwh : e.method === "alat" ? applianceKwh : clamp(e.kwh, 100000)
  if (kwh > 0) items.push({ sector: "home", key: "listrik", label: "Listrik rumah", detail: `${num(kwh)} kWh/bulan · ${grid.code} · dibagi ${hh} orang`, kgMonth: (kwh * grid.value) / hh })
  const lpg = clamp(d.lpg, 1000)
  if (lpg > 0) items.push({ sector: "home", key: "lpg", label: "Gas LPG", detail: `${num(lpg)} kg/bulan · dibagi ${hh} orang`, kgMonth: (lpg * ref.lpg) / hh })
  const wk = clamp(d.waste?.kgWeek, 1000) * WEEKS, sorted = clamp(d.waste?.sortedPct, 100) / 100
  if (wk > 0) items.push({ sector: "waste", key: "sampah", label: "Sampah rumah", detail: `${num(wk)} kg/bulan · ${Math.round(sorted * 100)}% dikompos/dipilah · dibagi ${hh} orang`, kgMonth: (wk * ((1 - sorted) * ref.wasteTpa + sorted * ref.wasteCompost)) / hh })
  for (const [k, portions] of Object.entries(d.food ?? {})) {
    const f = ref.foods.find((x) => x.k === k); const p = clamp(portions, 100)
    if (f && p > 0) items.push({ sector: "food", key: `fd-${k}`, label: f.label, detail: `${p} porsi/minggu (${f.portionLabel})`, kgMonth: p * WEEKS * f.perPortion })
  }
  const sectors: Record<string, number> = { transport: 0, flight: 0, home: 0, waste: 0, food: 0 }
  for (const i of items) sectors[i.sector] += i.kgMonth
  const total = Object.values(sectors).reduce((a, b) => a + b, 0)
  return { items, sectors, total, kwh, applianceKwh, grid: { code: grid.code, value: grid.value } }
}
const num = (v: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(v)

footprint.get("/footprint", async (c) => {
  const id = c.get("user").id
  const ref = await reference()
  const rows = (await q.all("SELECT period, data, total, household, updated_at FROM personal_footprints WHERE user_id = ? ORDER BY period", id))
  const { fe, v, ...pub } = ref
  return c.json({
    reference: pub,
    entries: rows.map((r) => { const d = normalize(JSON.parse(r.data || "{}"), r.household); const res = compute(d, ref); return { period: r.period, updated_at: r.updated_at, household: d.household, data: d, ...res } }),
  })
})

// Pratinjau hitungan tanpa menyimpan (dipakai form agar angka langsung berubah)
footprint.post("/footprint/preview", async (c) => {
  const ref = await reference()
  const b = await c.req.json()
  return c.json(compute(normalize(b.data, b.data?.household ?? 1), ref))
})

footprint.put("/footprint/:period", async (c) => {
  const id = c.get("user").id
  const period = c.req.param("period")
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw bad("Periode harus YYYY-MM")
  const b = await c.req.json<{ data: any }>()
  const ref = await reference()
  const d = normalize({ ...b.data, v: 2 }, b.data?.household ?? 1)
  const res = compute(d, ref)
  ;(await q.run(
    "INSERT INTO personal_footprints(user_id, period, data, total, household, updated_at) VALUES (?,?,?,?,?, datetime('now')) ON CONFLICT(user_id, period) DO UPDATE SET data = excluded.data, total = excluded.total, household = excluded.household, updated_at = excluded.updated_at",
    id, period, JSON.stringify(d), res.total, d.household))
  ;(await audit(c, "save_footprint", "personal_footprint", `${id}:${period}`, null, { total: res.total }))
  return c.json({ period, ...res })
})

footprint.delete("/footprint/:period", async (c) => {
  ;(await q.run("DELETE FROM personal_footprints WHERE user_id = ? AND period = ?", c.get("user").id, c.req.param("period")))
  return c.json({ ok: true })
})
