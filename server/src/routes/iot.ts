// Sensor IoT (fase V3, beta): registri meter, webhook pembacaan kumulatif, konversi ke data aktivitas bulanan.
import { Hono } from "hono"
import { markDirty } from "../engine/ledger"
import { networkInterfaces } from "os"
import { q } from "../db"
import { addDays, assertOrg, assertOrgRole, audit, bad, daysInMonth, randomToken, requireAuth, todayWIB, rowId } from "../lib"
import { validateActivity } from "../engine/services"
import { loadFactors } from "../engine/engine"

/**
 * Kategori sensor = satu sumber kebenaran: menentukan satuan, sumber data aktivitas, scope, dan faktor emisi.
 * Operator hanya memilih kategori — satuan & sumber tidak bisa diisi bebas agar tidak salah hitung
 * (mis. meter air tercatat sebagai listrik, atau produksi PLTS terhitung sebagai emisi).
 */
export const IOT_CATEGORIES: Record<string, { kind: string; unit: string; source: string | null; effect: "emisi" | "terhindar" | "pantau"; scope: 1 | 2 | 3 | null; factor: string | null; fossil?: string; label: string; device: string; hint: string }> = {
  listrik_pln: { kind: "kwh_meter", unit: "kWh", source: "listrik", effect: "emisi", scope: 2, factor: "GRID", label: "Listrik PLN", device: "Meter kWh (mis. PZEM-004T, smart meter)", hint: "Dipasang di panel listrik PLN. Kirim angka kWh kumulatif (terus bertambah)." },
  genset: { kind: "fuel_meter", unit: "liter", source: "genset", effect: "emisi", scope: 1, factor: "SOLAR_BI", fossil: "B40_FOSIL", label: "Genset solar", device: "Flow meter bahan bakar", hint: "Dipasang di saluran solar genset. Kirim liter kumulatif." },
  lpg: { kind: "gas_meter", unit: "kg", source: "lpg", effect: "emisi", scope: 1, factor: "LPG_BI", label: "Gas LPG", device: "Timbangan/meter gas kantin", hint: "Kirim kg LPG terpakai kumulatif (bukan sisa isi tabung)." },
  plts: { kind: "kwh_meter", unit: "kWh", source: "plts", effect: "terhindar", scope: null, factor: "GRID", label: "Produksi PLTS atap", device: "Inverter / meter produksi surya", hint: "kWh yang dihasilkan panel surya — dihitung sebagai emisi terhindar, bukan emisi." },
  air: { kind: "water_meter", unit: "m³", source: null, effect: "pantau", scope: null, factor: null, label: "Air bersih", device: "Meter air", hint: "Hanya pemantauan konsumsi air — tidak masuk perhitungan karbon." },
}
export const categoryOf = (d: { category?: string | null; source?: string | null; kind?: string | null }) =>
  d.category && IOT_CATEGORIES[d.category] ? d.category : d.kind === "water_meter" ? "air" : d.source === "plts" ? "plts" : d.source === "genset" ? "genset" : d.source === "lpg" ? "lpg" : "listrik_pln"
/** Faktor kg CO₂e per satuan bacaan untuk kategori sensor (grid mengikuti wilayah grid lembaga). */
export async function carbonFactor(orgId: number, cat: string) {
  const c = IOT_CATEGORIES[cat]
  if (!c.factor) return null
  const fe = await loadFactors()
  const org = await q.get("SELECT * FROM organizations WHERE id = ?", orgId)
  const code = c.factor === "GRID" ? (fe[org?.grid_code ?? ""] ? org!.grid_code : "EL_JAMALI") : c.factor
  const f = fe[code]
  if (!f) return null
  const frac = c.fossil ? fe[c.fossil]?.value ?? 1 : 1
  // biosolar: CO₂ dikali porsi fosil, CH₄/N₂O tetap penuh (sama dengan engine harian)
  const co2Only = c.fossil ? fe.FUEL_SOLAR_IPCC?.value ?? f.value : f.value
  const value = c.fossil ? co2Only * frac + Math.max(f.value - co2Only, 0) : f.value
  return { code, name: f.name, value, base: f.value, fossilShare: c.fossil ? frac : null, unit: `kg CO₂e/${c.unit}`, version: f.version, source: f.source }
}

export const iot = new Hono()
iot.use("*", requireAuth)

export const WIB_MS = 7 * 3600e3
export const toWibDate = (utcStr: string): string => {
  const ms = Date.parse(utcStr.replace(" ", "T") + "Z") + WIB_MS
  return new Date(ms).toISOString().slice(0, 10)
}
export const wibMidnightUtc = (dateStr: string): string => {
  return new Date(Date.parse(dateStr + "T00:00:00Z") - WIB_MS).toISOString().replace("T", " ").slice(0, 19)
}
export const startOfWeekWIB = (dateStr = todayWIB()): string => {
  const d = new Date(dateStr + "T00:00:00Z")
  const day = d.getUTCDay() // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const diff = day === 0 ? -6 : 1 - day
  const mon = new Date(d.getTime() + diff * 86400e3)
  return mon.toISOString().slice(0, 10)
}

/** Konsumsi harian dari pembacaan meter kumulatif (selisih pembacaan terakhir tiap hari di WIB). */
export async function dailyConsumption(deviceId: number, start: string, end: string) {
  const startUtc = wibMidnightUtc(start)
  const nextEnd = addDays(end, 1)
  const endUtc = wibMidnightUtc(nextEnd)

  const rows = await q.all<{ at: string; value: number }>(
    "SELECT at, value FROM iot_readings WHERE device_id = ? AND at >= ? AND at < ? ORDER BY at ASC",
    deviceId, startUtc, endUtc
  )
  const beforeRow = await q.get<{ at: string; value: number }>(
    "SELECT at, value FROM iot_readings WHERE device_id = ? AND at < ? ORDER BY at DESC LIMIT 1",
    deviceId, startUtc
  )

  const firstOfDay = new Map<string, number>()
  const lastOfDay = new Map<string, number>()
  for (const r of rows) {
    const d = toWibDate(r.at)
    if (!firstOfDay.has(d)) firstOfDay.set(d, r.value)
    lastOfDay.set(d, r.value)
  }

  const out: { date: string; value: number | null }[] = []
  let prev: number | undefined = beforeRow?.value

  for (let d = start; d <= end; d = addDays(d, 1)) {
    const last = lastOfDay.get(d)
    const first = firstOfDay.get(d)
    if (last !== undefined) {
      if (prev !== undefined) {
        const diff = Math.max(last - prev, 0)
        out.push({ date: d, value: Math.round(diff * 100) / 100 })
      } else if (first !== undefined) {
        const diff = Math.max(last - first, 0)
        out.push({ date: d, value: Math.round(diff * 100) / 100 })
      } else {
        out.push({ date: d, value: 0 })
      }
      prev = last
    } else {
      out.push({ date: d, value: null })
    }
  }
  return out
}

/** Statistik pembacaan perangkat: Hari ini, Minggu ini, Bulan ini dan emisinya. */
export async function devicePeriodStats(deviceId: number, orgId: number, cat: string) {
  const today = todayWIB()
  const startOfWeek = startOfWeekWIB(today)
  const startOfMonth = `${today.slice(0, 7)}-01`

  const todayRows = await dailyConsumption(deviceId, today, today)
  const todayUsage = todayRows[0]?.value ?? 0

  const weekRows = await dailyConsumption(deviceId, startOfWeek, today)
  const weekUsage = weekRows.reduce((s, x) => s + (x.value ?? 0), 0)

  const monthRows = await dailyConsumption(deviceId, startOfMonth, today)
  const monthUsage = monthRows.reduce((s, x) => s + (x.value ?? 0), 0)

  const f = await carbonFactor(orgId, cat)
  const todayKg = f ? Math.round(todayUsage * f.value * 10) / 10 : null
  const weekKg = f ? Math.round(weekUsage * f.value * 10) / 10 : null
  const monthKg = f ? Math.round(monthUsage * f.value * 10) / 10 : null

  const unit = IOT_CATEGORIES[cat]?.unit ?? "kWh"
  return {
    today: { value: Math.round(todayUsage * 10) / 10, kg: todayKg, unit },
    thisWeek: { value: Math.round(weekUsage * 10) / 10, kg: weekKg, unit, start: startOfWeek, end: today },
    thisMonth: { value: Math.round(monthUsage * 10) / 10, kg: monthKg, unit, start: startOfMonth, end: today },
  }
}

const nowUtc = () => new Date().toISOString().replace("T", " ").slice(0, 19)
const ageSec = (at?: string | null) => (at ? Math.max(0, Math.round((Date.now() - Date.parse(at.replace(" ", "T") + "Z")) / 1000)) : null)
/**
 * Status koneksi dari heartbeat/pembacaan terakhir:
 *  terhubung   — terlihat ≤ 3× interval kirim
 *  terlambat   — terlihat ≤ 6 jam (melewatkan beberapa kiriman)
 *  terputus    — lebih lama dari itu
 *  belum_terhubung — belum pernah mengirim apa pun · nonaktif — dimatikan operator
 */
export function connectionStatus(d: { status: string; last_seen_at?: string | null; interval_sec?: number | null }) {
  if (d.status !== "aktif") return "nonaktif"
  const age = ageSec(d.last_seen_at)
  if (age === null) return "belum_terhubung"
  if (age <= Math.max(d.interval_sec ?? 300, 30) * 3) return "terhubung"
  if (age <= 6 * 3600) return "terlambat"
  return "terputus"
}
/** Uptime 24 jam: per jam, apakah ada heartbeat/pembacaan. */
async function uptime24(deviceId: number) {
  const since = new Date(Date.now() - 24 * 3600e3).toISOString().replace("T", " ").slice(0, 19)
  const rows = await q.all<{ at: string }>("SELECT at FROM iot_heartbeats WHERE device_id = ? AND at >= ? UNION ALL SELECT at FROM iot_readings WHERE device_id = ? AND at >= ?", deviceId, since, deviceId, since)
  const hours = Array.from({ length: 24 }, () => 0)
  for (const r of rows) {
    const h = Math.floor((Date.now() - Date.parse(r.at.replace(" ", "T") + "Z")) / 3600e3)
    if (h >= 0 && h < 24) hours[23 - h]++
  }
  return hours
}
/** Alamat jaringan lokal server — perangkat fisik tidak bisa menjangkau "localhost". */
function lanAddresses() {
  return Object.values(networkInterfaces()).flat().filter((n) => n && n.family === "IPv4" && !n.internal).map((n) => n!.address)
}
async function deviceView(d: any) {
  const cat = categoryOf(d)
  const f = await carbonFactor(d.org_id, cat)
  const last = await q.get("SELECT at, value FROM iot_readings WHERE device_id = ? ORDER BY at DESC LIMIT 1", d.id)
  const count = (await q.get<{ n: number }>("SELECT COUNT(*) AS n FROM iot_readings WHERE device_id = ?", d.id))!.n
  const connection = connectionStatus(d)
  const periods = await devicePeriodStats(d.id, d.org_id, cat)

  const carbon = {
    category: cat,
    ...IOT_CATEGORIES[cat],
    factor: f,
    kgToday: periods.today.kg,
    kgWeek: periods.thisWeek.kg,
    kgMonth: periods.thisMonth.kg,
  }

  return {
    ...d,
    category: cat,
    carbon,
    last,
    count,
    periods,
    todayUsage: periods.today.value,
    todayKg: periods.today.kg,
    weekUsage: periods.thisWeek.value,
    weekKg: periods.thisWeek.kg,
    monthToDate: periods.thisMonth.value,
    monthKg: periods.thisMonth.kg,
    connection,
    online: connection === "terhubung",
    lastSeenAgeSec: ageSec(d.last_seen_at),
    uptime: await uptime24(d.id),
  }
}
/** Sinkronisasi perangkat demo agar pembacaan selalu ada hingga hari ini */
export async function syncDemoIot(orgId = 1) {
  try {
    const dev = await q.get("SELECT * FROM iot_devices WHERE token = 'demo-ngs-meter-utama'")
    if (!dev) return
    const today = todayWIB()
    const nowStr = nowUtc()
    const lastReading = await q.get<{ at: string; value: number }>("SELECT at, value FROM iot_readings WHERE device_id = ? ORDER BY at DESC LIMIT 1", dev.id)
    let total = lastReading?.value ?? 48210
    const lastDate = lastReading ? toWibDate(lastReading.at) : "2026-09-29"

    if (lastDate < today) {
      for (let d = addDays(lastDate, 1); d <= today; d = addDays(d, 1)) {
        const dow = new Date(d + "T00:00:00Z").getUTCDay()
        const cal = await q.get("SELECT type FROM calendar_days WHERE org_id = ? AND date = ?", dev.org_id, d)
        const dailyKwh = (dow === 0 || cal?.type === "libur" ? 14 : 88) * (0.92 + Math.random() * 0.16)
        if (d < today) {
          total += dailyKwh
          const at = `${d} 16:59:00`
          await q.run("INSERT INTO iot_readings(device_id, at, value) VALUES (?,?,?)", dev.id, at, Math.round(total * 10) / 10)
        } else {
          const nowFraction = Math.max(0.3, ((new Date().getUTCHours() + 7) % 24) / 24)
          total += dailyKwh * nowFraction
          await q.run("INSERT INTO iot_readings(device_id, at, value) VALUES (?,?,?)", dev.id, nowStr, Math.round(total * 10) / 10)
        }
      }
    } else {
      const age = ageSec(dev.last_seen_at)
      if (age === null || age > 900) {
        total += 0.05 + Math.random() * 0.15
        await q.run("INSERT INTO iot_readings(device_id, at, value) VALUES (?,?,?)", dev.id, nowStr, Math.round(total * 10) / 10)
      }
    }

    await q.run(
      "UPDATE iot_devices SET paired_at = COALESCE(paired_at, '2026-09-30 02:00:00'), last_ip = COALESCE(last_ip, '192.168.1.40'), firmware = COALESCE(firmware, 'ESP32-PZEM004T v1.2'), rssi = COALESCE(rssi, -58), battery = COALESCE(battery, 100), category = 'listrik_pln', status = 'aktif', interval_sec = COALESCE(interval_sec, 300) WHERE id = ?",
      dev.id
    )
    if (!dev.last_seen_at) {
      await q.run("UPDATE iot_devices SET last_seen_at = ? WHERE id = ?", nowStr, dev.id)
    }
    await markDirty(dev.org_id)
  } catch (err) {
    console.error("Gagal sinkronisasi demo iot:", err)
  }
}

iot.get("/orgs/:orgId/iot/categories", async (c) => {
  const id = Number(c.req.param("orgId")); (await assertOrg(c, id))
  return c.json(await Promise.all(Object.entries(IOT_CATEGORIES).map(async ([k, v]) => ({ key: k, ...v, factorInfo: await carbonFactor(id, k) }))))
})
iot.get("/orgs/:orgId/iot", async (c) => {
  const id = Number(c.req.param("orgId")); (await assertOrg(c, id))
  if (id === 1) await syncDemoIot(id)
  const rawDevices = await q.all("SELECT * FROM iot_devices WHERE org_id = ? ORDER BY id", id)
  const devices = await Promise.all(rawDevices.map(deviceView))
  const port = new URL(c.req.url).port || "3000"

  // Ringkasan Scope 2 (Listrik PLN) dari sensor aktif
  const listrikDevices = devices.filter((d) => (d.category === "listrik_pln" || d.source === "listrik") && d.status === "aktif")
  const scope2Summary = {
    activeDevices: listrikDevices.length,
    todayKwh: Math.round(listrikDevices.reduce((s, d) => s + (d.todayUsage ?? 0), 0) * 10) / 10,
    todayKg: Math.round(listrikDevices.reduce((s, d) => s + (d.todayKg ?? 0), 0) * 10) / 10,
    weekKwh: Math.round(listrikDevices.reduce((s, d) => s + (d.weekUsage ?? 0), 0) * 10) / 10,
    weekKg: Math.round(listrikDevices.reduce((s, d) => s + (d.weekKg ?? 0), 0) * 10) / 10,
    monthKwh: Math.round(listrikDevices.reduce((s, d) => s + (d.monthToDate ?? 0), 0) * 10) / 10,
    monthKg: Math.round(listrikDevices.reduce((s, d) => s + (d.monthKg ?? 0), 0) * 10) / 10,
  }

  return c.json({
    devices,
    scope2Summary,
    webhookBase: "/api/public/iot/",
    serverTime: nowUtc(),
    lan: lanAddresses().map((ip) => `http://${ip}:${port}`),
  })
})
iot.get("/iot/:id/heartbeats", async (c) => {
  const d = await q.get("SELECT * FROM iot_devices WHERE id = ?", (await rowId("iot_devices", c.req.param("id"))))
  if (!d) throw bad("Perangkat tidak ditemukan", 404)
  await assertOrg(c, d.org_id)
  return c.json(await q.all("SELECT at, kind, rssi, battery, ip FROM iot_heartbeats WHERE device_id = ? ORDER BY at DESC LIMIT 30", d.id))
})
iot.post("/orgs/:orgId/iot", async (c) => {
  const id = Number(c.req.param("orgId")); (await assertOrgRole(c, id, "operator", "admin"))
  const b = await c.req.json()
  if (!b.name) throw bad("Nama perangkat wajib")
  const token = randomToken(18)
  const interval = Math.min(Math.max(Number(b.interval_sec ?? 300), 10), 86400)
  const cat = String(b.category ?? "")
  const def = IOT_CATEGORIES[cat]
  if (!def) throw bad("Pilih kategori sensor")
  const r = (await q.run("INSERT INTO iot_devices(org_id, name, kind, unit, source, category, token, location, interval_sec) VALUES (?,?,?,?,?,?,?,?,?)", id, b.name, def.kind, def.unit, def.source ?? "pantau", cat, token, b.location ?? null, interval))
  ;(await audit(c, "create", "iot_device", r.lastInsertRowid, null, { name: b.name, category: cat }))
  return c.json({ id: Number(r.lastInsertRowid), token })
})
iot.get("/iot/:id/readings", async (c) => {
  const d = (await q.get("SELECT * FROM iot_devices WHERE id = ?", (await rowId("iot_devices", c.req.param("id")))))
  if (!d) throw bad("Perangkat tidak ditemukan", 404)
  ;(await assertOrg(c, d.org_id))
  const days = Math.min(Number(c.req.query("days") ?? 45), 366)
  const end = todayWIB(), start = addDays(end, -days + 1)
  const raw = (await q.all("SELECT at, value FROM iot_readings WHERE device_id = ? ORDER BY at DESC LIMIT 50", d.id))
  const cat = categoryOf(d)
  const f = await carbonFactor(d.org_id, cat)
  const daily = (await dailyConsumption(d.id, start, end)).map((x) => ({ ...x, kg: f && x.value !== null ? Math.round(x.value * f.value * 10) / 10 : null }))
  const periods = await devicePeriodStats(d.id, d.org_id, cat)
  return c.json({ device: { ...d, category: cat }, category: { key: cat, ...IOT_CATEGORIES[cat] }, factor: f, periods, daily, raw })
})
// Kirim pembacaan uji dari UI (untuk verifikasi langsung tanpa alat fisik)
iot.post("/iot/:id/test-reading", async (c) => {
  const d = (await q.get("SELECT * FROM iot_devices WHERE id = ?", (await rowId("iot_devices", c.req.param("id")))))
  if (!d) throw bad("Perangkat tidak ditemukan", 404)
  ;(await assertOrgRole(c, d.org_id, "operator", "admin"))
  const b = await c.req.json()
  let val: number
  if (b.delta != null) {
    const last = await q.get<{ value: number }>("SELECT value FROM iot_readings WHERE device_id = ? ORDER BY at DESC LIMIT 1", d.id)
    const base = last?.value ?? 0
    val = Math.round((base + Number(b.delta)) * 100) / 100
  } else if (b.value != null) {
    val = Number(b.value)
  } else {
    throw bad("Nilai pembacaan (value atau delta) wajib diisi")
  }
  if (!(val >= 0)) throw bad("Nilai pembacaan harus positif")
  const at = b.at ? new Date(b.at).toISOString().replace("T", " ").slice(0, 19) : nowUtc()
  await touch(d, { rssi: b.rssi ?? -58, battery: b.battery ?? 100, firmware: "uji-ui" }, "127.0.0.1", "test_data")
  await q.run("INSERT INTO iot_readings(device_id, at, value) VALUES (?,?,?)", d.id, at, val)
  await markDirty(d.org_id)
  ;(await audit(c, "iot_test_reading", "iot_device", d.id, null, { value: val, at }))
  return c.json(await deviceView(await q.get("SELECT * FROM iot_devices WHERE id = ?", d.id)))
})
// Uji koneksi perangkat dari server: probe perangkat riil via IP/HTTP
iot.post("/iot/:id/test-connection", async (c) => {
  const d = (await q.get("SELECT * FROM iot_devices WHERE id = ?", (await rowId("iot_devices", c.req.param("id")))))
  if (!d) throw bad("Perangkat tidak ditemukan", 404)
  ;(await assertOrgRole(c, d.org_id, "operator", "admin"))

  const now = nowUtc()
  let isConnected = false
  let failMsg = "Perangkat tidak merespon (timeout / tidak terjangkau)"

  // Uji koneksi nyata ke perangkat IoT (bila memiliki IP lokal dan port HTTP)
  if (d.last_ip && !d.last_ip.startsWith("127.") && d.last_ip !== "0.0.0.0") {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 1500)
      const res = await fetch(`http://${d.last_ip}/ping`, { signal: ctrl.signal })
      clearTimeout(t)
      if (res.ok) isConnected = true
    } catch (e: any) {
      isConnected = false
      failMsg = e?.name === "AbortError" ? "Waktu tunggu habis (timeout 1.5 detik)" : `Gagal menghubungi http://${d.last_ip}/ping`
    }
  }

  if (isConnected) {
    await q.run("UPDATE iot_devices SET last_seen_at = ? WHERE id = ?", now, d.id)
    await q.run("INSERT INTO iot_heartbeats(device_id, at, kind, ip) VALUES (?,?,'ping_sukses',?)", d.id, now, d.last_ip)
    await markDirty(d.org_id)
    return c.json({
      ok: true,
      connected: true,
      status: "terhubung",
      message: "Perangkat IoT merespon dengan baik (Terhubung)",
    })
  } else {
    // Tandai perangkat tidak terhubung: mundurkan last_seen_at lebih dari 6 jam (status menjadi 'terputus')
    const disconnectedTime = addDays(todayWIB(), -1) + " 00:00:00"
    await q.run("UPDATE iot_devices SET last_seen_at = ? WHERE id = ?", disconnectedTime, d.id)
    await q.run("INSERT INTO iot_heartbeats(device_id, at, kind, ip) VALUES (?,?,'ping_gagal',?)", d.id, now, d.last_ip)
    await markDirty(d.org_id)
    return c.json({
      ok: false,
      connected: false,
      status: "terputus",
      message: `Perangkat IoT tidak merespon (${failMsg}). Status diubah menjadi Tidak Terhubung (Terputus).`,
    })
  }
})
iot.patch("/iot/:id", async (c) => {
  const d = (await q.get("SELECT * FROM iot_devices WHERE id = ?", (await rowId("iot_devices", c.req.param("id")))))
  if (!d) throw bad("Tidak ditemukan", 404)
  ;(await assertOrgRole(c, d.org_id, "operator", "admin"))
  const b = await c.req.json()
  if (b.status) (await q.run("UPDATE iot_devices SET status = ? WHERE id = ?", b.status, d.id))
  // token baru memutus perangkat lama: harus dipasangkan ulang lewat QR
  if (b.rotate) (await q.run("UPDATE iot_devices SET token = ?, paired_at = NULL, last_seen_at = NULL WHERE id = ?", randomToken(18), d.id))
  if (b.interval_sec) (await q.run("UPDATE iot_devices SET interval_sec = ? WHERE id = ?", Math.min(Math.max(Number(b.interval_sec), 10), 86400), d.id))
  for (const k of ["name", "location"]) if (typeof b[k] === "string" && b[k]) (await q.run(`UPDATE iot_devices SET ${k} = ? WHERE id = ?`, b[k], d.id))
  if (b.category) {
    const def = IOT_CATEGORIES[b.category]
    if (!def) throw bad("Kategori tidak dikenal")
    const n = (await q.get<{ n: number }>("SELECT COUNT(*) AS n FROM iot_readings WHERE device_id = ?", d.id))!.n
    if (n > 0 && b.category !== categoryOf(d)) throw bad("Kategori tidak bisa diubah setelah ada pembacaan — daftarkan perangkat baru agar data lama tidak salah hitung", 409)
    ;(await q.run("UPDATE iot_devices SET category = ?, kind = ?, unit = ?, source = ? WHERE id = ?", b.category, def.kind, def.unit, def.source ?? "pantau", d.id))
  }
  ;(await audit(c, "update", "iot_device", d.id, d, b))
  return c.json(await deviceView(await q.get("SELECT * FROM iot_devices WHERE id = ?", d.id)))
})
// Ubah total meter satu bulan menjadi data aktivitas (Draf) — pengganti input tagihan manual
iot.post("/iot/:id/to-activity", async (c) => {
  const d = (await q.get("SELECT * FROM iot_devices WHERE id = ?", (await rowId("iot_devices", c.req.param("id")))))
  if (!d) throw bad("Tidak ditemukan", 404)
  ;(await assertOrgRole(c, d.org_id, "operator", "admin"))
  const { period } = await c.req.json()
  if (!/^\d{4}-\d{2}$/.test(period ?? "")) throw bad("Periode YYYY-MM wajib")
  const def = IOT_CATEGORIES[categoryOf(d)]
  if (!def.source) throw bad("Sensor ini hanya untuk pemantauan dan tidak menghasilkan data aktivitas karbon", 422)
  d.source = def.source; d.unit = def.unit
  const end = `${period}-${String(daysInMonth(period)).padStart(2, "0")}`
  const daily = (await dailyConsumption(d.id, `${period}-01`, end > todayWIB() ? todayWIB() : end))
  const covered = daily.filter((x) => x.value !== null).length
  if (covered < daily.length * 0.8) throw bad(`Data meter belum lengkap (${covered}/${daily.length} hari)`, 422)
  const total = daily.reduce((s, x) => s + (x.value ?? 0), 0)
  const existing = (await q.get("SELECT * FROM activity_records WHERE org_id = ? AND source = ? AND period = ? AND superseded = 0", d.org_id, d.source, period))
  if (existing && ["diajukan", "terkunci"].includes(existing.status)) throw bad("Data periode ini sedang diverifikasi/terkunci", 409)
  if (existing) (await q.run("UPDATE activity_records SET superseded = 1 WHERE id = ?", existing.id))
  const r = (await q.run("INSERT INTO activity_records(org_id, source, period, quantity, unit, meta, method, revision, parent_id, status, created_by, note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
    d.org_id, d.source, period, Math.round(total * 10) / 10, d.unit, JSON.stringify({ iot_device: d.id, iot_days: covered }), "aktual", (existing?.revision ?? 0) + 1, existing?.id ?? null, "draf", c.get("user").id, `Dari sensor ${d.name}`))
  const rec = (await q.get("SELECT * FROM activity_records WHERE id = ?", Number(r.lastInsertRowid)))!
  ;(await q.run("UPDATE activity_records SET flags = ? WHERE id = ?", JSON.stringify((await validateActivity(rec)).flags.filter((f) => f !== "Tanpa bukti")), rec.id))
  ;(await audit(c, "iot_to_activity", "activity", rec.id, existing ?? null, { total, period }))
  ;(await markDirty(d.org_id))
  return c.json({ id: rec.id, quantity: rec.quantity, days: covered })
})

/** Webhook publik untuk perangkat: POST /api/public/iot/:token  {value, at?} atau {readings:[{at,value}]} */
async function touch(d: any, body: any, ip: string | null, kind: string) {
  const at = nowUtc()
  const rssi = Number.isFinite(Number(body?.rssi)) ? Math.round(Number(body.rssi)) : null
  const battery = Number.isFinite(Number(body?.battery)) ? Number(body.battery) : null
  await q.run("UPDATE iot_devices SET last_seen_at = ?, last_ip = ?, rssi = COALESCE(?, rssi), battery = COALESCE(?, battery), firmware = COALESCE(?, firmware), paired_at = COALESCE(paired_at, ?) WHERE id = ?",
    at, ip, rssi, battery, typeof body?.firmware === "string" ? body.firmware.slice(0, 40) : null, at, d.id)
  await q.run("INSERT INTO iot_heartbeats(device_id, at, kind, rssi, battery, ip) VALUES (?,?,?,?,?,?)", d.id, at, kind, rssi, battery, ip)
}
async function deviceByToken(token: string) {
  const d = await q.get("SELECT * FROM iot_devices WHERE token = ?", token)
  if (!d) throw bad("Token perangkat tidak valid", 403)
  if (d.status !== "aktif") throw bad("Perangkat dinonaktifkan", 409)
  return d
}
/** Handshake pairing: perangkat memanggil ini setelah scan QR → menerima konfigurasi. */
export async function pairIot(token: string, body: any, ip: string | null) {
  const d = await deviceByToken(token)
  await touch(d, body, ip, "pair")
  return { ok: true, device: { id: d.id, name: d.name, kind: d.kind, unit: d.unit }, interval_sec: d.interval_sec ?? 300, server_time: new Date().toISOString() }
}
/** Heartbeat tanpa data: POST /api/public/iot/:token/ping {rssi?, battery?, firmware?} */
export async function pingIot(token: string, body: any, ip: string | null) {
  const d = await deviceByToken(token)
  await touch(d, body, ip, "ping")
  return { ok: true, interval_sec: d.interval_sec ?? 300, server_time: new Date().toISOString() }
}
export async function ingestIot(token: string, body: any, ip: string | null = null) {
  const d = await deviceByToken(token)
  await touch(d, body, ip, "data")
  const list: { at?: string; value: number }[] = Array.isArray(body?.readings) ? body.readings : [body]
  let n = 0
  for (const r of list.slice(0, 1000)) {
    const v = Number(r.value)
    if (!(v >= 0)) continue
    const at = r.at ? new Date(r.at).toISOString().replace("T", " ").slice(0, 19) : nowUtc()
    ;(await q.run("INSERT INTO iot_readings(device_id, at, value) VALUES (?,?,?)", d.id, at, v))
    n++
  }
  if (n > 0) {
    await markDirty(d.org_id)
  }
  return { ok: true, stored: n, interval_sec: d.interval_sec ?? 300 }
}
