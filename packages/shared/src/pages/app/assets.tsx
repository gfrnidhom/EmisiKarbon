import { useState } from "react"
import { PeriodFilter, usePeriod } from "@/components/period-filter"
import { createPortal } from "react-dom"
import EcoReportPrint from "@/pages/print/eco-report"
import { Link, useNavigate } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { CloudRain, Droplets, Leaf, Plus, Printer, QrCode, Recycle, Snowflake, Sprout, Sun, Trees } from "lucide-react"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Field, PageHeader, PageSkeleton, SimpleSelect, Spinner, StatCard, StatusBadge } from "@/components/common"
import { hatch, PillBars, SegmentGauge } from "@/components/dash-kit"
import { CarbonBalanceStats, MoreSection } from "@/components/carbon-balance"
import { EditDialog, RowActions, usePerm } from "@/components/row-actions"
import { AssetQrCard, useTreeCardPrint } from "@/components/tree-qr-card"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { api } from "@/lib/api"
import { useGeo, useOrg } from "@/lib/hooks"
import { addDays, fmtDate, fmtMonth, num, pct, todayWIB } from "@/lib/format"
import { cn } from "@/lib/utils"
import { t as tr, tl } from "@/lib/i18n"

const TYPES: Record<string, { label: string; icon: any; fields: { k: string; label: string; type?: string; options?: string[] }[] }> = {
  biopori: { label: tr("Biopori"), icon: Droplets, fields: [{ k: "diameter_cm", label: tr("Diameter (cm)") }, { k: "depth_cm", label: tr("Kedalaman (cm)") }] },
  atap: { label: tr("Atap tangkapan hujan"), icon: CloudRain, fields: [{ k: "area_m2", label: tr("Luas atap (m²)") }, { k: "tank_l", label: tr("Tandon (L)") }] },
  komposter: { label: tr("Komposter"), icon: Recycle, fields: [{ k: "capacity_l", label: tr("Kapasitas (L)") }, { k: "kind", label: tr("Jenis"), type: "text" }] },
  bank_sampah: { label: tr("Bank sampah"), icon: Recycle, fields: [{ k: "name", label: tr("Nama"), type: "text" }] },
  panel: { label: tr("Panel surya"), icon: Sun, fields: [{ k: "kwp", label: tr("Kapasitas (kWp)") }, { k: "inverter", label: tr("Inverter"), type: "text" }] },
  ac: { label: tr("Unit AC"), icon: Snowflake, fields: [{ k: "gas", label: tr("Refrigeran"), options: ["R32", "R410A", "R134A", "R22"] }, { k: "charge_kg", label: tr("Muatan (kg)") }, { k: "room", label: tr("Ruang"), type: "text" }] },
}

/** Penghitung serapan pohon hari ini: bertambah tiap detik sesuai laju harian (estimasi model riap). */
/** Serapan pohon pada hari terakhir rentang — angka dari buku engine (tidak dihitung/diperkirakan di layar). */
function LiveUptake({ perDay, trees, motor, date, partial }: { perDay: number; trees: number; motor: number; date?: string; partial?: boolean }) {
  const sofar = perDay
  const frac = 1 // nilai dari buku engine sudah mencerminkan porsi hari (hari ini: sementara)
  const dayLabel = !date ? "" : date === todayWIB() ? tl("hari ini · sementara", "today · provisional") : date === addDays(todayWIB(), -1) ? tl("kemarin", "yesterday") : fmtDate(date)
  return (
    <div className="relative flex flex-col overflow-hidden rounded-2xl bg-primary-deep p-6 text-white">
      <div className="pointer-events-none absolute inset-0 opacity-60" style={{ backgroundImage: "repeating-radial-gradient(circle at 110% 120%, transparent 0 14px, rgb(255 255 255 / 0.05) 14px 16px)" }} />
      <div className="relative flex items-center justify-between">
        <span className="text-[1.0625rem] font-medium">{tl("Serapan pohon", "Tree uptake")} {dayLabel}</span>
        <span className="flex items-center gap-1.5 text-xs text-white/70"><span className={cn("size-2 rounded-full", partial ? "animate-pulse bg-amber-300" : "bg-emerald-300")} />{partial ? tl("sementara", "provisional") : tl("final", "final")}</span>
      </div>
      <div className="relative mt-6 text-center">
        <div className="text-[2.875rem] leading-none font-semibold tracking-tight tabular">{num(sofar, 3)}</div>
        <div className="mt-2 text-sm text-white/75">{tl("kg CO₂ diserap sejak 00.00 WIB", "kg CO₂ absorbed since 00:00 WIB")}</div>
        <div className="mx-auto mt-4 h-2 max-w-64 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-emerald-300 transition-all duration-1000" style={{ width: `${frac * 100}%` }} /></div>
      </div>
      <div className="relative mt-6 grid grid-cols-2 gap-3 text-center text-xs">
        <div className="rounded-xl bg-white/10 p-3"><div className="text-white/70">{tl("Perkiraan sehari", "Full-day estimate")}</div><div className="mt-0.5 text-base font-semibold tabular">{num(perDay, 2)} kg</div></div>
        <div className="rounded-xl bg-white/10 p-3"><div className="text-white/70">{tl("Laju", "Rate")}</div><div className="mt-0.5 text-base font-semibold tabular">{num((perDay * 1000) / 24, 0)} g/{tl("jam", "hr")}</div></div>
      </div>
      <p className="relative mt-4 text-center text-[0.6875rem] leading-snug text-white/65">
        {motor > 0 && <>{tl("Setara emisi", "Equal to emissions of")} <b className="text-white">{num(perDay / motor, 0)} km</b> {tl("perjalanan motor per hari", "of motorbike travel per day")} · </>}
        {trees} {tl("pohon sedang tumbuh · estimasi model riap, bukan pengukuran langsung", "trees growing · growth-model estimate, not a direct measurement")}
      </p>
    </div>
  )
}

export default function Assets() {
  const { orgId, org } = useOrg()
  const qc = useQueryClient()
  const geo = useGeo()
  const [period, setPeriod] = usePeriod("yesterday")
  const env = useQuery({ placeholderData: (p) => p, queryKey: ["env", orgId, period.start, period.end], queryFn: () => api<any>(`/orgs/${orgId}/environment?start=${period.start}&end=${period.end}`), enabled: !!orgId })
  const assets = useQuery({ queryKey: ["assets", orgId, "all"], queryFn: () => api<any[]>(`/orgs/${orgId}/assets`), enabled: !!orgId })
  const [add, setAdd] = useState<string | null>(null)
  const perm = usePerm()
  const [editA, setEditA] = useState<any>(null)
  const [viewQr, setViewQr] = useState<any>(null)
  const cards = useTreeCardPrint()
  const [meta, setMeta] = useState<Record<string, string>>({})
  const [treeMonth, setTreeMonth] = useState<string | null>(null)
  const nav = useNavigate()
  const create = useMutation({
    mutationFn: async () => {
      const p = await geo()
      return api(`/orgs/${orgId}/assets`, { method: "POST", json: { type: add, lat: p?.lat, lng: p?.lng, gps_accuracy: p?.accuracy, meta: Object.fromEntries(Object.entries(meta).map(([k, v]) => [k, isNaN(Number(v)) || v === "" ? v : Number(v)])) } })
    },
    onSuccess: () => { toast.success(tr("Aset tersimpan & QR dibuat")); setAdd(null); setMeta({}); qc.invalidateQueries({ queryKey: ["assets"] }); qc.invalidateQueries({ queryKey: ["env"] }) },
    onError: (e: Error) => toast.error(e.message),
  })
  if (env.isLoading || assets.isLoading) return <PageSkeleton />
  const a = env.data.avoided
  const tree = env.data.trees
  const todayUp = tree.daily[tree.daily.length - 1]
  const tm = tree.months.find((m: any) => m.period === treeMonth) ?? tree.months[tree.months.length - 1]
  const byType = (t: string) => (assets.data ?? []).filter((x) => x.type === t)
  return (
    <div className="space-y-5">
      {/* dokumen A4 tersembunyi — hanya tampil saat dialog cetak/PDF dibuka */}
      {createPortal(<EcoReportPrint env={env.data} orgName={org?.name ?? ""} period={period} />, document.body)}
      <PageHeader icon={Sprout} title={tr("Jasa lingkungan")} description={tl("Emisi terhindar & stok karbon pohon — dilaporkan di Rapor Jasa Lingkungan, terpisah dari Rapor Karbon (tidak dihitung ganda).", "Avoided emissions & tree carbon stock — reported in the Eco Services Report, separate from the Carbon Report (no double counting).")}
        actions={<>
          <PeriodFilter value={period} onChange={setPeriod} />
          <Button size="lg" className="h-11" variant="outline" onClick={() => window.print()}><Printer /> {tl("Cetak / PDF", "Print / PDF")}</Button>
        </>} />

      <CarbonBalanceStats org={org?.name} periodLabel={period.label} onTrees={() => nav("/app/trees")}
        input={{ emissionKg: env.data.emission?.total ?? tree.daily.reduce((acc: number, x: any) => acc + (x.emission ?? 0), 0), days: period.days, treeCount: tree.count ?? 0, absorbedKg: tree.absorbed ?? null, bySource: env.data.emission?.bySource }} />

      {/* emisi terhindar: satu kartu ringkas, angka dibaca dari kiri ke kanan */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl"><Recycle className="size-5 text-primary" />{tl("Emisi yang dihindari", "Emissions avoided")}</CardTitle>
          <CardDescription>{tl("Emisi yang tidak jadi terlepas karena sampah diolah & listrik dari surya", "Emissions prevented by treating waste & using solar power")} · {period.label}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            [Sprout, tl("Total", "Total"), a.totalCo2e, tl("kompos + bank sampah + PLTS", "compost + waste bank + solar"), true],
            [Recycle, tl("Kompos", "Compost"), a.kompos.co2e, tl(`${num(a.kompos.kg, 0)} kg sampah organik diolah`, `${num(a.kompos.kg, 0)} kg organic waste composted`), false],
            [Recycle, tl("Bank sampah", "Waste bank"), a.bankKertas.co2e, tl(`${num(a.bankKertas.kg, 0)} kg kertas · ${num(a.bankMaterial.kg, 0)} kg plastik/logam`, `${num(a.bankKertas.kg, 0)} kg paper · ${num(a.bankMaterial.kg, 0)} kg plastic/metal`), false],
            [Sun, tl("Panel surya", "Solar panels"), a.plts.co2e, tl(`${num(a.plts.kwh, 0)} kWh listrik surya`, `${num(a.plts.kwh, 0)} kWh of solar power`), false],
          ].map(([I, l, v, sub, main]: any) => (
            <div key={l} className={cn("rounded-2xl px-4 py-3.5", main ? "bg-primary/10 ring-1 ring-primary/20" : "bg-muted/50")}>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground"><I className="size-4 text-primary" />{l}</div>
              <div className="mt-1 text-2xl font-semibold tabular">{num(v, 0)} <span className="text-sm font-normal text-muted-foreground">kg CO₂e</span></div>
              <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <LiveUptake perDay={todayUp?.absorbed ?? 0} trees={todayUp?.active ?? 0} motor={tree.motorFactor} date={todayUp?.date} partial={todayUp?.partial} />
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-xl">{tl("Serapan pohon harian", "Daily tree uptake")}</CardTitle>
            <CardDescription>{tl("14 hari terakhir · kg CO₂ per hari · naik saat pohon diukur ulang atau ditanam", "Last 14 days · kg CO₂ per day · rises when trees are re-measured or planted")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-4">
            <PillBars height={190} format={(v) => `${num(v, 2)} kg`}
              bars={tree.daily.slice(-14).map((x: any) => ({ key: x.date, date: x.date, label: String(Number(x.date.slice(8))), value: x.absorbed, hatched: x.absorbed <= 0, current: x.date === tree.daily[tree.daily.length - 1].date }))} />
            {todayUp && todayUp.emission > 0 && (
              <div className="space-y-3 rounded-2xl bg-muted/50 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium">{tl("Serapan pohon dibanding emisi sekolah", "Tree uptake vs school emissions")} · {todayUp?.date === todayWIB() ? tl("hari ini", "today") : todayUp?.date === addDays(todayWIB(), -1) ? tl("kemarin", "yesterday") : fmtDate(todayUp?.date)}</span>
                  <span className="tabular"><b className="text-primary">{num(todayUp.absorbed, 2)} kg</b> <span className="text-muted-foreground">/ {num(todayUp.emission, 0)} kg CO₂e · {pct(todayUp.absorbed / todayUp.emission, 1)}</span></span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-card" style={hatch("var(--muted-foreground)")}><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max((todayUp.absorbed / todayUp.emission) * 100, 1.5)}%` }} /></div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {todayUp.active > 0 && <>{tl("Rata-rata satu pohon menyerap", "On average one tree absorbs")} <b className="text-foreground">{num((todayUp.absorbed / todayUp.active) * 1000, 0)} g CO₂/{tl("hari", "day")}</b>. {tl("Untuk menyerap emisi satu hari, dibutuhkan sekitar", "Absorbing one day of emissions would take about")} <b className="text-foreground">{num(todayUp.emission / (todayUp.absorbed / todayUp.active), 0)} {tl("pohon setara", "similar trees")}</b>. </>}
                  {tl("Hanya pembanding — serapan tidak mengurangi angka Rapor Karbon dan bukan kredit karbon.", "Comparison only — uptake does not reduce the Carbon Report and is not a carbon credit.")}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <MoreSection title={tl("Rincian serapan pohon & emisi terhindar", "Tree uptake & avoided emissions details")}>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-xl">{tl("Serapan karbon pohon", "Tree carbon uptake")}</CardTitle>
            <CardDescription>{tl("Per bulan, 12 bulan terakhir · arsir = belum ada serapan · klik bulan untuk detail", "Monthly, last 12 months · hatched = no uptake · click a month for details")}</CardDescription>
            <CardAction><Button size="sm" variant="outline" className="border-primary text-primary hover:text-primary" render={<Link to="/app/trees" />}><Trees /> {tl("Inventaris", "Inventory")}</Button></CardAction>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            {tm && (
              <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
                <span><span className="text-muted-foreground">{tl("Bulan dipilih", "Selected month")}</span> <b className="ml-1 tabular">{fmtMonth(tm.period)}</b></span>
                <span><span className="text-muted-foreground">{tl("Serapan", "Uptake")}</span> <b className="ml-1 tabular text-primary">+{num(tm.absorbed, 1)} kg CO₂</b></span>
                <span><span className="text-muted-foreground">{tl("Stok akhir bulan", "End-of-month stock")}</span> <b className="ml-1 tabular">{num(tm.stock / 1000, 2)} t</b></span>
                <span><span className="text-muted-foreground">{tl("Pohon", "Trees")}</span> <b className="ml-1 tabular">{tm.count}</b></span>
              </div>
            )}
            <PillBars height={230} selected={tm?.period} format={(v) => `${num(v, 0)} kg`} onPick={(b) => setTreeMonth(b.key)}
              bars={tree.months.map((m: any) => ({ key: m.period, label: fmtDate(`${m.period}-01`, { month: "short" }).replace(".", ""), value: m.absorbed, hatched: m.absorbed <= 0 }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-xl">{tl("Komposisi emisi terhindar", "Avoided emissions mix")}</CardTitle><CardDescription>{fmtDate(period.start)} – {fmtDate(period.end)}</CardDescription></CardHeader>
          <CardContent className="flex flex-1 flex-col justify-between gap-4">
            <SegmentGauge value={pct(a.totalCo2e ? a.kompos.co2e / a.totalCo2e : 0)} label={tr("Kompos")}
              parts={[{ v: a.kompos.co2e, color: "var(--primary)" }, { v: a.bankKertas.co2e, color: "var(--primary-deep)" }, { v: a.plts.co2e, color: "var(--scope1)" }]} />
            <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
              <span className="flex items-center gap-2"><span className="size-3.5 rounded-full bg-primary" />{tr("Kompos")}</span>
              <span className="flex items-center gap-2"><span className="size-3.5 rounded-full bg-primary-deep" />{tr("Bank sampah")}</span>
              <span className="flex items-center gap-2"><span className="size-3.5 rounded-full bg-scope1" />PLTS</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-xl">{tl("Stok karbon per jenis pohon", "Carbon stock by species")}</CardTitle>
            <CardDescription>{num(tree.stock / 1000, 2)} t CO₂ · {tree.count} {tl("pohon terpantau", "trees monitored")}{tree.stopped ? ` · ${tree.stopped} ${tl("proyeksi berhenti (perlu ukur ulang)", "projection stopped (re-measure)")}` : ""}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {tree.species.map((sp: any) => {
              const share = tree.stock ? sp.stock / tree.stock : 0
              return (
                <div key={sp.name} className="-mx-2 grid grid-cols-[auto_1fr_auto] items-center gap-3.5 rounded-xl px-2 py-2.5 transition-colors hover:bg-muted/60">
                  <span className="flex size-11 items-center justify-center rounded-full bg-primary/12 text-primary"><Trees className="size-5" /></span>
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2"><span className="truncate font-medium">{sp.name}</span><i className="truncate text-xs text-muted-foreground">{sp.scientific}</i></div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${Math.max(share * 100, 2)}%` }} /></div>
                  </div>
                  <div className="text-right text-sm"><div className="font-semibold tabular">{num(sp.stock / 1000, 2)} t</div><div className="text-xs text-muted-foreground">{sp.count} {tl("pohon", "trees")} · {pct(share, 0)}</div>{sp.daily > 0 && <div className="text-xs font-medium text-primary tabular">+{num(sp.daily * 1000, 0)} g/{tl("hari", "day")}</div>}</div>
                </div>
              )
            })}
            {!tree.species.length && <p className="py-8 text-center text-sm text-muted-foreground">{tl("Belum ada pohon terdaftar.", "No trees registered yet.")}</p>}
          </CardContent>
        </Card>
        <div className="grid gap-5">
          <StatCard featured label={tr("Stok karbon pohon")} icon={Trees} value={<>{num(tree.stock / 1000, 2)} <span className="text-base font-normal text-white/75">t CO₂</span></>} sub={`${tree.count} ${tl("pohon · bukan kredit karbon", "trees · not a carbon credit")}`} onClick={() => nav("/app/trees")} />
          <StatCard label={tl("Serapan periode ini", "Uptake this period")} icon={Leaf} tone="leaf" value={<>+{num(tree.absorbed, 0)} <span className="text-base font-normal text-muted-foreground">kg CO₂</span></>} sub={`${fmtDate(period.start)} – ${fmtDate(period.end)}${tree.released ? ` · ${tl("lepas", "released")} ${num(tree.released, 0)} kg` : ""}`} />
          <StatCard label={tr("Biopori")} icon={Droplets} tone="scope3" value={<>{num(a.biopori.count)} <span className="text-base font-normal text-muted-foreground">{tr("lubang")}</span></>} sub={`${num(a.biopori.liters, 0)} L ${tr("kapasitas tampung")}`} />
        </div>
      </div>
      </MoreSection>

      <Card>
        <CardHeader><CardTitle>{tr("Aset ber-QR")}</CardTitle><CardDescription>{tr("Scan membuka kartu aset sesuai jenis")}</CardDescription>
          {perm.manage && <CardAction><SimpleSelect size="sm" value={null} onChange={(v) => { setAdd(v); setMeta({}) }} placeholder={tr("+ Tambah aset")} options={Object.entries(TYPES).map(([k, v]) => ({ value: k, label: v.label }))} /></CardAction>}
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="biopori">
            <TabsList className="flex-wrap">{Object.entries(TYPES).map(([k, v]) => <TabsTrigger key={k} value={k}>{v.label} <Badge variant="secondary" className="ml-1 h-4 px-1 text-[0.625rem]">{byType(k).length}</Badge></TabsTrigger>)}</TabsList>
            {Object.entries(TYPES).map(([k, v]) => (
              <TabsContent key={k} value={k} className="mt-3 space-y-2">
                {byType(k).length > 0 && <div className="flex justify-end"><Button size="sm" variant="outline" onClick={() => cards.print(byType(k), org?.name ?? "")}><Printer /> {tl(`Cetak ${byType(k).length} kartu QR`, `Print ${byType(k).length} QR cards`)}</Button></div>}
                <div className="max-h-80 overflow-y-auto rounded-2xl border">
                  <Table>
                    <TableHeader><TableRow><TableHead>{tr("Kode")}</TableHead>{v.fields.map((f) => <TableHead key={f.k}>{f.label}</TableHead>)}<TableHead>{tr("Status")}</TableHead><TableHead className="w-10" /></TableRow></TableHeader>
                    <TableBody>{byType(k).map((x) => (
                      <TableRow key={x.id}><TableCell className="font-mono text-xs">{x.code}</TableCell>{v.fields.map((f) => <TableCell key={f.k}>{String(x.meta?.[f.k] ?? "–")}</TableCell>)}<TableCell><StatusBadge status={x.status} /></TableCell>
                        <TableCell className="text-right"><RowActions onView={() => setViewQr(x)} extra={<DropdownMenuItem onClick={() => cards.print([x], org?.name ?? "")} className="gap-2.5 rounded-lg"><Printer className="size-4" />{tl("Cetak kartu QR", "Print QR card")}</DropdownMenuItem>} onEdit={perm.manage ? () => setEditA({ ...x, _type: k }) : undefined} del={perm.manage ? { path: `/assets/${x.uuid ?? x.id}`, title: tr(`Hapus ${v.label} ${x.code}?`), description: tr("Aset dihapus permanen; jasa lingkungan dihitung ulang."), invalidate: [["assets"], ["env"]] } : undefined} /></TableCell></TableRow>
                    ))}</TableBody>
                  </Table>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
      <Dialog open={!!add} onOpenChange={(o) => !o && setAdd(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{tr("Tambah")} {add && TYPES[add].label.toLowerCase()}</DialogTitle><DialogDescription>{tr("Lokasi GPS diambil otomatis saat menyimpan.")}</DialogDescription></DialogHeader>
          <div className="grid gap-5 sm:grid-cols-2">
            {add && TYPES[add].fields.map((f) => (
              <Field key={f.k} label={f.label}>
                {f.options ? <SimpleSelect value={meta[f.k] ?? null} onChange={(v) => setMeta({ ...meta, [f.k]: v })} options={f.options.map((o) => ({ value: o, label: o }))} />
                  : <Input type={f.type ?? "number"} step="any" value={meta[f.k] ?? ""} onChange={(e) => setMeta({ ...meta, [f.k]: e.target.value })} />}
              </Field>
            ))}
          </div>
          <DialogFooter><Button onClick={() => create.mutate()} disabled={create.isPending}>{create.isPending ? <Spinner /> : <Plus />} {tr("Simpan")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      {editA && <EditDialog open={!!editA} onOpenChange={(o) => !o && setEditA(null)} title={tr(`Ubah ${editA.code}`)}
        fields={TYPES[editA._type].fields.map((f: any) => ({ key: f.k, label: f.label, type: f.type === "text" ? "text" : "number" }))}
        initial={Object.fromEntries(TYPES[editA._type].fields.map((f: any) => [f.k, editA.meta?.[f.k] ?? ""]))}
        save={(v) => api(`/assets/${editA.uuid ?? editA.id}`, { method: "PATCH", json: { meta: v } })} invalidate={[["assets"], ["env"]]} />}
      {cards.node}
      <Dialog open={!!viewQr} onOpenChange={(o) => !o && setViewQr(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><QrCode className="size-4" />{viewQr?.code}</DialogTitle><DialogDescription>{tl("Kartu QR aset — tempel di dekat aset agar mudah dipindai.", "Asset QR card — stick it near the asset so it is easy to scan.")}</DialogDescription></DialogHeader>
          {viewQr && <div className="flex justify-center overflow-x-auto py-2"><AssetQrCard t={viewQr} orgName={org?.name ?? ""} /></div>}
          <DialogFooter><Button onClick={() => { cards.print([viewQr], org?.name ?? ""); setViewQr(null) }}><Printer /> {tl("Cetak kartu QR", "Print QR card")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
