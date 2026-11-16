// Audit buku engine (hanya baca): angka tersimpan = hitungan engine, mulai dari data pertama, hari ini sementara, tanpa masa depan.
import { q } from "../src/db"
import { addDays, todayWIB } from "../src/lib"
import { computeDay, loadContext } from "../src/engine/engine"
import { dataStartDate, isLocked, readDays } from "../src/engine/ledger"
const ORG = Number(process.argv[2] ?? 1)
const today = todayWIB()
const ctx = await loadContext(ORG)
const first = await dataStartDate(ORG)
const days = await readDays(ORG, addDays(today, -60), addDays(today, 5))
let worst = 0, n = 0
for (const d of days.filter((x) => x.closed)) { worst = Math.max(worst, Math.abs(computeDay(ctx, d.date).total - d.total)); n++ }
const t = days.find((d) => d.date === today)
const c = (sql: string, ...p: any[]) => q.get<{ n: number; d?: string }>(sql, ...p)
console.log({
  dataPertama: first,
  hariPalingAwalDiDB: (await c("SELECT MIN(date) AS d, COUNT(*) AS n FROM day_ledger WHERE org_id = ?", ORG))!.d,
  barisSebelumDataPertama: (await c("SELECT COUNT(*) AS n FROM day_ledger WHERE org_id = ? AND date < ?", ORG, first ?? "9999"))!.n,
  barisMasaDepan: (await c("SELECT COUNT(*) AS n FROM day_ledger WHERE org_id = ? AND date > ?", ORG, today))!.n,
  hariFinalDicek: n, selisihMaksKg: +worst.toFixed(6),
  hariIni: t ? { status: t.partial ? "sementara" : "final", porsi: t.fraction && +t.fraction.toFixed(3), kg: +t.total.toFixed(1), diperbarui: t.closedAt } : "belum ada baris",
  bulanLaluTerkunci: isLocked(addDays(today.slice(0, 8) + "01", -1)), duaBulanLaluTerkunci: isLocked(addDays(today.slice(0, 8) + "01", -40)),
})
process.exit(0)
