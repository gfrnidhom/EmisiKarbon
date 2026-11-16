import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { ArrowDown, ArrowUp, ArrowUpRight, Calculator, Footprints, Leaf, Plus, Sprout } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ErrorState, PageSkeleton } from "@/components/common"
import { CountUp } from "@/components/interactive-charts"
import { UserAvatar } from "@/components/profile-dialog"
import { api } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { fmtDate, fmtMonth, num, pct } from "@/lib/format"
import { tl } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { SECTORS, sectorLabel, suggestions } from "./lib"

const TREE_KG_MONTH = 0.12 * 30
const card = "rounded-[1.75rem] bg-card p-6 shadow-sm dark:ring-1 dark:ring-white/[0.04]"
const pill = "rounded-full bg-muted px-3.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted/70"

/** Garis putus + titik (lollipop) per bulan; titik terakhir disorot. */
function Lollipop({ values }: { values: number[] }) {
  const max = Math.max(...values, 1)
  return (
    <div className="flex h-24 items-end justify-between gap-1">
      {values.map((v, i) => {
        const last = i === values.length - 1
        return (
          <div key={i} className="relative flex h-full flex-1 flex-col items-center justify-end">
            <span className={cn("absolute inset-y-0 w-px border-l border-dashed", last ? "border-primary" : "border-border")} />
            <span className={cn("relative z-10 rounded-full transition-all", last ? "size-4 bg-primary ring-4 ring-primary/20" : "size-3 bg-primary/20")} style={{ marginBottom: `${(v / max) * 70}%` }} />
          </div>
        )
      })}
    </div>
  )
}
/** Matriks titik per bulan (setiap titik = satuan kg); kolom terpilih penuh warna utama. */
function DotMatrix({ months, selected, onSelect }: { months: { key: string; label: string; value: number | null }[]; selected?: string; onSelect: (k: string) => void }) {
  const max = Math.max(...months.map((m) => m.value ?? 0), 1)
  const rows = 10
  const unit = Math.ceil(max / rows / 10) * 10 || 10
  const ticks = [rows, rows * 0.75, rows * 0.5, rows * 0.25, 0].map((r) => Math.round(r * unit))
  return (
    <div className="grid grid-cols-[3rem_1fr] gap-3">
      <div className="flex flex-col justify-between pb-8 text-right text-xs text-muted-foreground tabular">{ticks.map((t) => <span key={t}>{num(t, 0)}</span>)}</div>
      <div className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 bottom-8 flex flex-col justify-between">{ticks.map((t) => <span key={t} className="border-t border-dashed border-border" />)}</div>
        <div className="relative grid h-72 grid-cols-12 gap-1 sm:gap-2">
          {months.map((m) => {
            const n = m.value ? Math.max(1, Math.round(m.value / unit)) : 0
            const sel = m.key === selected
            return (
              <button key={m.key} onClick={() => m.value && onSelect(m.key)} disabled={!m.value} className="group relative flex h-full flex-col items-center justify-end pb-8" title={m.value ? `${m.label}: ${num(m.value, 0)} kg` : m.label}>
                {sel && <span className="absolute top-0 bottom-8 left-1/2 w-px -translate-x-1/2 border-l-2 border-dashed border-primary/60" />}
                {sel && m.value && <span className="absolute z-20 -translate-y-full rounded-full bg-primary px-2 py-0.5 text-[0.625rem] font-semibold whitespace-nowrap text-primary-foreground" style={{ bottom: `calc(${(n / rows) * 100}% * (1 - 32px / 288px) + 40px)` }}>{num(m.value, 0)} kg</span>}
                <div className="relative z-10 flex w-full flex-col-reverse items-center gap-[3px]">
                  {Array.from({ length: Math.min(n, rows) }).map((_, i) => (
                    <span key={i} className={cn("aspect-square w-full max-w-7 rounded-full transition-colors", sel ? (i === Math.min(n, rows) - 1 ? "bg-primary ring-4 ring-primary/25" : "bg-primary") : "bg-primary/14 group-hover:bg-primary/30")} />
                  ))}
                </div>
                <span className={cn("absolute bottom-0 text-xs sm:text-sm", sel ? "font-semibold text-foreground" : "text-muted-foreground")}>{m.label}</span>
              </button>
            )
          })}
        </div>
        <p className="mt-1 text-right text-[0.6875rem] text-muted-foreground">1 {tl("titik", "dot")} ≈ {num(unit, 0)} kg CO₂e</p>
      </div>
    </div>
  )
}
function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", on ? "bg-primary" : "bg-muted ring-1 ring-border")}>
      <span className={cn("absolute top-1 size-5 rounded-full bg-white shadow transition-all", on ? "left-6" : "left-1")} />
    </button>
  )
}

/** Ringkasan jejak karbon pribadi — tata letak dasbor konsumen, warna hijau Sekolah Lestari. */
export default function FootprintOverview() {
  const { me } = useAuth()
  const nav = useNavigate()
  const { data, isLoading, error } = useQuery({ queryKey: ["footprint"], queryFn: () => api<any>("/me/footprint") })
  const entries: any[] = data?.entries ?? []
  const [year, setYear] = useState<string | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const commitKey = `jh.commit.${me?.id}`
  const [commits, setCommits] = useState<Record<string, boolean>>({})
  useEffect(() => { try { setCommits(JSON.parse(localStorage.getItem(commitKey) ?? "{}")) } catch { /* noop */ } }, [commitKey])
  const toggleCommit = (id: string, v: boolean) => { const n = { ...commits, [id]: v }; setCommits(n); try { localStorage.setItem(commitKey, JSON.stringify(n)) } catch { /* noop */ } }
  const years = useMemo(() => [...new Set(entries.map((e) => e.period.slice(0, 4)))].sort().reverse(), [entries])
  const yr = year ?? years[0]

  if (isLoading) return <PageSkeleton />
  if (error) return <ErrorState error={error} />
  const ref = data.reference
  const first = me?.name.split(" ")[0] ?? ""

  if (!entries.length) return (
    <div className="mx-auto max-w-3xl py-10 text-center">
      <span className="mx-auto flex size-16 items-center justify-center rounded-3xl bg-primary text-primary-foreground"><Footprints className="size-7" /></span>
      <h1 className="mt-6 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">{tl(`Selamat datang, ${first}`, `Welcome, ${first}`)}</h1>
      <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">{tl("Hitung jejak karbonmu dalam 5 langkah singkat: rumah, transportasi, penerbangan, makanan, dan sampah.", "Calculate your footprint in 5 quick steps: home, transport, flights, food and waste.")}</p>
      <Button size="lg" className="mt-8 h-13 px-8 text-base" render={<Link to="/footprint/calculate" />}><Calculator /> {tl("Mulai hitung", "Start calculating")}</Button>
    </div>
  )

  const last = entries[entries.length - 1]
  const cur = entries.find((e) => e.period === sel) ?? last
  const prev = entries[entries.indexOf(cur) - 1]
  const change = prev?.total ? cur.total / prev.total - 1 : null
  const yearT = (cur.total * 12) / 1000
  const avgId = ref.averages.find((a: any) => a.k === "id")?.tPerYear ?? 2.6
  const vsId = yearT / avgId - 1
  const sectorVals = Object.keys(SECTORS).map((k) => ({ k, v: cur.sectors[k] ?? 0 }))
  const maxSector = Math.max(...sectorVals.map((s) => s.v), 1)
  const topSector = [...sectorVals].sort((a, b) => b.v - a.v)[0]
  const personal = (cur.sectors.transport ?? 0) + (cur.sectors.flight ?? 0) + (cur.sectors.food ?? 0)
  const personalShare = cur.total ? personal / cur.total : 0
  const monthsOfYear = Array.from({ length: 12 }, (_, i) => { const k = `${yr}-${String(i + 1).padStart(2, "0")}`; const e = entries.find((x) => x.period === k); return { key: k, label: fmtDate(`${k}-01`, { month: "short" }).replace(".", ""), value: e?.total ?? null } })
  const tips = suggestions(cur.data, cur, ref).slice(0, 4)
  const committed = tips.filter((t) => commits[t.id]).reduce((s, t) => s + t.kg, 0)
  const level = yearT <= 2.5 ? { id: "Rendah", en: "Low", cls: "bg-primary/12 text-primary" } : yearT <= avgId * 1.5 ? { id: "Sedang", en: "Moderate", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" } : { id: "Tinggi", en: "High", cls: "bg-red-500/12 text-red-700 dark:text-red-300" }
  const mainMode = [...(cur.data.transport ?? [])].sort((a: any, b: any) => b.kmWeek - a.kmWeek)[0]

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <div className="min-w-0 space-y-6">
        {/* ---------- sapaan ---------- */}
        <div className="flex flex-col gap-5 pt-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{tl(`Selamat datang, ${first}`, `Welcome back, ${first}`)}</h1>
            <p className="mt-3 text-[1.0625rem] text-muted-foreground">{tl(`Ini ringkasan jejak karbonmu untuk ${fmtMonth(cur.period)}.`, `Here's your carbon footprint for ${fmtMonth(cur.period)}.`)}</p>
          </div>
          <Button size="lg" className="h-13 shrink-0 px-7 text-base shadow-lg shadow-primary/20" render={<Link to="/footprint/calculate" />}><Plus /> {tl("Hitung bulan ini", "Calculate this month")}</Button>
        </div>

        {/* ---------- 3 kartu ---------- */}
        <div className="grid gap-5 md:grid-cols-3">
          <div className={card}>
            <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">{tl("Emisi bulan ini", "This month")}</span><Link to={`/footprint/calculate?bulan=${cur.period}`} className={pill}>{tl("Lihat rincian", "View details")}</Link></div>
            <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-5xl font-semibold tracking-tight tabular"><CountUp value={cur.total} format={(v) => num(v, 0)} /></span>
              <span className="text-sm text-muted-foreground">kg CO₂e</span>
              {change !== null && <span className="flex items-center gap-1 text-sm">{change <= 0 ? <ArrowDown className="size-4 text-primary" /> : <ArrowUp className="size-4 text-amber-600" />}<b>{pct(Math.abs(change), 0)}</b><span className="text-muted-foreground">{tl("vs bulan lalu", "vs last month")}</span></span>}
            </div>
            <div className="mt-6"><Lollipop values={entries.slice(-10).map((e) => e.total)} /></div>
          </div>

          <div className="relative overflow-hidden rounded-[1.75rem] bg-primary p-6 text-primary-foreground shadow-lg shadow-primary/25">
            <div className="flex items-center justify-between"><span className="text-sm opacity-80">{tl("Perkiraan setahun", "Yearly estimate")}</span><span className="rounded-full bg-white/15 px-3.5 py-1.5 text-xs font-medium">t CO₂e</span></div>
            <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-5xl font-semibold tracking-tight tabular"><CountUp value={yearT} format={(v) => num(v, 2)} /></span>
              <span className="flex items-center gap-1 text-sm">{vsId <= 0 ? <ArrowDown className="size-4" /> : <ArrowUp className="size-4" />}<b>{pct(Math.abs(vsId), 0)}</b><span className="opacity-80">{tl("vs rata-rata ID", "vs ID average")}</span></span>
            </div>
            <div className="mt-6 flex h-24 items-end gap-2">
              {sectorVals.map((s) => (
                <div key={s.k} className="flex flex-1 flex-col items-center gap-1.5" title={`${sectorLabel(s.k)}: ${num(s.v, 0)} kg`}>
                  <div className={cn("w-full rounded-full transition-all duration-700", s.k === topSector.k ? "bg-amber-300" : "bg-white/25")} style={{ height: `${Math.max(12, (s.v / maxSector) * 80)}px` }} />
                  {(() => { const I = SECTORS[s.k].icon; return <I className="size-3.5 opacity-80" /> })()}
                </div>
              ))}
            </div>
          </div>

          <div className={card}>
            <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">{tl("Pribadi vs rumah", "Personal vs home")}</span><span className={pill}>{cur.household} {tl("orang", "people")}</span></div>
            <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-5xl font-semibold tracking-tight tabular">{num(cur.total / TREE_KG_MONTH, 0)}</span>
              <span className="text-sm text-muted-foreground">{tl("pohon untuk menyerapnya", "trees to absorb it")}</span>
            </div>
            <div className="mt-6 flex h-24 overflow-hidden rounded-2xl bg-primary/8">
              <div className="flex items-center justify-center border-r-2 border-card text-xl font-semibold text-primary" style={{ width: `${Math.max(personalShare * 100, 18)}%`, backgroundImage: "repeating-linear-gradient(135deg, color-mix(in srgb, var(--primary) 55%, transparent) 0 2.5px, transparent 2.5px 9px)" }}>
                <span className="rounded-full bg-card/90 px-2.5 py-0.5">{pct(personalShare, 0)}</span>
              </div>
              <div className="flex flex-1 items-center justify-center text-xl font-semibold text-primary">{pct(1 - personalShare, 0)}</div>
            </div>
            <div className="mt-2 flex justify-between text-xs text-muted-foreground"><span>{tl("Transportasi, terbang, makanan", "Travel, flights, food")}</span><span>{tl("Listrik, LPG, sampah", "Power, LPG, waste")}</span></div>
          </div>
        </div>

        {/* ---------- grafik matriks titik ---------- */}
        <div className={cn(card, "p-6 sm:p-8")}>
          <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">{tl("Jejak karbon bulanan", "Monthly footprint")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{tl(`${fmtMonth(`${yr}-01`)} – ${fmtMonth(`${yr}-12`)} · klik kolom untuk melihat bulan itu`, `${fmtMonth(`${yr}-01`)} – ${fmtMonth(`${yr}-12`)} · click a column to view that month`)}</p>
            </div>
            <div className="flex gap-1 rounded-full bg-muted p-1">{years.map((y) => <button key={y} onClick={() => setYear(y)} className={cn("rounded-full px-3.5 py-1.5 text-sm font-medium", y === yr ? "bg-card shadow-sm" : "text-muted-foreground")}>{y}</button>)}</div>
          </div>
          <DotMatrix months={monthsOfYear} selected={cur.period} onSelect={setSel} />
        </div>
      </div>

      {/* ---------- kolom kanan ---------- */}
      <aside className="space-y-6">
        <div className={card}>
          <div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-semibold">{tl("Komitmen aksi", "Action commitments")}</h2><span className={cn(pill, "bg-primary/10 text-primary")}>−{num(committed, 0)} kg/{tl("bln", "mo")}</span></div>
          <div className="space-y-3">
            {tips.length === 0 && <p className="rounded-2xl bg-muted/50 p-4 text-sm text-muted-foreground">{tl("Lengkapi kalkulator untuk mendapat saran aksi.", "Complete the calculator to get action ideas.")}</p>}
            {tips.map((tp) => (
              <div key={tp.id} className={cn("rounded-2xl p-4 transition-colors", commits[tp.id] ? "bg-primary/8" : "bg-muted/50")}>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1"><div className="text-[0.9375rem] leading-snug font-medium">{tl(tp.id, tp.en)}</div><div className="mt-1 text-xs text-muted-foreground">{tl("hemat", "saves")} ±{num(tp.kg, 1)} kg CO₂e/{tl("bulan", "month")}</div></div>
                  <Toggle on={!!commits[tp.id]} onChange={(v) => toggleCommit(tp.id, v)} label={tl("Ambil komitmen", "Commit")} />
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="flex size-9 items-center justify-center rounded-full bg-card text-primary ring-1 ring-border"><tp.icon className="size-4" /></span>
                  <span className={cn("rounded-full px-2.5 py-1 text-[0.6875rem] font-medium", commits[tp.id] ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground ring-1 ring-border")}>{commits[tp.id] ? tl("Berkomitmen", "Committed") : tl("Belum", "Not yet")}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={card}>
          <h2 className="mb-5 text-xl font-semibold">{tl("Profil jejakmu", "Your footprint profile")}</h2>
          <div className="flex items-center gap-4">
            <UserAvatar name={me?.name ?? ""} className="size-20 text-2xl" />
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold">{me?.name}</div>
              <div className="text-sm text-muted-foreground">{tl("Data", "Data")} {fmtMonth(cur.period)}</div>
              <span className={cn("mt-2 inline-flex rounded-full px-3 py-1 text-xs font-semibold", level.cls)}>{tl(`Jejak ${level.id.toLowerCase()}`, `${level.en} footprint`)}</span>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-3 divide-x divide-border text-sm">
            <div className="pr-3"><div className="text-xs text-muted-foreground">{tl("Penghuni", "Household")}</div><div className="mt-1 text-xl font-semibold">{cur.household}</div></div>
            <div className="min-w-0 px-3"><div className="text-xs text-muted-foreground">{tl("Terbesar", "Largest")}</div><div className="mt-1.5 text-base leading-tight font-semibold">{sectorLabel(topSector.k).split(" (")[0]}</div></div>
            <div className="pl-3"><div className="text-xs text-muted-foreground">t/{tl("tahun", "yr")}</div><div className="mt-1 text-xl font-semibold tabular">{num(yearT, 1)}</div></div>
          </div>
          <dl className="mt-5 space-y-3 rounded-2xl bg-muted/50 p-4 text-sm">
            {[
              [tl("Terakhir dihitung", "Last calculated"), fmtDate(last.updated_at)],
              [tl("Listrik", "Electricity"), `${num(cur.kwh ?? 0, 0)} kWh/${tl("bln", "mo")}`],
              [tl("Kendaraan utama", "Main transport"), mainMode ? `${ref.transport.find((x: any) => x.k === mainMode.mode)?.label ?? mainMode.mode} · ${mainMode.kmWeek} km/${tl("mgg", "wk")}` : "–"],
              [tl("Rata-rata Indonesia", "Indonesia average"), `${num(avgId, 1)} t/${tl("tahun", "yr")}`],
            ].map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-muted-foreground">{k}</dt><dd className="truncate text-right font-medium">{v}</dd></div>)}
          </dl>
        </div>

        <button onClick={() => nav("/footprint/calculate")} className="group relative block h-56 w-full overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-primary to-primary-deep p-6 text-left text-white">
          <div className="pointer-events-none absolute inset-0 opacity-80" style={{ backgroundImage: "repeating-radial-gradient(circle at 85% 30%, transparent 0 16px, rgb(255 255 255 / 0.07) 16px 18px)" }} />
          <Leaf className="pointer-events-none absolute -right-6 -bottom-6 size-48 rotate-12 text-white/10" />
          <span className="relative inline-flex items-center gap-1.5 rounded-full bg-white/15 px-4 py-2 text-sm font-medium backdrop-blur"><Sprout className="size-4" />{tl("Tantangan 30 hari", "30-day challenge")}</span>
          <div className="absolute inset-x-6 bottom-6 flex items-end justify-between gap-4">
            <span className="text-2xl leading-tight font-semibold">{tl("Kurangi 10% jejakmu bulan depan", "Cut your footprint 10% next month")}</span>
            <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/40 backdrop-blur transition-transform group-hover:rotate-45"><ArrowUpRight className="size-6" /></span>
          </div>
        </button>
      </aside>
    </div>
  )
}
