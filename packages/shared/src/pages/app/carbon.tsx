import { useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { ArrowUpRight, Printer, Sigma, Zap } from "lucide-react"
import { createPortal } from "react-dom"
import CarbonReportPrint from "@/pages/print/carbon-report"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { ErrorState, PageHeader, PageSkeleton, QualityBadge } from "@/components/common"
import { Delta, hatch, PillBars, SegmentGauge, SRC_ICON, StatTile } from "@/components/dash-kit"
import { api } from "@/lib/api"
import { useOrg } from "@/lib/hooks"
import { useAuth } from "@/lib/auth"
import { fmtDate, fmtMonth, kg, num, pct, signedPct, groupByScope, SOURCES, sourceScope, todayWIB, ton } from "@/lib/format"
import { ScopeHeading } from "@/components/scope-group"
import { t, tl } from "@/lib/i18n"
import { CountUp, EmissionExplorer, type ExplorerMode } from "@/components/interactive-charts"
import { PeriodFilter, usePeriod } from "@/components/period-filter"
import { carbonBalance, InsightBar, MoreSection } from "@/components/carbon-balance"


/** Rapor Karbon: Scope 1·2·3 per bulan vs ekspektasi baseline, rincian per sumber. */
/** Tanggal contoh untuk menelusuri bulan: hari ini bila bulan berjalan, selain itu pertengahan bulan. */
const traceDate = (m: { month: string; partial?: boolean }) => (m.month.length > 7 ? m.month : m.partial ? todayWIB() : `${m.month}-15`)

export default function Carbon() {
  const { orgId } = useAuth()
  const { org } = useOrg()
  const nav = useNavigate()
  const [period, setPeriod] = usePeriod("yesterday")
  const { data, isLoading, error } = useQuery({ queryKey: ["monthly", orgId, period.start, period.end], queryFn: () => api<any>(`/orgs/${orgId}/monthly?start=${period.start}&end=${period.end}`), enabled: !!orgId, placeholderData: (p) => p })
  const daily = data?.group === "day"
  const rowLabel = (k: string) => (k.length > 7 ? fmtDate(k) : fmtMonth(k))
  const [sel, setSel] = useState<string | null>(null)
  const [cmode, setCmode] = useState<ExplorerMode>("scope")
  const [ctype, setCtype] = useState<"bar" | "area">("bar")
  const [cbase, setCbase] = useState(true)
  // serapan pohon periode yang sama (cache dibagi dengan halaman Jasa Lingkungan)
  const env = useQuery({ queryKey: ["env", orgId, period.start, period.end], queryFn: () => api<any>(`/orgs/${orgId}/environment?start=${period.start}&end=${period.end}`), enabled: !!orgId, placeholderData: (p) => p })
  const rows = data?.months ?? []
  const cur = rows.find((r: any) => r.month === sel) ?? rows[rows.length - 1]
  const total = rows.reduce((s: number, r: any) => s + r.total, 0)
  const base = rows.reduce((s: number, r: any) => s + r.baseline, 0)
  const explorerRows = useMemo(() => rows.map((r: any) => ({ date: r.month.length > 7 ? r.month : `${r.month}-01`, total: r.total, type: r.partial ? tl("berjalan", "in progress") : r.month.length > 7 ? tl("hari", "day") : tl("bulan", "month"), baseline: r.baseline || null, scope: r.scope, sources: Object.fromEntries(Object.entries<number>(r.sources).map(([k, v]) => [k, { kg: v, label: "" }])) })), [rows])
  if (isLoading) return <PageSkeleton />
  if (error) return <ErrorState error={error} />
  const sources = cur ? Object.entries<number>(cur.sources).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]) : []
  const delta = base ? total / base - 1 : null
  const intChange = cur && data.baseline?.perPersonActiveDay ? cur.perPersonActiveDay / data.baseline.perPersonActiveDay - 1 : null
  const quality = (() => {
    let strongK = 0, mid = 0, proj = 0
    for (const [l, v] of Object.entries<number>(cur?.labels ?? {})) {
      if (["aktual", "terukur", "terverifikasi", "terkunci"].includes(l)) strongK += v
      else if (l === "proyeksi") proj += v
      else mid += v
    }
    const tot = strongK + mid + proj || 1
    return { strong: strongK / tot, mid: mid / tot, proj: proj / tot }
  })()
  const periodSources: Record<string, number> = {}
  for (const r of rows) for (const [k, v] of Object.entries<number>(r.sources ?? {})) periodSources[k] = (periodSources[k] ?? 0) + v
  const totU = total >= 1000 ? "t" : "kg"
  const perDay = total / Math.max(period.days, 1)
  const motor = env.data?.trees?.motorFactor ?? 0
  const topSrc = Object.entries(periodSources).filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1])[0]
  const balance = carbonBalance({ emissionKg: total, days: period.days, treeCount: env.data?.trees?.count ?? 0, absorbedKg: env.data?.trees?.absorbed ?? null, bySource: periodSources })
  const monthLabel = (m: string) => (m.length > 7 ? fmtDate(m, { day: "numeric", month: "short" }) : fmtDate(`${m}-01`, { month: "short" })).replace(".", "")
  return (
    <div className="space-y-5">
      {/* dokumen A4 tersembunyi — hanya tampil saat dialog cetak/PDF dibuka */}
      {createPortal(<CarbonReportPrint embedded range={{ start: period.start, end: period.end }} />, document.body)}
      <PageHeader icon={Zap} title={t("Rapor Karbon")} description={tl("Emisi Scope 1·2·3 untuk periode yang dipilih dan perbandingannya dengan ekspektasi baseline. Cara hitung & bukti per hari ada di Telusuri Angka.", "Scope 1·2·3 emissions for the selected period compared with the baseline expectation. Calculations & evidence per day are in Trace Numbers.")}
        actions={<>
          <PeriodFilter value={period} onChange={setPeriod} />
          {cur && <Button size="lg" className="h-11" render={<Link to={`/app/trace?date=${traceDate(cur)}`} />}><Sigma /> {tl("Telusuri hari", "Trace a day")}</Button>}
          <Button size="lg" className="h-11" variant="outline" onClick={() => window.print()}><Printer /> {tl("Cetak / PDF", "Print / PDF")}</Button>
        </>} />

      {/* ---------- 4 statistik utama: jawab "berapa, rata-rata, dari mana, per orang" ---------- */}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile featured title={tl("Total emisi", "Total emissions")} unit={`${totU} CO₂e`}
          value={<CountUp value={totU === "t" ? total / 1000 : total} format={(v) => num(v, totU === "t" ? 2 : 0)} />}
          foot={delta !== null
            ? <span className="text-[0.8125rem] text-white/85">{delta <= 0 ? tl(`${pct(-delta, 0)} lebih rendah dari perkiraan normal (baseline)`, `${pct(-delta, 0)} below the normal expectation (baseline)`) : tl(`${pct(delta, 0)} lebih tinggi dari perkiraan normal (baseline)`, `${pct(delta, 0)} above the normal expectation (baseline)`)}</span>
            : <span className="text-[0.8125rem] text-white/80">{period.label} · {tl(`${period.days} hari`, `${period.days} days`)}</span>} />
        <StatTile title={tl("Rata-rata per hari", "Daily average")} unit="kg CO₂e" onClick={() => cur && nav(`/app/trace?date=${traceDate(cur)}`)}
          value={<CountUp value={perDay} format={(v) => num(v, perDay < 10 ? 2 : 0)} />}
          foot={<span className="text-[0.8125rem] text-muted-foreground">{motor > 0 ? tl(`setara ±${num(perDay / motor, 0)} km naik motor setiap hari`, `like riding a motorbike ±${num(perDay / motor, 0)} km every day`) : tl(`${period.label} · ${period.days} hari`, `${period.label} · ${period.days} days`)}</span>} />
        <StatTile title={tl("Sumber terbesar", "Largest source")} unit={topSrc ? tl("dari total", "of total") : ""} onClick={topSrc ? () => nav(`/app/trace?date=${cur ? traceDate(cur) : todayWIB()}&source=${topSrc[0]}`) : undefined}
          value={topSrc ? <CountUp value={(topSrc[1] / Math.max(total, 1)) * 100} format={(v) => num(v, 0) + "%"} /> : "–"}
          foot={<span className="text-[0.8125rem] text-muted-foreground">{topSrc ? <><b className="font-semibold text-foreground">{SOURCES[topSrc[0]]?.label ?? topSrc[0]}</b> · {kg(topSrc[1], 0)} · Scope {sourceScope(topSrc[0], org)}</> : tl("Belum ada emisi tercatat", "No emissions recorded yet")}</span>} />
        <StatTile title={tl("Per orang per hari sekolah", "Per person per school day")} unit="kg CO₂e"
          value={<CountUp value={cur?.perPersonActiveDay ?? 0} format={(v) => num(v, 3)} />}
          foot={intChange !== null ? <Delta value={signedPct(intChange)} good={intChange <= 0} text={intChange <= 0 ? tl("lebih hemat dari baseline", "better than baseline") : tl("lebih boros dari baseline", "worse than baseline")} /> : <span className="text-[0.8125rem] text-muted-foreground">{t("Belum ada baseline")}</span>} />
      </div>
      <InsightBar balance={balance} org={org?.name} periodLabel={period.label}
        lead={<>{tl("Untuk mengimbangi emisi periode ini dibutuhkan", "Offsetting this period needs")} <b className="text-foreground">±{num(balance.needTrees)} {tl("pohon", "trees")}</b>{" "}({tl(`tercatat ${num(balance.treeCount)}`, `${num(balance.treeCount)} recorded`)}) · <Link to="/app/eco-services" className="font-medium text-primary hover:underline">{tl("lihat neraca di Jasa Lingkungan →", "see the balance in Eco Services →")}</Link></>} />

      <div className="grid gap-5">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{daily ? tl("Emisi harian", "Daily emissions") : tl("Emisi bulanan", "Monthly emissions")}</CardTitle>
            <CardDescription>{daily ? tl("Klik batang untuk memilih hari · arsir = hari berjalan · paling gelap = tertinggi", "Click a bar to pick a day · hatched = today · darkest = highest") : tl("Klik batang untuk memilih bulan · arsir = bulan berjalan · paling gelap = tertinggi", "Click a bar to pick a month · hatched = in progress · darkest = highest")}</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <PillBars height={250} selected={cur?.month} format={(v) => `${num(v / 1000, 2)} t`} onPick={(b) => setSel(b.key)}
              bars={rows.map((r: any) => ({ key: r.month, label: monthLabel(r.month), value: r.total, hatched: r.partial }))} />
          </CardContent>
        </Card>
      </div>

      {cur && (
        <div className="grid gap-5 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle className="text-xl">{t("Rincian per sumber")}</CardTitle>
              <CardDescription>{rowLabel(cur.month)}{cur.partial ? ` (${t("berjalan")})` : ""} · {tl("total periode terpilih · klik sumber untuk melihat cara hitung & buktinya", "monthly totals · click a source to see its calculation & evidence")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              {groupByScope(sources, ([k]) => k, org).map((g) => (
              <div key={g.scope} className="space-y-1 pt-3 first:pt-0">
              <ScopeHeading scope={g.scope} totalKg={g.items.reduce((acc, [, v]) => acc + v, 0)} className="pb-1" />
              {g.items.map(([k, v]) => {
                const I = SRC_ICON[k] ?? Zap
                const lbl = Object.entries<number>(cur.srcLabels?.[k] ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0]
                const isIot = k === "listrik" && (lbl === "terukur" || cur.srcLabels?.[k]?.terukur)
                return (
                  <Link key={k} to={`/app/trace?date=${traceDate(cur)}&source=${k}`} className="group -mx-2 flex w-[calc(100%+1rem)] items-center gap-3.5 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-muted/60">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-full" style={{ background: `color-mix(in srgb, ${SOURCES[k]?.color} 18%, transparent)`, color: SOURCES[k]?.color }}><I className="size-5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 truncate font-medium">
                        <span>{SOURCES[k]?.label ?? k}</span>
                        {isIot && <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.2 text-[0.6875rem] font-semibold text-emerald-700 ring-1 ring-emerald-500/25 dark:text-emerald-300">⚡ Terukur IoT</span>}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">Scope {sourceScope(k, org)} · <b className="font-semibold text-foreground">{kg(v, 0)}</b> · {pct(v / cur.total, 1)}</span>
                    </span>
                    <QualityBadge label={lbl} />
                    <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:rotate-45" />
                  </Link>
                )
              })}
              </div>
              ))}
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="text-xl">{tl("Komposisi scope", "Scope breakdown")}</CardTitle><CardDescription>{ton(cur.total)} CO₂e · {t("{a} hari aktif dari {b} hari", { a: cur.activeDays, b: cur.days })}</CardDescription></CardHeader>
            <CardContent className="space-y-5">
              {([1, 2, 3] as const).map((sc) => {
                const share = cur.total ? cur.scope[sc] / cur.total : 0
                const isIotScope2 = sc === 2 && (cur.srcLabels?.listrik?.terukur != null)
                return (
                  <div key={sc}>
                    <div className="mb-2 flex items-baseline justify-between text-sm">
                      <span className="font-medium flex items-center gap-2">
                        Scope {sc}
                        {isIotScope2 && <span className="rounded-full bg-emerald-500/15 px-2 py-0.2 text-[0.6875rem] font-medium text-emerald-700 ring-1 ring-emerald-500/25 dark:text-emerald-300">⚡ IoT Smart Meter</span>}
                      </span>
                      <span className="tabular"><b>{ton(cur.scope[sc])}</b> <span className="text-muted-foreground">· {pct(share, 1)}</span></span>
                    </div>
                    <div className="h-9 overflow-hidden rounded-full bg-muted" style={hatch("var(--muted-foreground)")}>
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(share * 100, 4)}%`, background: `var(--scope${sc})` }} />
                    </div>
                  </div>
                )
              })}
              <p className="text-xs text-muted-foreground">{tl("Scope 1: bahan bakar, refrigeran, sampah diolah di sekolah, tangki septik · Scope 2: listrik PLN · Scope 3: mobilitas warga, sampah ke TPA, kertas, air limbah ke luar sekolah", "Scope 1: fuel, refrigerants, on-site waste treatment, septic tank · Scope 2: grid electricity · Scope 3: commuting, waste to landfill, paper, off-site wastewater")}</p>
            </CardContent>
          </Card>
        </div>
      )}

      <MoreSection title={tl("Analisis lanjutan", "Deeper analysis")}>
      <div className="grid gap-5 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>{daily ? tl("Emisi harian per scope", "Daily emissions by scope") : t("Emisi bulanan per scope")}</CardTitle>
          <CardDescription>{t("Klik batang untuk melihat rincian bulan · garis = ekspektasi baseline")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <ToggleGroup value={[cmode]} onValueChange={(v) => v[0] && setCmode(v[0] as ExplorerMode)} variant="outline" size="sm">
              <ToggleGroupItem value="scope">Scope</ToggleGroupItem><ToggleGroupItem value="source">{tl("Sumber", "Source")}</ToggleGroupItem><ToggleGroupItem value="total">Total</ToggleGroupItem>
            </ToggleGroup>
            <ToggleGroup value={[ctype]} onValueChange={(v) => v[0] && setCtype(v[0] as any)} variant="outline" size="sm">
              <ToggleGroupItem value="bar">{tl("Batang", "Bars")}</ToggleGroupItem><ToggleGroupItem value="area">Area</ToggleGroupItem>
            </ToggleGroup>
            <Button size="sm" className="ml-auto" variant={cbase ? "secondary" : "outline"} onClick={() => setCbase(!cbase)}>Baseline</Button>
          </div>
          <EmissionExplorer monthly={!daily} days={explorerRows} mode={cmode} chartType={ctype} showBaseline={cbase} showAverage={false} onPick={(m) => setSel(daily ? m.slice(0, 10) : m.slice(0, 7))} height={320} />
        </CardContent>
      </Card>
        <Card>
          <CardHeader><CardTitle className="text-xl">{tl("Kualitas data", "Data quality")}</CardTitle><CardDescription>{cur && rowLabel(cur.month)}</CardDescription></CardHeader>
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
      </MoreSection>
    </div>
  )
}
