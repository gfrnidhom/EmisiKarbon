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
  const rows = data?.months ?? []
  const cur = rows.find((r: any) => r.month === sel) ?? rows[rows.length - 1]
  const total = rows.reduce((s: number, r: any) => s + r.total, 0)
  const base = rows.reduce((s: number, r: any) => s + r.baseline, 0)
  const explorerRows = useMemo(() => rows.map((r: any) => ({ date: r.month.length > 7 ? r.month : `${r.month}-01`, total: r.total, type: r.partial ? tl("berjalan", "in progress") : r.month.length > 7 ? tl("hari", "day") : tl("bulan", "month"), baseline: r.baseline || null, scope: r.scope, sources: Object.fromEntries(Object.entries<number>(r.sources).map(([k, v]) => [k, { kg: v, label: "" }])) })), [rows])
  if (isLoading) return <PageSkeleton />
  if (error) return <ErrorState error={error} />
  const sources = cur ? Object.entries<number>(cur.sources).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]) : []
  const strong = cur ? ((cur.labels.terverifikasi ?? 0) + (cur.labels.aktual ?? 0) + (cur.labels.terukur ?? 0)) / Math.max(cur.total, 1) : 0
  const delta = base ? total / base - 1 : null
  const prev = cur ? rows[rows.findIndex((r: any) => r.month === cur.month) - 1] : null
  const curDelta = cur && !cur.partial && prev?.total ? cur.total / prev.total - 1 : null
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

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile featured title={`${tl("Total", "Total")} · ${period.label}`} unit="t CO₂e" value={<CountUp value={total / 1000} format={(v) => num(v, 2)} />}
          foot={delta !== null ? <Delta invert value={signedPct(delta)} good={delta <= 0} text={tl("vs ekspektasi baseline", "vs baseline expectation")} /> : <span className="text-[0.8125rem] text-white/80">{data.feVersion}</span>} />
        <StatTile title={cur ? rowLabel(cur.month) : "–"} unit="t CO₂e" value={<CountUp value={(cur?.total ?? 0) / 1000} format={(v) => num(v, 2)} />}
          onClick={() => cur && nav(`/app/trace?date=${traceDate(cur)}`)}
          foot={curDelta !== null ? <Delta value={signedPct(curDelta)} good={curDelta <= 0} text={daily ? tl("vs hari sebelumnya", "vs previous day") : tl("vs bulan sebelumnya", "vs previous month")} /> : <span className="text-[0.8125rem] text-muted-foreground">{t("{a} hari aktif dari {b} hari", { a: cur?.activeDays ?? 0, b: cur?.days ?? 0 })}</span>} />
        <StatTile title={tl("Intensitas per orang", "Intensity per person")} unit={tl("kg/hari aktif", "kg/active day")} value={<CountUp value={cur?.perPersonActiveDay ?? 0} format={(v) => num(v, 3)} />}
          foot={intChange !== null ? <Delta value={signedPct(intChange)} good={intChange <= 0} text={t("Baseline {n} kg", { n: num(data.baseline.perPersonActiveDay, 3) })} /> : <span className="text-[0.8125rem] text-muted-foreground">{t("Belum ada baseline")}</span>} />
        <StatTile title={t("Porsi data kuat")} value={pct(strong)} foot={<span className="text-[0.8125rem] text-primary">{tl("Aktual · Terukur · Disahkan", "Actual · Measured · Approved")}</span>} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-xl">{daily ? tl("Emisi harian", "Daily emissions") : tl("Emisi bulanan", "Monthly emissions")}</CardTitle>
            <CardDescription>{daily ? tl("Klik batang untuk memilih hari · arsir = hari berjalan · paling gelap = tertinggi", "Click a bar to pick a day · hatched = today · darkest = highest") : tl("Klik batang untuk memilih bulan · arsir = bulan berjalan · paling gelap = tertinggi", "Click a bar to pick a month · hatched = in progress · darkest = highest")}</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <PillBars height={250} selected={cur?.month} format={(v) => `${num(v / 1000, 2)} t`} onPick={(b) => setSel(b.key)}
              bars={rows.map((r: any) => ({ key: r.month, label: monthLabel(r.month), value: r.total, hatched: r.partial }))} />
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
                return (
                  <Link key={k} to={`/app/trace?date=${traceDate(cur)}&source=${k}`} className="group -mx-2 flex w-[calc(100%+1rem)] items-center gap-3.5 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-muted/60">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-full" style={{ background: `color-mix(in srgb, ${SOURCES[k]?.color} 18%, transparent)`, color: SOURCES[k]?.color }}><I className="size-5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{SOURCES[k]?.label ?? k}</span>
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
                return (
                  <div key={sc}>
                    <div className="mb-2 flex items-baseline justify-between text-sm"><span className="font-medium">Scope {sc}</span><span className="tabular"><b>{ton(cur.scope[sc])}</b> <span className="text-muted-foreground">· {pct(share, 1)}</span></span></div>
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

      <h2 className="pt-6 text-xl font-semibold tracking-tight">{tl("Analisis lanjutan", "Deeper analysis")}</h2>
      <Card>
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
    </div>
  )
}
