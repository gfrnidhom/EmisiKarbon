import { useState, useEffect } from "react"
import { canonicalUuidPath } from "@/lib/utils"
import { Link, useNavigate, useParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { QRCodeSVG } from "qrcode.react"
import { toast } from "sonner"
import { ArrowLeft, ExternalLink, Printer, Ruler, Skull, TreeDeciduous } from "lucide-react"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ErrorState, Field, HeroCard, PageSkeleton, QualityBadge, SimpleSelect, StatCard, StatusBadge } from "@/components/common"
import { GrowthChart } from "@/components/charts"
import { MeasureForm } from "@/components/measure-form"
import { TreeMap } from "@/components/tree-map"
import { api, fileUrl } from "@/lib/api"
import { useOrg } from "@/lib/hooks"
import { fmtDate, num, todayWIB } from "@/lib/format"
import { qrUrl } from "./trees"
import { TreeQrCard, useTreeCardPrint } from "@/components/tree-qr-card"
import { t as tr, tl } from "@/lib/i18n"
import { EditDialog, RowActions, usePerm } from "@/components/row-actions"

export default function TreeDetail() {
  const { id } = useParams()
  const { orgId, org, can } = useOrg()
  const qc = useQueryClient()
  const { data: t, isLoading, error } = useQuery({ queryKey: ["asset", id], queryFn: () => api<any>(`/assets/${id}`) })
  const navCanon = useNavigate()
  useEffect(() => { const to = canonicalUuidPath("/app/trees", id, t?.uuid); if (to) navCanon(to, { replace: true }) }, [t?.uuid]) // eslint-disable-line
  const [field, setField] = useState<"dbh" | "stock">("stock")
  const [measure, setMeasure] = useState(false)
  const [dead, setDead] = useState(false)
  const [deadForm, setDeadForm] = useState({ status: "mati", dead_at: todayWIB(), dead_reason: "" })
  const mark = useMutation({
    mutationFn: () => api(`/assets/${id}`, { method: "PATCH", json: deadForm }),
    onSuccess: () => { toast.success(tr("Status pohon diperbarui — stok dikurangkan sebagai pelepasan")); setDead(false); qc.invalidateQueries({ queryKey: ["asset", id] }); qc.invalidateQueries({ queryKey: ["assets"] }) },
    onError: (e: Error) => toast.error(e.message),
  })
  const cards = useTreeCardPrint()
  const perm = usePerm()
  const [editM, setEditM] = useState<any>(null)
  if (isLoading) return <PageSkeleton />
  if (error) return <ErrorState error={error} />
  const s = t.summary
  const ops = t.measurements.filter((m: any) => m.measurer_role === "operator")
  const g = s?.growthHistory?.[s.growthHistory.length - 1]
  return (
    <div className="space-y-8">
      {cards.node}
      {editM && <EditDialog open={!!editM} onOpenChange={(o) => !o && setEditM(null)} title={tl(`Ubah pengukuran ${fmtDate(editM.date)}`, `Edit measurement ${fmtDate(editM.date)}`)} description={tl("Stok karbon & riap dihitung ulang otomatis.", "Carbon stock & growth are recalculated.")}
        fields={[{ key: "date", label: tl("Tanggal", "Date"), type: "date" }, { key: "dbh", label: tl("DBH (cm)", "DBH (cm)"), type: "number" }, { key: "height", label: tl("Tinggi (m)", "Height (m)"), type: "number" }]}
        initial={{ date: editM.date, dbh: editM.dbh, height: editM.height ?? "" }} save={(v) => api(`/measurements/${editM.id}`, { method: "PATCH", json: v })} invalidate={[["asset"], ["assets"]]} />}
      <HeroCard>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" render={<Link to="/app/trees" />}><ArrowLeft /></Button>
          <div className="flex size-11 items-center justify-center rounded-xl bg-leaf/15 text-leaf"><TreeDeciduous className="size-5" /></div>
          <div>
            <div className="flex items-center gap-2"><h1 className="text-2xl font-semibold tracking-tight">{s?.species ?? tr("Pohon")}</h1><StatusBadge status={t.status} /><QualityBadge label={s?.state?.label} /></div>
            <p className="font-mono text-xs text-muted-foreground">{t.code} · <i className="font-sans">{s?.scientific}</i> · {s?.model}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" render={<a href={qrUrl(t.code, t.qr_sig)} target="_blank" rel="noreferrer" />}><ExternalLink /> {tr("Profil publik")}</Button>
          <Button variant="outline" size="sm" onClick={() => cards.print([t], org?.name ?? t.org_name ?? "")}><Printer /> {tr("Cetak kartu QR")}</Button>
          {t.status === "hidup" && can("operator", "petugas", "admin") && <>
            {perm.manage && <Button variant="outline" size="sm" onClick={() => setDead(true)}><Skull /> {tr("Tandai mati")}</Button>}
            <Button size="sm" onClick={() => setMeasure(true)}><Ruler /> {tr("Ukur ulang")}</Button>
          </>}
          {perm.manage && <RowActions del={{ path: `/assets/${t.uuid ?? t.id}`, title: tl(`Hapus pohon ${t.code}?`, `Delete tree ${t.code}?`), description: tl("Pohon beserta seluruh riwayat pengukurannya dihapus permanen. Untuk pohon mati/ditebang, gunakan Tandai mati.", "The tree and all measurements are removed permanently. For dead/felled trees use Mark dead."), invalidate: [["assets"]], onDone: () => navCanon("/app/trees", { replace: true }) }} />}
        </div>
      </div>
      </HeroCard>
      {s?.state?.stopped && <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-300">{tr("Proyeksi berhenti: > 12 bulan tanpa ukur ulang — serapan dihitung 0 sampai diukur kembali.")}</div>}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={tr("DBH hari ini")} value={`${num(s?.state?.dbh, 2)} cm`} sub={s?.last ? `Terukur ${num(s.last.dbh, 1)} cm · ${fmtDate(s.last.date)}` : tr("Belum diukur")} />
        <StatCard label={tr("Stok CO₂")} value={`${num(s?.state?.stock, 1)} kg`} tone="leaf" sub={s?.extrapolated ? tr("Ekstrapolasi (di luar rentang DBH valid)") : tr("Dalam rentang alometrik")} />
        <StatCard label={tr("Riap")} value={`${num(g?.growth, 2)} cm/th`} sub={g?.source === "terukur" ? tr("Terkalibrasi dari ukur ulang") : tr("Riap default jenis")} />
        <StatCard label={tr("Sejak ukur terakhir")} value={`${num(s?.daysSince)} hari`} tone={s?.dueRemeasure ? "warn" : "default"} sub={s?.dueRemeasure ? tr("Jatuh tempo ukur ulang (6 bulan)") : tr("Ukur ulang tiap 6 bulan")} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>{tr("Pertumbuhan: proyeksi vs terukur")}</CardTitle>
            <CardDescription>Garis putus = proyeksi riap; garis hijau = terukur/rekonsiliasi antar-pengukuran</CardDescription>
            <CardAction><Tabs value={field} onValueChange={(v) => setField(v as any)}><TabsList><TabsTrigger value="stock">{tr("Stok CO₂")}</TabsTrigger><TabsTrigger value="dbh">{tr("DBH")}</TabsTrigger></TabsList></Tabs></CardAction>
          </CardHeader>
          <CardContent><GrowthChart data={t.series} field={field} unit={field === "dbh" ? "cm" : "kg"} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{tr("Lokasi & QR")}</CardTitle><CardDescription>{t.lat ? `${t.lat.toFixed(5)}, ${t.lng.toFixed(5)} · ±${num(t.gps_accuracy)} m` : tr("Belum ada GPS")}</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {t.lat && <TreeMap points={[{ id: t.id, lat: t.lat, lng: t.lng, label: t.code, kind: "pohon", size: s?.state?.dbh }]} selectedId={t.id} height={240} />}
            <div className="space-y-2">
              <div className="overflow-x-auto pb-1 [scrollbar-width:none]"><TreeQrCard t={t} orgName={org?.name ?? t.org_name ?? ""} /></div>
              <p className="text-xs text-muted-foreground">{tr("QR bertanda tangan HMAC. Label hilang → cetak ulang kode yang sama, cocokkan GPS + foto.")}</p>
              {t.flags?.map((f: string) => <Badge key={f} variant="outline" className="border-amber-500/30 text-amber-600">{f}</Badge>)}
            </div>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>{tr("Riwayat pengukuran")}</CardTitle><CardDescription>{tr("Riap kalibrasi: ukur ulang pertama memakai riap pohon itu; berikutnya rata-rata 2 selang terakhir")}</CardDescription></CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader><TableRow><TableHead className="pl-6">{tr("Tanggal")}</TableHead><TableHead className="text-right">{tr("DBH")}</TableHead><TableHead className="text-right">{tr("Tinggi")}</TableHead><TableHead>{tr("Pengukur")}</TableHead><TableHead>{tr("Catatan")}</TableHead><TableHead>{tr("Foto")}</TableHead><TableHead className="w-10 pr-4" /></TableRow></TableHeader>
            <TableBody>{[...t.measurements].reverse().map((m: any) => (
              <TableRow key={m.id}>
                <TableCell className="pl-6">{fmtDate(m.date)}</TableCell>
                <TableCell className="text-right tabular">{num(m.dbh, 1)} {tr("cm")}{m.stems && <span className="text-[0.625rem] text-muted-foreground"> ({m.stems.length} {tr("batang)")}</span>}</TableCell>
                <TableCell className="text-right tabular">{num(m.height, 1)} m</TableCell>
                <TableCell><Badge variant={m.measurer_role === "verifikator" ? "default" : "secondary"}>{m.measurer_role}</Badge> <span className="text-xs text-muted-foreground">{m.measurer}</span></TableCell>
                <TableCell className="max-w-56 text-xs">{[...(m.flags ?? []), m.reason].filter(Boolean).join(" · ")}</TableCell>
                <TableCell>{m.photos?.map((p: number) => <a key={p} className="mr-1 text-xs text-primary" href={fileUrl(p)} target="_blank" rel="noreferrer">#{p}</a>)}</TableCell>
                <TableCell className="pr-4 text-right">{perm.manage && <RowActions onEdit={() => setEditM(m)} del={{ path: `/measurements/${m.id}`, title: tl(`Hapus pengukuran ${fmtDate(m.date)}?`, `Delete measurement ${fmtDate(m.date)}?`), description: tl("Stok karbon & riap dihitung ulang tanpa pengukuran ini.", "Carbon stock & growth are recalculated without this measurement."), invalidate: [["asset"], ["assets"]] }} />}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
          <p className="px-6 pt-3 text-xs text-muted-foreground">{ops.length} {tr("pengukuran operator · riwayat riap:")} {s?.growthHistory?.map((h: any) => `${num(h.growth, 2)} (${h.source})`).join(" → ")}</p>
        </CardContent>
      </Card>
      <Sheet open={measure} onOpenChange={setMeasure}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader><SheetTitle>{tr("Ukur ulang")} {t.code}</SheetTitle><SheetDescription>{tr("Selang ukur ulang minimal 6 bulan. Hasil menggantikan proyeksi (label Terukur).")}</SheetDescription></SheetHeader>
          <div className="px-4 pb-6"><MeasureForm orgId={orgId} assetId={t.id} lastDbh={s?.last?.dbh} onDone={() => { setMeasure(false); qc.invalidateQueries({ queryKey: ["asset", id] }); qc.invalidateQueries({ queryKey: ["assets"] }) }} /></div>
        </SheetContent>
      </Sheet>
      <Dialog open={dead} onOpenChange={setDead}>
        <DialogContent>
          <DialogHeader><DialogTitle>{tr("Tandai pohon mati/ditebang")}</DialogTitle><DialogDescription>{tr("Stok pohon ({n} kg CO₂) dicatat sebagai pelepasan pada tanggal tersebut.", { n: num(s?.state?.stock, 1) })}</DialogDescription></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field label={tr("Status")}><SimpleSelect value={deadForm.status} onChange={(v) => setDeadForm({ ...deadForm, status: v })} options={[{ value: "mati", label: tr("Mati") }, { value: "ditebang", label: tr("Ditebang") }]} /></Field>
            <Field label={tr("Tanggal")}><Input type="date" value={deadForm.dead_at} onChange={(e) => setDeadForm({ ...deadForm, dead_at: e.target.value })} /></Field>
          </div>
          <Field label={tr("Alasan")}><Input value={deadForm.dead_reason} onChange={(e) => setDeadForm({ ...deadForm, dead_reason: e.target.value })} /></Field>
          <DialogFooter><Button variant="destructive" onClick={() => mark.mutate()}>{tr("Simpan")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
