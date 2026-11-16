import { useEffect } from "react"
import { createPortal } from "react-dom"
import ReportDocument from "@/pages/print/report-doc"
import { Link, useNavigate, useParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { QRCodeSVG } from "qrcode.react"
import { toast } from "sonner"
import * as XLSX from "xlsx"
import { ArrowLeft, CalendarRange, Check, FileBarChart2, FileSpreadsheet, Flame, Leaf, Printer, RefreshCcw, Recycle, Send, ShieldCheck, Sprout, Sun, Trees, Users, Zap } from "lucide-react"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ErrorState, HeroChip, PageHeader, PageSkeleton, StatusBadge } from "@/components/common"
import { PillBars, StatTile } from "@/components/dash-kit"
import { CountUp } from "@/components/interactive-charts"
import { api } from "@/lib/api"
import { fmtDate, fmtDateTime, fmtMonth, groupByScope, num, pct, signedPct, SOURCES } from "@/lib/format"
import { ScopeHeading } from "@/components/scope-group"
import { canonicalUuidPath, cn } from "@/lib/utils"
import { t, tl } from "@/lib/i18n"

const SCOPE_COLOR = { 1: "var(--scope1)", 2: "var(--scope2)", 3: "var(--scope3)" } as const
const SCOPE_TEXT = { 1: ["Bahan bakar & refrigeran", "Fuel & refrigerant"], 2: ["Listrik PLN", "Grid electricity"], 3: ["Mobilitas, sampah, air limbah, kertas", "Mobility, waste, wastewater, paper"] } as const

/** Rapor di dalam aplikasi — gaya dasbor dengan sidebar. Versi A4/PDF ada di /print/reports/:id. */
export default function ReportView() {
  const { id } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const { data: r, isLoading, error } = useQuery({ queryKey: ["report", id], queryFn: () => api<any>(`/reports/${id}`) })
  useEffect(() => { const to = canonicalUuidPath("/app/reports", id, r?.uuid); if (to) nav(to, { replace: true }) }, [r?.uuid]) // eslint-disable-line
  const act = useMutation({
    mutationFn: (a: string) => api(`/reports/${id}/${a}`, { method: "POST" }),
    onSuccess: (_, a) => { toast.success(a === "request" ? tl("Diajukan ke Admin", "Submitted to Admin") : tl("Data rapor diperbarui", "Report data refreshed")); qc.invalidateQueries({ queryKey: ["report", id] }); qc.invalidateQueries({ queryKey: ["reports"] }) },
    onError: (e: Error) => toast.error(e.message),
  })
  if (isLoading) return <PageSkeleton />
  if (error || !r) return <ErrorState error={error ?? new Error("Rapor tidak ditemukan")} />

  const s = r.snapshot
  const roles: string[] = r.myRoles ?? []
  const karbon = r.kind === "karbon"
  const official = r.status === "terkunci"
  const title = karbon ? tl("Rapor Karbon", "Carbon Report") : tl("Rapor Jasa Lingkungan", "Eco Services Report")
  const canEdit = roles.includes("operator") || roles.includes("admin")
  const monthly: [string, number][] = karbon ? Object.entries<number>(s.monthly ?? {}) : []

  const exportXlsx = () => {
    const wb = XLSX.utils.book_new()
    const head = [["Rapor", title], ["Lembaga", s.org.name], ["Periode", `${s.period.start} s.d. ${s.period.end}`], ["Versi baseline", s.baselineVersion], ["Status", r.status], ["Hash", r.hash ?? "-"]]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(head), "Ringkasan")
    if (karbon) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s.sources.map((x: any) => ({ sumber: x.label, scope: x.scope, total_kg: x.total, resmi_kg: x.verified, catatan_kg: x.other }))), "Per_sumber")
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(monthly.map(([m, v]) => ({ bulan: m, kg_co2e: v }))), "Bulanan")
    } else {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ stok_kg: s.trees.stock, serapan_kg: s.trees.absorbed, pelepasan_kg: s.trees.released, kompos_kg: s.avoided.kompos.co2e, bank_kertas_kg: s.avoided.bankKertas.co2e, plts_kg: s.avoided.plts.co2e, biopori_l: s.avoided.biopori.liters }]), "Jasa_lingkungan")
    }
    XLSX.writeFile(wb, `rapor-${r.kind}-${s.period.start}.xlsx`)
  }

  return (
    <div className="space-y-5">
      {/* dokumen A4 tersembunyi — hanya tampil saat dialog cetak/PDF dibuka dari halaman ini */}
      {createPortal(<ReportDocument report={r} />, document.body)}
      <PageHeader icon={FileBarChart2} title={title} badge={<StatusBadge status={r.status} />}
        description={<>{s.org.name} · {r.period_label}</>}
        meta={<>
          <HeroChip><CalendarRange className="size-3.5" />{fmtDate(s.period.start)} – {fmtDate(s.period.end)}</HeroChip>
          <HeroChip>{tl("Baseline", "Baseline")} <b className="font-medium text-foreground">{s.baselineVersion ?? "—"}</b></HeroChip>
          <HeroChip><Users className="size-3.5" />{num(s.org.population)} {tl("warga", "people")}</HeroChip>
          {r.published_at && <HeroChip>{tl("Terbit", "Published")} {fmtDate(r.published_at)}</HeroChip>}
        </>}
        actions={<>
          <Button variant="outline" render={<Link to="/app/reports" />}><ArrowLeft /> {tl("Semua rapor", "All reports")}</Button>
          {["draf", "perlu_perbaikan", "perlu_tinjau"].includes(r.status) && canEdit && <Button variant="outline" onClick={() => act.mutate("refresh")} disabled={act.isPending}><RefreshCcw /> {tl("Perbarui data", "Refresh data")}</Button>}
          {["draf", "perlu_perbaikan"].includes(r.status) && canEdit && <Button onClick={() => act.mutate("request")} disabled={act.isPending}><Send /> {tl("Ajukan ke Admin", "Submit to Admin")}</Button>}
          <Button variant="outline" onClick={exportXlsx}><FileSpreadsheet /> Excel</Button>
          <Button onClick={() => window.print()}><Printer /> {tl("Cetak / PDF", "Print / PDF")}</Button>
        </>} />

      {karbon ? (
        <>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile featured title={tl("Total emisi", "Total emissions")} value={<CountUp value={s.total / 1000} format={(v) => num(v, 2)} />} unit="t CO₂e"
              foot={<span className="text-[0.8125rem] text-white/80">{r.period_label}</span>} />
            <StatTile title={tl("Angka resmi", "Official figure")} icon={ShieldCheck} value={<CountUp value={s.officialTotal / 1000} format={(v) => num(v, 2)} />} unit="t"
              foot={<span className="text-[0.8125rem] text-primary">{pct(s.total ? s.officialTotal / s.total : 0)} {tl("sudah disahkan", "approved")}</span>} />
            <StatTile title={tl("Per orang per tahun", "Per person per year")} icon={Users} value={<CountUp value={s.perPersonYear} format={(v) => num(v, 1)} />} unit="kg"
              foot={<span className="text-[0.8125rem] text-muted-foreground">{num(s.org.population)} {tl("warga sekolah", "school members")}</span>} />
            <StatTile title={tl("Per hari aktif", "Per active day")} icon={CalendarRange} value={<CountUp value={s.perActiveDay} format={(v) => num(v, 0)} />} unit="kg CO₂e"
              foot={<span className="text-[0.8125rem] text-muted-foreground">{tl("rata-rata hari sekolah", "average school day")}</span>} />
          </div>

          <div className="grid gap-5 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader><CardTitle className="text-xl">{tl("Emisi bulanan", "Monthly emissions")}</CardTitle><CardDescription>{tl("t CO₂e per bulan dalam periode rapor", "t CO₂e per month in the report period")}</CardDescription></CardHeader>
              <CardContent className="pt-4">
                {monthly.length ? <PillBars height={230} format={(v) => `${num(v / 1000, 2)} t`} bars={monthly.map(([m, v]) => ({ key: m, label: fmtMonth(m).slice(0, 3), value: v }))} />
                  : <p className="py-10 text-center text-sm text-muted-foreground">{tl("Belum ada data bulanan.", "No monthly data yet.")}</p>}
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle className="text-xl">{tl("Komposisi scope", "Scope breakdown")}</CardTitle><CardDescription>{tl("Porsi dari total emisi", "Share of total emissions")}</CardDescription></CardHeader>
              <CardContent className="space-y-5 pt-2">
                {([1, 2, 3] as const).map((sc) => {
                  const share = s.total ? s.scope[sc] / s.total : 0
                  return (
                    <div key={sc}>
                      <div className="mb-2 flex items-baseline justify-between text-sm"><span className="flex items-center gap-2 font-medium"><span className="size-2.5 rounded-full" style={{ background: SCOPE_COLOR[sc] }} />Scope {sc}</span><span className="tabular"><b>{num(s.scope[sc] / 1000, 2)} t</b> <span className="text-muted-foreground">· {pct(share, 1)}</span></span></div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full transition-all duration-700" style={{ width: `${share * 100}%`, background: SCOPE_COLOR[sc] }} /></div>
                      <p className="mt-1.5 text-xs text-muted-foreground">{tl(SCOPE_TEXT[sc][0], SCOPE_TEXT[sc][1])}</p>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-xl">{tl("Rincian per sumber", "Breakdown by source")}</CardTitle><CardDescription>{tl("Resmi = data yang sudah disahkan · Catatan = proyeksi/estimasi yang belum disahkan · vs baseline = intensitas per hari aktif per orang", "Official = approved data · Notes = projections/estimates not yet approved · vs baseline = intensity per active day per person")}</CardDescription></CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader><TableRow><TableHead className="pl-6">{tl("Sumber", "Source")}</TableHead><TableHead>Scope</TableHead><TableHead className="text-right">{tl("Total (kg)", "Total (kg)")}</TableHead><TableHead className="hidden text-right md:table-cell">{tl("Resmi", "Official")}</TableHead><TableHead className="hidden text-right md:table-cell">{tl("Catatan", "Notes")}</TableHead><TableHead className="text-right">{tl("Porsi", "Share")}</TableHead><TableHead className="pr-6 text-right">vs baseline</TableHead></TableRow></TableHeader>
                <TableBody>
                  {groupByScope(s.sources, (x: any) => x.source, null, (x: any) => x.scope).map((g) => [
                    <TableRow key={`scope-${g.scope}`} className="bg-muted/40 hover:bg-muted/40"><TableCell colSpan={7} className="py-2 pr-6 pl-6"><ScopeHeading compact scope={g.scope} totalKg={g.items.reduce((acc: number, x: any) => acc + x.total, 0)} /></TableCell></TableRow>,
                    ...g.items.map((x: any) => {
                    const vb = s.vsBaseline?.find((v: any) => v.source === x.source)
                    return (
                      <TableRow key={x.source}>
                        <TableCell className="pl-6 font-medium"><span className="mr-2 inline-block size-2.5 rounded-full align-middle" style={{ background: SOURCES[x.source]?.color }} />{x.label}</TableCell>
                        <TableCell>{x.scope}</TableCell>
                        <TableCell className="text-right font-semibold tabular">{num(x.total, 0)}</TableCell>
                        <TableCell className="hidden text-right tabular md:table-cell">{num(x.verified, 0)}</TableCell>
                        <TableCell className="hidden text-right tabular text-muted-foreground md:table-cell">{num(x.other, 0)}</TableCell>
                        <TableCell className="text-right tabular">{pct(s.total ? x.total / s.total : 0, 1)}</TableCell>
                        <TableCell className={cn("pr-6 text-right tabular", vb?.change < 0 ? "text-primary" : vb?.change > 0 ? "text-amber-600" : "text-muted-foreground")}>{signedPct(vb?.change)}</TableCell>
                      </TableRow>
                    )
                  })])}
                  <TableRow className="font-semibold"><TableCell className="pl-6">Total</TableCell><TableCell /><TableCell className="text-right tabular">{num(s.total, 0)}</TableCell><TableCell className="hidden text-right tabular md:table-cell">{num(s.officialTotal, 0)}</TableCell><TableCell className="hidden text-right tabular md:table-cell">{num(s.total - s.officialTotal, 0)}</TableCell><TableCell className="text-right">100%</TableCell><TableCell /></TableRow>
                </TableBody>
              </Table>
              {s.notes?.length > 0 && <div className="mx-6 mt-4 rounded-2xl border border-dashed border-primary/25 p-4 text-sm"><b>{tl("Catatan data non-resmi", "Unofficial data notes")}</b><ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">{s.notes.map((n: string) => <li key={n}>{n}</li>)}</ul></div>}
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile featured title={tl("Stok karbon pohon", "Tree carbon stock")} value={<CountUp value={s.trees.stock / 1000} format={(v) => num(v, 2)} />} unit="t CO₂"
              foot={<span className="text-[0.8125rem] text-white/80">{num(s.trees.count)} {tl("pohon terpantau", "trees monitored")}</span>} />
            <StatTile title={tl("Serapan periode", "Uptake in period")} icon={Sprout} value={<CountUp value={s.trees.absorbed} format={(v) => num(v, 0)} />} unit="kg CO₂" />
            <StatTile title={tl("Pelepasan (pohon mati)", "Released (dead trees)")} icon={Trees} value={<CountUp value={s.trees.released} format={(v) => num(v, 0)} />} unit="kg CO₂" />
            <StatTile title={tl("Emisi terhindar", "Avoided emissions")} icon={Leaf} value={<CountUp value={s.avoided.totalCo2e} format={(v) => num(v, 0)} />} unit="kg CO₂e" />
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-xl">{tl("Emisi terhindar", "Avoided emissions")}</CardTitle><CardDescription>{tl("Dibanding skenario tanpa aksi", "Compared with no action")}</CardDescription></CardHeader>
              <CardContent className="space-y-1">
                {[
                  [Recycle, tl("Kompos (dibanding ke TPA)", "Compost (vs landfill)"), `${num(s.avoided.kompos.kg, 0)} kg`, `${num(s.avoided.kompos.co2e, 1)} kg`],
                  [Recycle, tl("Bank sampah kertas", "Paper waste bank"), `${num(s.avoided.bankKertas.kg, 0)} kg`, `${num(s.avoided.bankKertas.co2e, 1)} kg`],
                  [Recycle, tl("Bank sampah plastik/logam", "Plastic/metal waste bank"), `${num(s.avoided.bankMaterial.kg, 0)} kg`, tl("tanpa klaim", "no claim")],
                  [Sun, tl("Panel surya (PLTS)", "Solar panels"), `${num(s.avoided.plts.kwh, 0)} kWh`, `${num(s.avoided.plts.co2e, 1)} kg`],
                ].map(([I, label, qty, co2]: any) => (
                  <div key={label} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-muted/60">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><I className="size-[1.125rem]" /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{label}</span><span className="block text-xs text-muted-foreground">{qty}</span></span>
                    <span className="text-sm font-semibold tabular">{co2}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-xl">{tl("Pohon & biopori", "Trees & biopores")}</CardTitle><CardDescription>{tl("Estimasi pelaporan internal, bukan kredit karbon", "Internal reporting estimate, not a carbon credit")}</CardDescription></CardHeader>
              <CardContent className="space-y-1">
                {[
                  [Trees, tl("Pohon terpantau", "Trees monitored"), num(s.trees.count)],
                  [Leaf, tl("Stok karbon akhir periode", "Stock at period end"), `${num(s.trees.stock / 1000, 2)} t CO₂`],
                  [Sprout, tl("Serapan selama periode", "Uptake in period"), `${num(s.trees.absorbed, 0)} kg CO₂`],
                  [Flame, tl("Pelepasan (pohon mati)", "Released (dead trees)"), `${num(s.trees.released, 0)} kg CO₂`],
                  [Zap, tl("Biopori · kapasitas tampung", "Biopores · capacity"), `${num(s.avoided.biopori.count)} · ${num(s.avoided.biopori.liters, 0)} L`],
                ].map(([I, label, v]: any) => (
                  <div key={label} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-muted/60">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><I className="size-[1.125rem]" /></span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
                    <span className="text-sm font-semibold tabular">{v}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* ---------- keabsahan ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{tl("Keabsahan & pengesahan", "Validity & approval")}</CardTitle>
          <CardDescription>{s.disclaimer}</CardDescription>
          {official && r.hash && <CardAction><Button variant="outline" size="sm" render={<Link to={`/verify/${r.hash}`} />}><ShieldCheck /> {tl("Cek keaslian", "Verify")}</Button></CardAction>}
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-[1fr_auto]">
          <ol className="grid gap-3 sm:grid-cols-3">
            {[
              [tl("Disusun operator", "Prepared by operator"), true, fmtDateTime(s.generatedAt)],
              [tl("Diajukan ke Admin", "Submitted to Admin"), ["diajukan", "terkunci"].includes(r.status), null],
              [tl("Disahkan & terkunci", "Approved & locked"), official, r.published_at ? fmtDateTime(r.published_at) : null],
            ].map(([label, done, when]: any, i) => (
              <li key={label} className="flex items-start gap-3 rounded-2xl bg-muted/50 p-4">
                <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold", done ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground ring-1 ring-border")}>{done ? <Check className="size-4" /> : i + 1}</span>
                <span className="min-w-0"><span className={cn("block text-sm font-medium", !done && "text-muted-foreground")}>{label}</span><span className="block text-xs text-muted-foreground">{when ?? (done ? "" : tl("belum", "pending"))}</span></span>
              </li>
            ))}
          </ol>
          {official && r.hash ? (
            <div className="flex items-center gap-4 rounded-2xl bg-muted/50 p-4">
              <div className="rounded-lg bg-white p-1.5"><QRCodeSVG value={`${location.origin}/verify/${r.hash}`} size={72} /></div>
              <div className="max-w-56 text-xs text-muted-foreground"><div className="font-medium text-foreground">{tl("QR keaslian", "Authenticity QR")}</div><span className="font-mono break-all">{r.hash.slice(0, 24)}…</span></div>
            </div>
          ) : <p className="self-center rounded-2xl bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">{tl("Masih draf. QR keaslian muncul setelah rapor disahkan Admin.", "Still a draft. The authenticity QR appears once the Admin approves the report.")}</p>}
        </CardContent>
      </Card>
    </div>
  )
}
