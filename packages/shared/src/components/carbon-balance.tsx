import { useMemo, useState, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"
import { Delta, StatTile } from "@/components/dash-kit"
import { CountUp } from "@/components/interactive-charts"
import { num } from "@/lib/format"
import { tl } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/**
 * Neraca karbon sederhana (emisi vs imbal jasa pohon).
 * Asumsi baku: 1 pohon dewasa menyerap ±22 kg CO₂/tahun (rujukan umum EEA / Arbor Day; rentang 10–40 kg tergantung jenis & umur).
 * Bila buku engine punya angka serapan terukur (model riap per pohon), angka itu yang dipakai untuk "sudah diserap".
 */
export const TREE_KG_PER_YEAR = 22

export type BalanceInput = {
  emissionKg: number
  days: number
  treeCount: number
  /** serapan terukur dari buku engine untuk periode yang sama (kg CO₂); null → pakai asumsi baku */
  absorbedKg?: number | null
  bySource?: Record<string, number>
}

export function carbonBalance({ emissionKg, days, treeCount, absorbedKg, bySource }: BalanceInput) {
  const d = Math.max(1, days)
  const perTreePeriod = (TREE_KG_PER_YEAR * d) / 365
  const absorbedAssumed = treeCount * perTreePeriod
  const measured = absorbedKg !== null && absorbedKg !== undefined && absorbedKg > 0
  const absorbed = measured ? absorbedKg! : absorbedAssumed
  // pohon yang dibutuhkan agar serapan periode yang sama = emisi periode itu (laju berkelanjutan)
  const needTrees = emissionKg > 0 ? Math.ceil(emissionKg / perTreePeriod) : 0
  // pohon yang dibutuhkan untuk menebus emisi periode ini dalam 1 tahun
  const needTreesYear = emissionKg > 0 ? Math.ceil(emissionKg / TREE_KG_PER_YEAR) : 0
  const balance = absorbed - emissionKg // < 0 = utang karbon
  const offsetShare = emissionKg > 0 ? absorbed / emissionKg : 0
  const treeGap = Math.max(0, needTrees - treeCount)
  const sources = Object.entries(bySource ?? {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  return { days: d, perTreePeriod, absorbed, measured, absorbedAssumed, needTrees, needTreesYear, balance, offsetShare, treeGap, sources, emissionKg, treeCount }
}
export type Balance = ReturnType<typeof carbonBalance>

const fmtKg = (v: number) => (Math.abs(v) >= 1000 ? `${num(v / 1000, 2)} t` : `${num(v, Math.abs(v) < 10 ? 2 : 0)} kg`)

/* ---------------- statistik neraca ---------------- */

const big = (v: number) => (Math.abs(v) >= 1000 ? { v: num(Math.abs(v) / 1000, 2), u: "t" } : { v: num(Math.abs(v), Math.abs(v) < 10 ? 2 : 0), u: "kg" })

/** 4 statistik neraca karbon: rekap emisi · pohon dibutuhkan · sudah diserap · defisit/surplus. */
export function CarbonBalanceStats({ input, periodLabel, onEmission, onTrees, header, loading }: { input: BalanceInput; periodLabel: string; org?: string; onEmission?: () => void; onTrees?: () => void; header?: ReactNode; loading?: boolean }) {
  const key = JSON.stringify(input)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const b = useMemo(() => carbonBalance(input), [key])
  const deficit = b.balance < 0
  const em = big(b.emissionKg), ab = big(b.absorbed), bal = big(b.balance)
  const foot = (s: ReactNode, cls = "text-muted-foreground") => <span className={cn("text-[0.8125rem]", cls)}>{s}</span>
  return (
    <div className="space-y-3">
      {header && <div className="flex flex-col gap-3 pt-1 lg:flex-row lg:items-end lg:justify-between">{header}</div>}
      <div className={cn("grid gap-5 transition-opacity sm:grid-cols-2 xl:grid-cols-4", loading && "opacity-60")}>
        <StatTile title={tl("Rekap emisi karbon", "Carbon emissions")} unit={`${em.u} CO₂e`} onClick={onEmission}
          value={<CountUp value={Number(em.u === "t" ? b.emissionKg / 1000 : b.emissionKg)} format={(v) => num(v, em.u === "t" ? 2 : 0)} />}
          foot={foot(tl(`${periodLabel} · ${b.days} hari · ${fmtKg(b.emissionKg / b.days)}/hari`, `${periodLabel} · ${b.days} days · ${fmtKg(b.emissionKg / b.days)}/day`))} />
        <StatTile title={tl("Pohon dibutuhkan", "Trees needed")} unit={tl("pohon", "trees")} onClick={onTrees}
          value={<CountUp value={b.needTrees} format={(v) => num(v, 0)} />}
          foot={foot(tl(`untuk offset · asumsi ${TREE_KG_PER_YEAR} kg CO₂/pohon/tahun`, `to offset · assumes ${TREE_KG_PER_YEAR} kg CO₂/tree/yr`))} />
        <StatTile title={tl("Emisi sudah diserap", "Already absorbed")} unit={`${ab.u} CO₂`} onClick={onTrees}
          value={<CountUp value={ab.u === "t" ? b.absorbed / 1000 : b.absorbed} format={(v) => num(v, ab.u === "t" ? 2 : b.absorbed < 10 ? 2 : 0)} />}
          foot={b.treeCount > 0 ? <Delta value={`+${num(Math.min(b.offsetShare, 9.99) * 100, 1)}%`} good text={tl(`${num(b.treeCount)} pohon ${b.measured ? "· terukur" : "· asumsi"}`, `${num(b.treeCount)} trees ${b.measured ? "· measured" : "· assumed"}`)} /> : foot(tl("Belum ada pohon tercatat", "No trees recorded yet"))} />
        <StatTile featured title={deficit ? tl("Defisit / utang karbon", "Carbon deficit") : tl("Surplus karbon", "Carbon surplus")} unit={`${bal.u} CO₂e`}
          value={<span>{deficit ? "−" : "+"}<CountUp value={bal.u === "t" ? Math.abs(b.balance) / 1000 : Math.abs(b.balance)} format={(v) => num(v, bal.u === "t" ? 2 : 0)} /></span>}
          foot={foot(deficit ? tl(`kurang ±${num(b.treeGap)} pohon · serapan menutup ${num(b.offsetShare * 100, 1)}%`, `about ${num(b.treeGap)} trees short · uptake covers ${num(b.offsetShare * 100, 1)}%`) : tl("serapan pohon melampaui emisi", "tree uptake exceeds emissions"), "text-white/80")} />
      </div>
    </div>
  )
}

/** Baris informasi ringkas (opsional). */
export function InsightBar({ lead }: { balance?: Balance; org?: string; periodLabel?: string; lead?: ReactNode }) {
  if (!lead) return null
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-card px-5 py-3 ring-1 ring-border">
      <div className="min-w-0 flex-1 text-sm text-muted-foreground">{lead}</div>
    </div>
  )
}

/** Bagian lipat untuk analisis lanjutan — dasbor tetap ringkas, detail tersedia saat dibutuhkan. */
export function MoreSection({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="space-y-5 pt-2">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-3 rounded-2xl bg-card px-5 py-4 text-left ring-1 ring-border transition-colors hover:bg-muted/40">
        <span className="text-lg font-semibold tracking-tight">{title}</span>
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">{open ? tl("Sembunyikan", "Hide") : tl("Tampilkan", "Show")}<ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} /></span>
      </button>
      {open && children}
    </section>
  )
}
