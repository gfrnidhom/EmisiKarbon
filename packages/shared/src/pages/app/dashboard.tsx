import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import {
  ArrowDownRight, ArrowUpRight, BarChart3, Bike, CalendarDays, Droplets, FileText, Flame, Fuel, Gauge as GaugeIcon, Info, Layers, Leaf, LineChart, Mountain,
  Pause, Plus, Recycle, RefreshCw, Sigma, Snowflake, Sparkles, Target, TriangleAlert, Zap, type LucideIcon,
} from "lucide-react"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState, PageSkeleton } from "@/components/common"
import { CalendarHeatmap, CountUp, EmissionExplorer, Gauge, InteractiveDonut, type ExplorerMode } from "@/components/interactive-charts"
import { TraceSheet } from "@/components/trace-sheet"
import { api } from "@/lib/api"
import { useOrg } from "@/lib/hooks"
import { useAuth } from "@/lib/auth"
import { addDays, fmtDate, kg, num, groupByScope, pct, signedPct, SOURCES, sourceScope, todayWIB, ton } from "@/lib/format"
import { cn } from "@/lib/utils"
import { t as tr, tl, tServer } from "@/lib/i18n"
import { Delta, hatch, PillBars, SegmentGauge, SRC_ICON, StatTile } from "@/components/dash-kit"

const RANGES = [{ v: "7", l: tl("7H", "7D") }, { v: "30", l: tl("30H", "30D") }, { v: "90", l: tl("90H", "90D") }, { v: "365", l: tl("1T", "1Y") }]
/** Kartu gelap "langsung": jam WIB & hitung mundur pembaruan otomatis. */
function LiveCard({ updatedAt, fetching, onRefresh, onTrace }: { updatedAt: number; fetching: boolean; onRefresh: () => void; onTrace: () => void }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id) }, [])
  const clock = new Date(now).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).replace(/\./g, ":")
  const left = Math.max(0, Math.ceil((updatedAt + 60_000 - now) / 1000))
  return (
    <div className="relative overflow-hidden rounded-2xl bg-primary-deep p-6 text-white">
      <div className="pointer-events-none absolute inset-0 opacity-60" style={{ backgroundImage: "repeating-radial-gradient(circle at 110% 120%, transparent 0 14px, rgb(255 255 255 / 0.05) 14px 16px)" }} />
      <div className="relative">
        <div className="flex items-center justify-between"><span className="text-[1.0625rem] font-medium whitespace-nowrap">{tl("Pantauan", "Live")}</span><span className="flex items-center gap-1.5 text-xs text-white/70"><span className="size-2 animate-pulse rounded-full bg-emerald-300" />WIB</span></div>
        <div className="mt-5 text-center text-[2.75rem] leading-none font-semibold tracking-tight tabular">{clock}</div>
        <p className="mt-2 text-center text-xs text-white/70">{fetching ? tl("Memperbarui…", "Updating…") : tl(`Pembaruan otomatis dalam ${left} dtk`, `Auto-refresh in ${left}s`)}</p>
        <div className="mt-5 flex justify-center gap-3">
          <button onClick={onRefresh} aria-label={tl("Perbarui", "Refresh")} className="flex size-12 items-center justify-center rounded-full bg-white text-primary-deep transition-transform hover:scale-105">{fetching ? <Pause className="size-5" /> : <RefreshCw className="size-5" />}</button>
          <button onClick={onTrace} aria-label={tl("Telusuri angka", "Trace numbers")} className="flex size-12 items-center justify-center rounded-full bg-amber-400 text-amber-950 transition-transform hover:scale-105"><Sigma className="size-5" /></button>
        </div>
      </div>
    </div>
  )
}

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
  const delta = d.yesterday && d.dayBefore?.total ? d.yesterday.total / d.dayBefore.total - 1 : null
  const closedAt = d.closing?.lastClosedDate ? fmtDate(d.closing.lastClosedDate) : null
  const intensityDown = (d.intensity.change ?? 0) < 0
  // 6 sumber terbesar, ditampilkan berurutan Scope 1 → 2 → 3 (sama dengan halaman lain)
  const sources = groupByScope(Object.entries<any>(d.month.bySource).map(([k, v]) => ({ k, kg: v.kg })).filter((x) => x.kg > 0).sort((a, b) => b.kg - a.kg).slice(0, 6), (x) => x.k, orgInfo).flatMap((g) => g.items)
  const quality = (() => {
    let strong = 0, mid = 0, proj = 0
    for (const v of Object.values<any>(d.month.bySource)) for (const [l, kgv] of Object.entries<number>(v.labels ?? {})) {
      if (["aktual", "terukur", "terverifikasi", "terkunci"].includes(l)) strong += kgv
      else if (l === "proyeksi") proj += kgv
      else mid += kgv
    }
    const tot = strong + mid + proj || 1
    return { strong: strong / tot, mid: mid / tot, proj: proj / tot }
  })()
  const vsRows = groupByScope(Object.entries<any>(d.vsBaseline).filter(([k]) => d.month.bySource[k]).sort((a, b) => (d.month.bySource[b[0]]?.kg ?? 0) - (d.month.bySource[a[0]]?.kg ?? 0)).slice(0, 5), ([k]) => k, orgInfo).flatMap((g) => g.items)
  const task = d.tasks[0]
  const barTotal = bars.reduce((s, b) => s + b.value, 0)

  return (
    <div className="space-y-5">
      {/* ---------- judul ---------- */}
      <div className="flex flex-col gap-5 pb-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-[2.75rem]">{tl("Dasbor", "Dashboard")}</h1>
          <p className="mt-2 text-[0.9375rem] text-muted-foreground">{tl("Pantau, telusuri, dan kurangi emisi sekolah setiap hari.", "Monitor, trace and reduce your school's emissions every day.")} · {fmtDate(d.date, { weekday: "long", day: "numeric", month: "long" })}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {canInput && <Button size="lg" className="h-12 px-6 text-[0.9375rem]" render={<Link to="/app/input" />}><Plus /> {tl("Input data", "Add data")}</Button>}
          <Button size="lg" variant="outline" className="h-12 border-primary px-6 text-[0.9375rem] text-primary hover:text-primary" render={<Link to="/app/trace" />}><Sigma /> {tr("Telusuri angka")}</Button>
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

      {/* ---------- KPI ---------- */}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile featured title={tl("Emisi kemarin", "Emissions yesterday")} unit="kg CO₂e" onClick={() => d.yesterday && nav(`/app/trace?date=${d.yesterday.date}`)}
          value={<CountUp value={d.yesterday?.total ?? 0} format={(v) => num(v, 0)} />}
          foot={<div className="space-y-1.5">
            {delta !== null ? <Delta invert value={signedPct(delta)} good={delta <= 0} text={tl("vs hari sebelumnya", "vs the day before")} /> : <span className="text-[0.8125rem] text-white/80">{d.yesterday ? tr("hari " + d.yesterday.dayType) : tl("Belum ada data kemarin", "No data for yesterday")}</span>}
            <div className="text-[0.75rem] text-white/75">{tl(`Final · tutup buku 00.30 WIB · hari ini sementara ${num(d.today?.total ?? 0, 0)} kg`, `Final · closed at 00:30 WIB · today so far ${num(d.today?.total ?? 0, 0)} kg`)}</div>
          </div>} />
        <StatTile title={tl("Emisi bulan ini · s.d. kemarin", "This month · through yesterday")} unit="t CO₂e" onClick={() => nav("/app/carbon")}
          value={<CountUp value={d.month.total / 1000} format={(v) => num(v, 2)} />}
          foot={<span className="text-[0.8125rem] text-primary">{tr("{a} hari aktif · data kuat {b}", { a: d.month.activeDays, b: pct(d.month.strongShare) })}</span>} />
        <StatTile title={tl("Intensitas per orang", "Intensity per person")} unit={tl("kg/hari aktif", "kg/active day")} onClick={() => nav("/app/carbon")}
          value={<CountUp value={d.intensity.current} format={(v) => num(v, 3)} />}
          foot={d.intensity.change !== null ? <Delta value={signedPct(d.intensity.change)} good={intensityDown} text={tl("dibanding baseline", "vs baseline")} /> : <span className="text-[0.8125rem] text-muted-foreground">{tr("Belum ada baseline")}</span>} />
        <StatTile title={tr("Stok karbon pohon")} unit="t CO₂" onClick={() => nav("/app/eco-services")}
          value={<CountUp value={d.trees.stock / 1000} format={(v) => num(v, 2)} />}
          foot={<Delta value={`+${num(d.trees.absorbedYesterday ?? 0, 1)}`} good text={tl(`kg CO₂ diserap kemarin · ${num(d.trees.absorbedMonth, 0)} kg bulan ini`, `kg CO₂ absorbed yesterday · ${num(d.trees.absorbedMonth, 0)} kg this month`)} />} />
      </div>

      {/* ---------- grid utama ---------- */}
      <div className="grid gap-5 xl:grid-cols-4">
        <div className="space-y-5 xl:col-span-3">
          <div className="grid gap-5 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-xl">{tl("Analitik emisi", "Emission analytics")}</CardTitle>
                <CardDescription>{barMode === "day" ? tl("7 hari terakhir", "Last 7 days") : tl("7 minggu terakhir", "Last 7 weeks")} · {ton(barTotal)} CO₂e · {tl("arsir = libur", "hatched = holiday")}</CardDescription>
                <CardAction>
                  <ToggleGroup value={[barMode]} onValueChange={(v) => v[0] && setBarMode(v[0] as any)} variant="outline" size="sm">
                    <ToggleGroupItem value="day">{tl("Harian", "Daily")}</ToggleGroupItem>
                    <ToggleGroupItem value="week">{tl("Mingguan", "Weekly")}</ToggleGroupItem>
                  </ToggleGroup>
                </CardAction>
              </CardHeader>
              <CardContent className="pt-6">{bars.length ? <PillBars bars={bars} onPick={(b) => setTrace({ date: b.date })} /> : <Skeleton className="h-60 rounded-2xl" />}</CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-xl">{tl("Pengingat", "Reminders")}</CardTitle></CardHeader>
              <CardContent className="flex flex-1 flex-col">
                {task ? (
                  <>
                    <p className="text-2xl leading-tight font-semibold tracking-tight text-primary">{tServer(task.title)}</p>
                    <p className={cn("mt-2 text-sm", task.status === "terlambat" ? "text-destructive" : "text-muted-foreground")}>{task.status === "terlambat" ? tr("Terlambat · ") : ""}{tr("tenggat")} {fmtDate(task.due)}</p>
                    {task.detail && <p className="mt-1 text-sm text-muted-foreground">{tServer(task.detail)}</p>}
                    {d.tasks.length > 1 && <p className="mt-3 text-xs text-muted-foreground">+{d.tasks.length - 1} {tl("tugas lain", "more tasks")}</p>}
                    <Button className="mt-auto h-12 w-full text-[0.9375rem]" render={<Link to={task.link} />}><Sparkles /> {tl("Kerjakan sekarang", "Do it now")}</Button>
                  </>
                ) : (
                  <>
                    <p className="text-2xl leading-tight font-semibold text-primary">{tr("Semua tugas beres. Mantap!")}</p>
                    {canInput && <Button className="mt-auto h-12 w-full" render={<Link to="/app/input" />}><Plus /> {tl("Input data", "Add data")}</Button>}
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle className="text-xl">{tl("Sumber vs baseline", "Sources vs baseline")}</CardTitle>
                <CardDescription>{tl("Per orang per hari aktif, 30 hari terakhir", "Per person per active day, last 30 days")}</CardDescription>
                <CardAction><Button size="sm" variant="outline" className="border-primary text-primary hover:text-primary" render={<Link to="/app/carbon" />}><Plus /> {tl("Rapor", "Report")}</Button></CardAction>
              </CardHeader>
              <CardContent className="space-y-1">
                {vsRows.map(([k, v]) => {
                  const I = SRC_ICON[k] ?? Leaf, ch = v.change as number | null
                  const flat = ch === null || Math.abs(ch) < 0.005
                  return (
                    <button key={k} onClick={() => setTrace({ date: d.date, source: k })} className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3.5 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-muted/60">
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-full" style={{ background: `color-mix(in srgb, ${SOURCES[k]?.color} 18%, transparent)`, color: SOURCES[k]?.color }}><I className="size-5" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{SOURCES[k]?.label ?? k}</span>
                        <span className="block truncate text-xs text-muted-foreground">{tl("Bulan ini", "This month")} <b className="font-semibold text-foreground">{ton(d.month.bySource[k].kg)}</b> · {num(v.current, 3)} {tl("kg/orang/hari", "kg/person/day")}</span>
                      </span>
                      <span className={cn("shrink-0 rounded-md border px-2 py-0.5 text-[0.6875rem] font-medium tabular",
                        flat ? "border-border text-muted-foreground" : ch! < 0 ? "border-primary/30 bg-primary/8 text-primary" : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400")}>
                        {flat ? tl("Stabil", "Stable") : ch! < 0 ? tl(`Turun ${pct(-ch!, 0)}`, `Down ${pct(-ch!, 0)}`) : tl(`Naik ${pct(ch!, 0)}`, `Up ${pct(ch!, 0)}`)}
                      </span>
                    </button>
                  )
                })}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader><CardTitle className="text-xl">{tl("Kualitas data", "Data quality")}</CardTitle><CardDescription>{tl("Bulan ini, berdasarkan kg CO₂e", "This month, by kg CO₂e")}</CardDescription></CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between gap-4">
                <SegmentGauge value={pct(quality.strong)} label={tl("Data kuat", "Strong data")}
                  parts={[{ v: quality.strong, color: "var(--primary)" }, { v: quality.mid, color: "var(--primary-deep)" }, { v: quality.proj, color: "", hatched: true }]} />
                <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
                  <span className="flex items-center gap-2"><span className="size-3.5 rounded-full bg-primary" />{tl("Kuat", "Strong")}</span>
                  <span className="flex items-center gap-2"><span className="size-3.5 rounded-full bg-primary-deep" />{tl("Input/estimasi", "Input/estimate")}</span>
                  <span className="flex items-center gap-2"><span className="size-3.5 rounded-full ring-1 ring-primary/30" style={hatch()} />{tl("Proyeksi", "Projected")} {pct(quality.proj)}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* kolom kanan */}
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1 xl:content-start">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl whitespace-nowrap">{tl("Sumber emisi", "Sources")}</CardTitle>
              {canInput && <CardAction><Button size="icon-sm" variant="outline" className="border-primary text-primary hover:text-primary" aria-label={tl("Input data", "Add data")} render={<Link to="/app/input" />}><Plus /></Button></CardAction>}
            </CardHeader>
            <CardContent className="space-y-0.5">
              {sources.slice(0, 6).map((s) => {
                const I = SRC_ICON[s.k] ?? Leaf
                return (
                  <button key={s.k} onClick={() => setTrace({ date: d.date, source: s.k })} className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-muted/60">
                    <I className="size-6 shrink-0" style={{ color: SOURCES[s.k]?.color }} strokeWidth={2.2} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{SOURCES[s.k]?.label ?? s.k}</span>
                      <span className="block text-xs text-muted-foreground tabular">{ton(s.kg)} · {pct(d.month.total ? s.kg / d.month.total : 0, 1)}</span>
                    </span>
                  </button>
                )
              })}
            </CardContent>
          </Card>
          <LiveCard updatedAt={dataUpdatedAt} fetching={isFetching} onRefresh={() => refetch()} onTrace={() => nav("/app/trace")} />
        </div>
      </div>

      <h2 className="pt-6 text-xl font-semibold tracking-tight">{tl("Analisis lanjutan", "Deeper analysis")}</h2>
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
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Leaf className="size-4 text-leaf" /> {tr("Emisi terhindar")}</CardTitle><CardDescription>{tr("Bulan ini · terpisah dari Rapor Karbon")}</CardDescription></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="text-3xl font-semibold tabular"><CountUp value={d.avoided.totalCo2e} format={(v) => num(v, 0)} /> <span className="text-sm font-normal text-muted-foreground">kg CO₂e</span></div>
            {[["Kompos", d.avoided.kompos.co2e, "var(--leaf)"], ["Bank kertas", d.avoided.bankKertas.co2e, "var(--scope3)"], ["PLTS", d.avoided.plts.co2e, "var(--scope2)"]].map(([l, v, c]: any) => (
              <div key={l}>
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">{tr(l)}</span><span className="font-medium tabular">{num(v, 0)} kg</span></div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full transition-all duration-700" style={{ width: `${d.avoided.totalCo2e ? (v / d.avoided.totalCo2e) * 100 : 0}%`, background: c }} /></div>
              </div>
            ))}
          </CardContent>
        </Card>
        </div>
      </div>

      <TraceSheet orgId={orgId} date={trace?.date ?? null} source={trace?.source} open={!!trace} onOpenChange={(o) => !o && setTrace(null)} />
    </div>
  )
}
