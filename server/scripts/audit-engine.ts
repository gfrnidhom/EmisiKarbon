// Audit engine harian & baseline: konservasi bulanan dan konsistensi komponen baseline (hanya baca).
import { q } from "../src/db"
import { computeRange, loadContext } from "../src/engine/engine"
import { aggregateComponents } from "../src/engine/services"

const ORG = Number(process.argv[2] ?? 1)
const ctx = await loadContext(ORG)
const F: Record<string, number> = { listrik: ctx.fe.EL_JAMALI.value, lpg: ctx.fe.LPG_BI.value, kertas: ctx.fe.PAPER_RIM.value, genset: ctx.fe.FUEL_SOLAR_IPCC.value * ctx.fe.B40_FOSIL.value + Math.max(ctx.fe.SOLAR_BI.value - ctx.fe.FUEL_SOLAR_IPCC.value, 0) }
const months = (await q.all("SELECT DISTINCT period FROM activity_records WHERE org_id = ? AND superseded = 0 AND source IN ('listrik','lpg','kertas','genset') ORDER BY period", ORG)).map((r) => r.period)
let worst = 0
console.log("== Konservasi: Σ harian vs data bulanan × faktor ==")
for (const ym of months) {
  const [y, m] = ym.split("-").map(Number)
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
  const days = await computeRange(ORG, ym + "-01", end, ctx)
  const row: string[] = []
  for (const src of Object.keys(F)) {
    const rec = ctx.records.get(`${src}:${ym}`)
    if (!rec) continue
    const sum = days.reduce((s, d) => s + (d.sources[src]?.kg ?? 0), 0)
    const exp = rec.quantity * F[src]
    const err = exp ? Math.abs(sum - exp) / exp * 100 : 0
    worst = Math.max(worst, err)
    row.push(`${src} ${sum.toFixed(1)}/${exp.toFixed(1)}${err > 0.01 ? ` ✗${err.toFixed(2)}%` : " ✓"}`)
  }
  console.log(ym, row.join(" · "))
}
console.log("deviasi maks:", worst.toFixed(4) + "%")

console.log("\n== Baseline: komponen tersimpan vs hitung ulang (mode baseline) ==")
const b = await q.get("SELECT * FROM baselines WHERE org_id = ? ORDER BY version DESC LIMIT 1", ORG)
if (b) {
  const bctx = await loadContext(ORG, { baselineMode: true })
  const days = await computeRange(ORG, b.period_start, b.period_end, bctx)
  const agg = aggregateComponents(days)
  const stored = await q.all("SELECT * FROM baseline_components WHERE baseline_id = ?", b.id)
  console.log(`${b.version_label} ${b.status} ${b.period_start}..${b.period_end} · ${days.length} hari, ${days.filter((d) => d.k > 0).length} aktif · FE ${b.fe_version}`)
  // sampah dipecah: ke TPA (Scope 3) + diolah di sekolah (Scope 1) — baseline lama menyimpannya sebagai satu "sampah"
  const legacySplit = !stored.some((x: any) => x.source === "sampah_lokal") && agg.sampah_lokal
  for (const s of stored) {
    const a = s.source === "sampah" && legacySplit ? { ...agg.sampah, total: agg.sampah.total + agg.sampah_lokal.total } : agg[s.source]
    const d = a ? (a.total - s.total_kg) / Math.max(s.total_kg, 1e-9) * 100 : NaN
    console.log(`  ${s.source.padEnd(11)} tersimpan ${s.total_kg.toFixed(1).padStart(9)} kg · ulang ${a?.total.toFixed(1).padStart(9)} kg · Δ ${d.toFixed(2)}% · aktif/hari ${s.daily_active_kg.toFixed(2)} · libur/hari ${s.daily_holiday_kg.toFixed(2)} · ${s.method}`)
  }
  const tot = stored.reduce((s, x) => s + x.total_kg, 0)
  console.log(`  total ${(tot / 1000).toFixed(2)} t CO2e · per orang/th ${(tot / days.length * 365 / (b.population || 1)).toFixed(1)} kg (pop ${b.population})`)
}
process.exit(0)
