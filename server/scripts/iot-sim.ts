// Simulator perangkat IoT (meniru ESP32 + meter kWh kumulatif).
// Pakai:  bun run iot:sim <token> [--url http://localhost:3000] [--interval 10]
// Alur sama dengan perangkat asli: pair → kirim pembacaan tiap interval (detik). Ctrl+C untuk berhenti (status jadi Terputus).
import { CONFIG } from "../src/config"
const args = process.argv.slice(2)
const token = args.find((a) => !a.startsWith("--"))
const opt = (k: string, d: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d }
if (!token) { console.error("Pakai: bun run iot:sim <token> [--url http://localhost:3000] [--interval 10]"); process.exit(1) }
const base = `${opt("url", CONFIG.SIM_URL)}/api/public/iot/${token}`
let interval = Number(opt("interval", "10"))
let kwh = Number(opt("start", String(48000 + Math.round(Math.random() * 500))))
const post = async (path: string, body: unknown) => {
  const r = await fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const j: any = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`${r.status} ${j.error ?? ""}`)
  return j
}
const meta = () => ({ rssi: -55 - Math.round(Math.random() * 15), battery: 100, firmware: "SIM-ESP32 v1.0" })
const pair = await post("/pair", meta())
console.log(`✓ Terpasang sebagai "${pair.device.name}" (#${pair.device.id}). Interval server ${pair.interval_sec}s; simulator kirim tiap ${interval}s.`)
const tick = async () => {
  kwh += 0.02 + Math.random() * 0.05
  try {
    const r = await post("", { value: Math.round(kwh * 100) / 100, ...meta() })
    console.log(`${new Date().toLocaleTimeString("id-ID")}  kirim ${kwh.toFixed(2)} kWh → disimpan ${r.stored}`)
  } catch (e) { console.error("✗ gagal kirim:", (e as Error).message) }
}
await tick()
setInterval(tick, interval * 1000)
