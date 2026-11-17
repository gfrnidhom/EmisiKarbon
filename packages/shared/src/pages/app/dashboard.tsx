import { useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import {
  BarChart3, CalendarDays, Flame, Gauge as GaugeIcon, Info, Layers, Leaf, LineChart, Mountain,
  Pause, Plus, Recycle, RefreshCw, Sigma, Sparkles, Target, TriangleAlert,
} from "lucide-react"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { CarbonBalanceStats, MoreSection } from "@/components/carbon-balance"
import { PeriodFilter, usePeriod } from "@/components/period-filter"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState, PageSkeleton } from "@/components/common"
import { CalendarHeatmap, CountUp, EmissionExplorer, Gauge, InteractiveDonut, type ExplorerMode } from "@/components/interactive-charts"
import { TraceSheet } from "@/components/trace-sheet"
import { api } from "@/lib/api"
import { useOrg } from "@/lib/hooks"
import { useAuth } from "@/lib/auth"
import { addDays, fmtDate, kg, num, groupByScope, pct, signedPct, SOURCES, todayWIB, ton } from "@/lib/format"
import { cn } from "@/lib/utils"
import { t as tr, tl } from "@/lib/i18n"
import { PillBars, SRC_ICON } from "@/components/dash-kit"
import { ScopeHeading } from "@/components/scope-group"

const RANGES = [{ v: "7", l: tl("7H", "7D") }, { v: "30", l: tl("30H", "30D") }, { v: "90", l: tl("90H", "90D") }, { v: "365", l: tl("1T", "1Y") }]
export default function Dashboard() {
  const { orgId, me } = useAuth()
  const { org: orgInfo } = useOrg()
  // Kepala sekolah hanya melihat — tombol input disembunyikan
  const canInput = !!me?.roles.some((r) => ["admin", "operator", "petugas"].includes(r.role) && (r.role === "admin" || r.org_id === orgId))
  const nav = useNavigate()
  const { data: d, isLoading, error, refetch, dataUpdatedAt, isFetching } = useQuery({ queryKey: ["dashboard", orgId], queryFn: () => api<any>(`/orgs/${orgId}/dashboard`), enabled: !!orgId, refetchInterval: 60_000 })
  const [range, setRange] = useState("30")
  const [mode, setMode] = useState<ExplorerMode>("scope")
  const [chartType, setChartType] = useState<"area" | "bar">("bar")
  const [showBaseline, setShowBaseline] = useState(true)
  const [showAverage, setShowAverage] = useState(false)
  const [focus, setFocus] = useState<string | null>(null)
  const [trace, setTrace] = useState<{ date: string; source?: string } | null>(null)
  const [barMode, setBarMode] = useState<"day" | "week">("day")
  const today = todayWIB()
  // filter periode untuk statistik neraca karbon (Hari ini · Kemarin · 1 minggu · 1 bulan · 6 bulan · 1 tahun · Kustom)
  const [period, setPeriod] = usePeriod("1m")
  const bal = useQuery({
    queryKey: ["env", orgId, period.start, period.end], enabled: !!orgId, placeholderData: (p) => p, refetchInterval: 60_000,
    queryFn: () => api<any>(`/orgs/${orgId}/environment?start=${period.start}&end=${period.end}`),
  })
  const series = useQuery({
    queryKey: ["series", orgId, range], enabled: !!orgId, placeholderData: (p) => p,
    queryFn: () => api<any>(`/orgs/${orgId}/series?start=${addDays(today, -Number(range) + 1)}&end=${today}`),
  })
  const heat = useQuery({ queryKey: ["series", orgId, "heat"], enabled: !!orgId, queryFn: () => api<any>(`/orgs/${orgId}/series?start=${addDays(today, -181)}&end=${today}`) })

  const days: any[] = series.data?.days ?? []
  const rangeStats = useMemo(() => {
    if (!days.length) return null
    const total = days.reduce((s, x) => s + x.total, 0)
    const active = days.filter((x) => x.k > 0)
    const peak = days.reduce((a, b) => (b.total > a.total ? b : a), days[0])
    const base = days.reduce((s, x) => s + (x.baseline ?? 0), 0)
    const projected = days.reduce((s, x) => s + Object.values<any>(x.sources).filter((v) => v.label === "proyeksi").reduce((a, v) => a + v.kg, 0), 0)
    const bySource: Record<string, number> = {}
    for (const x of days) for (const [k, v] of Object.entries<any>(x.sources)) bySource[k] = (bySource[k] ?? 0) + v.kg
    return { total, avgActive: active.length ? active.reduce((s, x) => s + x.total, 0) / active.length : 0, peak, vsBase: base ? total / base - 1 : null, projectedShare: total ? projected / total : 0, bySource }
  }, [days])
  const donut = useMemo(() => groupByScope(Object.entries(rangeStats?.bySource ?? {}).filter(([, v]) => v > 0), ([k]) => k, orgInfo).flatMap((g) => g.items).map(([k, v]) => ({ key: k, label: SOURCES[k]?.label ?? k, value: v, color: SOURCES[k]?.color ?? "gray" })), [rangeStats, orgInfo])
  const select = (k: string | null) => { setFocus(k); if (k) setMode("source") }

  const bars = useMemo(() => {
    if (!d) return []
    if (barMode === "day") return (d.trend as any[]).slice(-7).map((x) => ({ key: x.date, date: x.date, label: fmtDate(x.date, { weekday: "short" }).replace(".", ""), value: x.total, hatched: x.type === "libur" || x.partial, current: x.date === d.date }))
    const hd: any[] = heat.data?.days ?? []
    const out = []
    for (let w = 6; w >= 0; w--) {
      const chunk = hd.slice(Math.max(0, hd.length - (w + 1) * 7), hd.length - w * 7)
      if (!chunk.length) continue
      const active = chunk.filter((x) => x.k > 0).length
      out.push({ key: chunk[0].date, date: chunk[chunk.length - 1].date, label: fmtDate(chunk[0].date, { day: "numeric", month: "short" }).replace(".", ""), value: chunk.reduce((s, x) => s + x.total, 0), hatched: active === 0, current: w === 0 })
    }
    return out
  }, [d, barMode, heat.data])

  if (!orgId) return <ErrorState error={new Error("Akun belum terhubung ke lembaga")} />
  if (isLoading) return <PageSkeleton />
  if (error) return <ErrorState error={error} retry={refetch} />

  // hari ini masih berjalan → bandingkan dengan kemarin pada jam yang sama
  // kartu utama = kemarin (angka final), dibanding hari sebelumnya
  const vsRows = groupByScope(Object.entries<any>(d.vsBaseline).filter(([k]) => d.month.bySource[k]).sort((a, b) => (d.month.bySource[b[0]]?.kg ?? 0) - (d.month.bySource[a[0]]?.kg ?? 0)).slice(0, 5), ([k]) => k, orgInfo).flatMap((g) => g.items)
  const barTotal = bars.reduce((s, b) => s + b.value, 0)

  // ---- angka utama yang mudah dibaca ----
  const todayKg = d.today?.total ?? 0
  const frac = d.today?.fraction ?? null
  const yKg = d.yesterday?.total ?? null
  const env = {
    absorbedToday: d.trees.absorbedToday ?? 0, absorbedMonth: d.trees.absorbedMonth ?? 0,
    stock: d.trees.stock ?? 0, count: d.trees.count ?? 0,
    avoided: d.avoided?.totalCo2e ?? 0,
  }
  const envMonth = env.absorbedMonth + env.avoided
  const envShare = d.month.total > 0 ? envMonth / d.month.total : 0
  const updated = new Date(dataUpdatedAt).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false }).replace(".", ":")
  const monthSources = groupByScope(Object.entries<any>(d.month.bySource).map(([k, v]) => ({ k, kg: v.kg as number })).filter((x) => x.kg > 0), (x) => x.k, orgInfo)
  // neraca karbon sesuai filter periode (angka dari buku engine)
  const balanceInput = {
    emissionKg: bal.data?.emission?.total ?? 0, days: period.days, treeCount: bal.data?.trees?.count ?? env.count,
    absorbedKg: bal.data?.trees?.absorbed ?? null, bySource: bal.data?.emission?.bySource ?? {},
  }
  const maxSrc = Math.max(...monthSources.flatMap((g) => g.items.map((x) => x.kg)), 1)

  return (
    <div className="space-y-5">
      {/* ---------- judul ---------- */}
      <div className="flex flex-col gap-4 pb-1 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{tl("Dasbor", "Dashboard")}</h1>
          <p className="mt-1.5 text-[0.9375rem] text-muted-foreground">{d.org.name} · {fmtDate(d.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {canInput && <Button size="lg" className="h-11 px-5" render={<Link to="/app/input" />}><Plus /> {tl("Input data", "Add data")}</Button>}
          <Button size="lg" variant="outline" className="h-11 border-primary px-5 text-primary hover:text-primary" render={<Link to="/app/trace" />}><Sigma /> {tr("Telusuri angka")}</Button>
        </div>
      </div>

      {!d.baseline?.locked && (
        <Alert className="rounded-2xl border-amber-500/30 bg-amber-500/5">
          <TriangleAlert className="text-amber-600" />
          {!d.closing?.dataStart ? <>
            <AlertTitle>{tl("Belum ada data", "No data yet")}</AlertTitle>
            <AlertDescription>{tl("Dasbor masih kosong. Mulai dengan Survei Awal: tetapkan periode acuan dan isi data bulanannya — engine menghitung otomatis setelah data masuk.", "The dashboard is empty. Start with the Baseline Survey: set the reference period and enter its monthly data — the engine calculates automatically once data arrives.")} <Link to="/app/baseline" className="font-medium text-primary underline-offset-2 hover:underline">{tl("Mulai Survei Awal →", "Start the Baseline Survey →")}</Link></AlertDescription>
          </> : <>
            <AlertTitle>{tl("Baseline belum terkunci", "Baseline not locked yet")}</AlertTitle>
            <AlertDescription>{tl("Angka dihitung dari data yang sudah masuk, tetapi belum ada pembanding baseline dan rapor resmi belum dapat diterbitkan.", "Figures come from the data entered so far, but there is no baseline comparison yet and official reports cannot be issued.")} <Link to="/app/baseline" className="font-medium text-primary underline-offset-2 hover:underline">{tl("Lengkapi baseline →", "Complete the baseline →")}</Link></AlertDescription>
          </>}
        </Alert>
      )}

      {/* ---------- 1. HARI INI + LINGKUNGAN ---------- */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* emisi hari ini */}
        <section className="relative overflow-hidden rounded-[1.75rem] bg-primary-deep p-6 text-white sm:p-7">
          <div className="pointer-events-none absolute inset-0 opacity-50" style={{ backgroundImage: "repeating-radial-gradient(circle at 110% 120%, transparent 0 14px, rgb(255 255 255 / 0.05) 14px 16px)" }} />
          <div className="relative">
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-sm font-medium text-white/85"><Flame className="size-4" />{tl("Emisi hari ini", "Emissions today")}</span>
              <button onClick={() => refetch()} className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-1 text-xs text-white/85 transition-colors hover:bg-white/20" title={tl("Perbarui", "Refresh")}>
                {isFetching ? <Pause className="size-3.5" /> : <RefreshCw className="size-3.5" />}{tl(`diperbarui ${updated} WIB`, `updated ${updated} WIB`)}
              </button>
            </div>
            <button onClick={() => setTrace({ date: d.date })} className="mt-3 block text-left">
              <span className="text-[3.25rem] leading-none font-semibold tracking-tight tabular sm:text-[3.75rem]"><CountUp value={todayKg} format={(v) => num(v, 0)} /></span>
              <span className="ml-2 text-lg text-white/75">kg CO₂e</span>
            </button>
            <p className="mt-2 text-sm text-white/75">{tl("Sementara — terus bertambah sampai tutup buku 00.30 WIB", "Provisional — keeps growing until the 00:30 WIB close")}</p>
            {frac !== null && (
              <div className="mt-4">
                <div className="flex justify-between text-[0.6875rem] text-white/65"><span>00.00</span><span>{tl(`${pct(frac, 0)} hari berjalan`, `${pct(frac, 0)} of the day`)}</span><span>24.00</span></div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-emerald-300 transition-all duration-700" style={{ width: `${frac * 100}%` }} /></div>
              </div>
            )}
            <div className="mt-5 grid grid-cols-3 gap-2">
              {([1, 2, 3] as const).map((sc) => {
                const isIotMeasured = sc === 2 && d.today?.sources?.listrik?.label === "terukur"
                return (
                  <div key={sc} className="rounded-2xl bg-white/10 px-3 py-2.5">
                    <div className="flex items-center justify-between text-[0.6875rem] text-white/65">
                      <span>{tl(["", "Scope 1 · langsung", "Scope 2 · listrik", "Scope 3 · lainnya"][sc], ["", "Scope 1 · direct", "Scope 2 · power", "Scope 3 · other"][sc])}</span>
                      {isIotMeasured && <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-400/25 px-1.5 py-0.2 text-[0.625rem] font-medium text-emerald-100">⚡ IoT</span>}
                    </div>
                    <div className="mt-0.5 font-semibold tabular">{num(d.today?.scope?.[sc] ?? 0, 0)} <span className="text-xs font-normal text-white/65">kg</span></div>
                  </div>
                )
              })}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-white/12 pt-4 text-sm">
              <span className="text-white/75">{tl("Kemarin (final)", "Yesterday (final)")} <b className="font-semibold text-white">{yKg === null ? "—" : `${num(yKg, 0)} kg`}</b>{d.yesterday && <span className="text-white/60"> · {tr("hari " + d.yesterday.dayType)}</span>}</span>
              {todayKg > 0 && <span className="text-white/75">≈ <b className="font-semibold text-white">{num(todayKg / 0.082, 0)} km</b> {tl("naik motor", "by motorbike")}</span>}
            </div>
          </div>
        </section>

        {/* lingkungan */}
        <section className="relative overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-emerald-50 to-lime-50 p-6 ring-1 ring-emerald-600/15 sm:p-7 dark:from-emerald-950/40 dark:to-lime-950/20">
          <Leaf className="pointer-events-none absolute -right-6 -bottom-8 size-44 text-emerald-600/10" strokeWidth={1.2} />
          <div className="relative">
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-sm font-medium text-emerald-800 dark:text-emerald-200"><Leaf className="size-4" />{tl("Karbon dari lingkungan sekolah", "Carbon from the school environment")}</span>
              <Link to="/app/eco-services" className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-300">{tl("Detail →", "Details →")}</Link>
            </div>
            <div className="mt-3">
              <span className="text-[3.25rem] leading-none font-semibold tracking-tight text-emerald-900 tabular sm:text-[3.75rem] dark:text-emerald-100"><CountUp value={envMonth} format={(v) => num(v, 0)} /></span>
              <span className="ml-2 text-lg text-emerald-800/70 dark:text-emerald-200/70">kg CO₂e</span>
            </div>
            <p className="mt-2 text-sm text-emerald-900/70 dark:text-emerald-100/70">{tl("Diserap pohon + emisi yang dihindari bulan ini", "Absorbed by trees + emissions avoided this month")}</p>
            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[
                [Leaf, tl("Serapan pohon", "Tree uptake"), `${num(env.absorbedMonth, 1)} kg`, tl(`hari ini ${num(env.absorbedToday, 2)} kg`, `today ${num(env.absorbedToday, 2)} kg`)],
                [Mountain, tl("Stok karbon pohon", "Tree carbon stock"), `${num(env.stock / 1000, 2)} t`, tl(`${num(env.count)} pohon terukur`, `${num(env.count)} trees measured`)],
                [Recycle, tl("Emisi terhindar", "Avoided"), `${num(env.avoided, 0)} kg`, tl("kompos · bank sampah · PLTS", "compost · waste bank · solar")],
              ].map(([I, l, v, sub]: any) => (
                <div key={l} className="rounded-2xl bg-white/70 px-3 py-2.5 dark:bg-white/5">
                  <div className="flex items-center gap-1.5 text-[0.6875rem] text-emerald-800/75 dark:text-emerald-200/75"><I className="size-3.5" />{l}</div>
                  <div className="mt-0.5 font-semibold text-emerald-950 tabular dark:text-emerald-50">{v}</div>
                  <div className="truncate text-[0.6875rem] text-emerald-900/60 dark:text-emerald-100/60">{sub}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 border-t border-emerald-700/10 pt-4">
              <div className="flex items-center justify-between text-sm text-emerald-900/80 dark:text-emerald-100/80">
                <span>{tl("Dibanding emisi bulan ini", "Compared with this month's emissions")}</span><b className="tabular">{pct(envShare, 1)}</b>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-emerald-900/10"><div className="h-full rounded-full bg-emerald-500 transition-all duration-700" style={{ width: `${Math.min(envShare, 1) * 100}%` }} /></div>
              <p className="mt-2 text-[0.6875rem] text-emerald-900/60 dark:text-emerald-100/60">{tl(`Biopori ${num(d.avoided?.biopori?.count ?? 0)} lubang menampung ${num(d.avoided?.biopori?.liters ?? 0, 0)} L air. Estimasi internal — bukan kredit karbon dan tidak mengurangi angka emisi (Perpres 110/2025).`, `${num(d.avoided?.biopori?.count ?? 0)} biopores hold ${num(d.avoided?.biopori?.liters ?? 0, 0)} L of water. Internal estimate — not a carbon credit and not subtracted from emissions.`)}</p>
            </div>
          </div>
        </section>
      </div>

      {/* ---------- 2. statistik neraca karbon (bulan berjalan s.d. kemarin) ---------- */}
      <CarbonBalanceStats input={balanceInput} org={d.org.name} onEmission={() => nav(`/app/carbon?range=${period.key}${period.key === "custom" ? `&from=${period.start}&to=${period.end}` : ""}`)} onTrees={() => nav("/app/eco-services")}
        periodLabel={period.label} loading={bal.isFetching}
        header={<>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">{tl("Rekap emisi & neraca karbon", "Emissions & carbon balance")}</h2>
            <p className="text-sm text-muted-foreground">{period.start === period.end ? fmtDate(period.start) : `${fmtDate(period.start)} – ${fmtDate(period.end)}`}{period.end === today ? tl(" · hari ini masih sementara", " · today is provisional") : ""}</p>
          </div>
          <PeriodFilter value={period} onChange={setPeriod} />
        </>} />

      {/* ---------- 3. dari mana emisinya + tren ---------- */}
      <div className="grid gap-5 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader>
            <CardTitle className="text-xl">{tl("Dari mana emisi bulan ini?", "Where do this month's emissions come from?")}</CardTitle>
            <CardDescription>{tl("Dikelompokkan per scope · klik sumber untuk melihat cara hitungnya", "Grouped by scope · click a source to see how it is calculated")}</CardDescription>
            {canInput && <CardAction><Button size="sm" variant="outline" className="border-primary text-primary hover:text-primary" render={<Link to="/app/input" />}><Plus /> {tl("Input", "Input")}</Button></CardAction>}
          </CardHeader>
          <CardContent className="space-y-4">
            {!monthSources.length && <p className="text-sm text-muted-foreground">{tl("Belum ada emisi tercatat bulan ini.", "No emissions recorded this month yet.")}</p>}
            {monthSources.map((g) => (
              <div key={g.scope} className="space-y-1.5">
                <ScopeHeading compact scope={g.scope} totalKg={g.items.reduce((a, x) => a + x.kg, 0)} />
                {g.items.map((x) => {
                  const I = SRC_ICON[x.k] ?? Leaf
                  const isIot = x.k === "listrik" && (d.today?.sources?.listrik?.label === "terukur" || d.month?.sources?.listrik?.label === "terukur")
                  return (
                    <button key={x.k} onClick={() => setTrace({ date: d.date, source: x.k })} className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-muted/60">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full" style={{ background: `color-mix(in srgb, ${SOURCES[x.k]?.color} 18%, transparent)`, color: SOURCES[x.k]?.color }}><I className="size-4" /></span>
                      <span className="w-40 shrink-0 truncate text-sm font-medium sm:w-52 flex items-center gap-1.5">
                        <span>{SOURCES[x.k]?.label ?? x.k}</span>
                        {isIot && <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.2 text-[0.625rem] font-semibold text-emerald-700 ring-1 ring-emerald-500/25 dark:text-emerald-300">⚡ IoT</span>}
                      </span>
                      <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full" style={{ width: `${(x.kg / maxSrc) * 100}%`, background: SOURCES[x.k]?.color }} /></span>
                      <span className="w-24 shrink-0 text-right text-sm font-semibold tabular">{x.kg >= 1000 ? `${num(x.kg / 1000, 2)} t` : `${num(x.kg, 0)} kg`}</span>
                      <span className="hidden w-12 shrink-0 text-right text-xs text-muted-foreground sm:inline">{pct(d.month.total ? x.kg / d.month.total : 0, 0)}</span>
                    </button>
                  )
                })}
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-xl">{tl("Tren emisi", "Emission trend")}</CardTitle>
            <CardDescription>{barMode === "day" ? tl("7 hari terakhir", "Last 7 days") : tl("7 minggu terakhir", "Last 7 weeks")} · {ton(barTotal)} CO₂e · {tl("arsir = libur / berjalan", "hatched = holiday / in progress")}</CardDescription>
            <CardAction>
              <ToggleGroup value={[barMode]} onValueChange={(v) => v[0] && setBarMode(v[0] as any)} variant="outline" size="sm">
                <ToggleGroupItem value="day">{tl("Harian", "Daily")}</ToggleGroupItem>
                <ToggleGroupItem value="week">{tl("Mingguan", "Weekly")}</ToggleGroupItem>
              </ToggleGroup>
            </CardAction>
          </CardHeader>
          <CardContent className="pt-4">{bars.length ? <PillBars bars={bars} onPick={(b) => setTrace({ date: b.date })} /> : <Skeleton className="h-60 rounded-2xl" />}</CardContent>
        </Card>
      </div>

      <MoreSection title={tl("Analisis lanjutan", "Deeper analysis")}>
      {/* ---------- dibanding baseline ---------- */}
      {vsRows.length > 0 && d.baseline && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{tl("Dibanding baseline", "Compared with the baseline")}</CardTitle>
            <CardDescription>{tl("Per orang per hari sekolah, 30 hari terakhir · hijau = turun (lebih baik)", "Per person per school day, last 30 days · green = lower (better)")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-x-6 gap-y-1 md:grid-cols-2">
            {vsRows.map(([k, v]) => {
              const I = SRC_ICON[k] ?? Leaf, ch = v.change as number | null
              const flat = ch === null || Math.abs(ch) < 0.005
              return (
                <button key={k} onClick={() => setTrace({ date: d.date, source: k })} className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-muted/60">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full" style={{ background: `color-mix(in srgb, ${SOURCES[k]?.color} 18%, transparent)`, color: SOURCES[k]?.color }}><I className="size-4" /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{SOURCES[k]?.label ?? k}</span><span className="block truncate text-xs text-muted-foreground">{num(v.current, 3)} {tl("vs", "vs")} {num(v.baseline, 3)} {tl("kg/orang/hari", "kg/person/day")}</span></span>
                  <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold tabular", flat ? "bg-muted text-muted-foreground" : ch! < 0 ? "bg-primary/10 text-primary" : "bg-amber-500/12 text-amber-700 dark:text-amber-400")}>
                    {flat ? tl("Stabil", "Stable") : ch! < 0 ? `↓ ${pct(-ch!, 0)}` : `↑ ${pct(ch!, 0)}`}
                  </span>
                </button>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* ---------- penjelajah emisi + komposisi ---------- */}
      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><LineChart className="size-5 text-primary" />{tl("Penjelajah emisi", "Emission explorer")}</CardTitle>
            <CardDescription>{tl("Klik legenda untuk sembunyikan seri · seret brush di bawah untuk zoom · klik hari untuk telusuri angka", "Click legend to hide series · drag the brush to zoom · click a day to trace")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <ToggleGroup value={[range]} onValueChange={(v) => v[0] && setRange(v[0])} variant="outline" size="sm">{RANGES.map((r) => <ToggleGroupItem key={r.v} value={r.v}>{r.l}</ToggleGroupItem>)}</ToggleGroup>
              <ToggleGroup value={[mode]} onValueChange={(v) => { if (v[0]) { setMode(v[0] as ExplorerMode); if (v[0] !== "source") setFocus(null) } }} variant="outline" size="sm">
                <ToggleGroupItem value="scope"><Layers /> Scope</ToggleGroupItem>
                <ToggleGroupItem value="source"><Sparkles /> {tl("Sumber", "Source")}</ToggleGroupItem>
                <ToggleGroupItem value="total"><Mountain /> Total</ToggleGroupItem>
              </ToggleGroup>
              <ToggleGroup value={[chartType]} onValueChange={(v) => v[0] && setChartType(v[0] as any)} variant="outline" size="sm">
                <ToggleGroupItem value="area" aria-label="Area"><LineChart /></ToggleGroupItem>
                <ToggleGroupItem value="bar" aria-label="Bar"><BarChart3 /></ToggleGroupItem>
              </ToggleGroup>
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant={showBaseline ? "secondary" : "outline"} onClick={() => setShowBaseline(!showBaseline)}><Target /> Baseline</Button>
                <Button size="sm" variant={showAverage ? "secondary" : "outline"} onClick={() => setShowAverage(!showAverage)}>x̄ {tl("Rata-rata", "Average")}</Button>
              </div>
            </div>
            {rangeStats && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  [tl("Total periode", "Period total"), ton(rangeStats.total), null],
                  [tl("Rata-rata hari aktif", "Avg active day"), kg(rangeStats.avgActive, 0), null],
                  [tl("Hari puncak", "Peak day"), `${kg(rangeStats.peak.total, 0)}`, () => setTrace({ date: rangeStats.peak.date })],
                  [tl("vs baseline", "vs baseline"), signedPct(rangeStats.vsBase), null],
                ].map(([l, v, fn]: any, i) => (
                  <button key={i} disabled={!fn} onClick={fn ?? undefined} className={cn("rounded-2xl bg-muted/60 px-4 py-3 text-left", fn && "transition-colors hover:bg-primary/8")}>
                    <div className="text-[0.6875rem] text-muted-foreground">{l}{i === 2 && <span className="ml-1">· {fmtDate(rangeStats.peak.date, { day: "numeric", month: "short" })}</span>}</div>
                    <div className={cn("text-lg font-semibold tabular", i === 3 && rangeStats.vsBase !== null && (rangeStats.vsBase <= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600"))}>{v}</div>
                  </button>
                ))}
              </div>
            )}
            {series.isLoading ? <Skeleton className="h-[21.25rem] rounded-xl" /> : (
              <div className={cn("transition-opacity", series.isFetching && "opacity-60")}>
                <EmissionExplorer days={days} mode={mode} chartType={chartType} showBaseline={showBaseline} showAverage={showAverage} focus={focus} onPick={(date) => setTrace({ date })} />
              </div>
            )}
            {rangeStats && rangeStats.projectedShare > 0 && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Info className="size-3.5" />{pct(rangeStats.projectedShare)} {tl("dari angka periode ini masih Proyeksi (menunggu data aktual).", "of this period is still Projected (awaiting actual data).")}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{tl("Komposisi sumber", "Source breakdown")}</CardTitle>
            <CardDescription>{RANGES.find((r) => r.v === range)?.l} · {tl("arahkan/klik untuk fokus", "hover/click to focus")}</CardDescription>
            {focus && <CardAction><Button size="xs" variant="ghost" onClick={() => setFocus(null)}>{tl("Reset", "Reset")}</Button></CardAction>}
          </CardHeader>
          <CardContent className="space-y-5">
            <InteractiveDonut data={donut} selected={focus} onSelect={select} centerValue={ton(rangeStats?.total ?? 0)} centerLabel="CO₂e" size={210} />
            <div className="space-y-1">
              {donut.map((s) => {
                const share = rangeStats?.total ? s.value / rangeStats.total : 0
                return (
                  <button key={s.key} onClick={() => select(focus === s.key ? null : s.key)} className={cn("w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/60", focus === s.key && "bg-primary/8 ring-1 ring-primary/25")}>
                    <div className="flex items-center gap-2 text-sm"><span className="size-2.5 rounded-full" style={{ background: s.color }} /><span className="truncate">{s.label}</span><span className="ml-auto font-medium tabular">{ton(s.value)}</span><span className="w-11 text-right text-xs text-muted-foreground">{pct(share)}</span></div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full transition-all duration-700" style={{ width: `${share * 100}%`, background: s.color }} /></div>
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ---------- heatmap + gauge ---------- */}
      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CalendarDays className="size-5 text-primary" />{tl("Kalender emisi 26 minggu", "26-week emission calendar")}</CardTitle>
            <CardDescription>{tl("Tiap kotak = satu hari · warna lebih pekat = emisi lebih tinggi · klik untuk telusuri", "Each square = one day · darker = higher emissions · click to trace")}</CardDescription>
          </CardHeader>
          <CardContent>{heat.data ? <CalendarHeatmap days={heat.data.days} onPick={(date) => setTrace({ date })} /> : <Skeleton className="h-32 rounded-xl" />}</CardContent>
        </Card>
        <div className="space-y-5">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><GaugeIcon className="size-5 text-primary" />{tl("Intensitas vs target", "Intensity vs target")}</CardTitle><CardDescription>{tl("kg CO₂e per orang per hari aktif · target −10% dari baseline", "kg CO₂e per person per active day · target −10% vs baseline")}</CardDescription></CardHeader>
          <CardContent>
            <Gauge value={d.intensity.current} baseline={d.intensity.baseline || null} target={d.intensity.baseline ? d.intensity.baseline * 0.9 : null} unit={tl("kg/orang/hari aktif", "kg/person/active day")}>
              <div className="mt-2 grid w-full grid-cols-2 gap-2 text-center text-xs">
                <div className="rounded-lg bg-muted/50 p-2"><div className="text-muted-foreground">Baseline</div><div className="font-semibold tabular">{num(d.intensity.baseline, 3)}</div></div>
                <div className="rounded-lg bg-primary/8 p-2"><div className="text-muted-foreground">{tl("Target", "Target")}</div><div className="font-semibold tabular text-primary">{num((d.intensity.baseline ?? 0) * 0.9, 3)}</div></div>
              </div>
            </Gauge>
          </CardContent>
        </Card>
        </div>
      </div>
      </MoreSection>

      <TraceSheet orgId={orgId} date={trace?.date ?? null} source={trace?.source} open={!!trace} onOpenChange={(o) => !o && setTrace(null)} />
    </div>
  )
}
