import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { CheckCircle2, Dices, MapPinned, Ruler, XCircle } from "lucide-react"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyState, Meter, PageHeader, PageSkeleton, SimpleSelect, StatusBadge } from "@/components/common"
import { MeasureForm } from "@/components/measure-form"
import { TreeMap } from "@/components/tree-map"
import { api } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { fmtDate, num, pct } from "@/lib/format"
import { cn } from "@/lib/utils"
import { t } from "@/lib/i18n"

/** VER-05/06: sampel acak pohon (seed tersimpan) + mode lapangan offline */
export default function FieldVisit() {
  const { me, orgId, setOrgId } = useAuth()
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ["samples", orgId], queryFn: () => api<any[]>(`/orgs/${orgId}/field-samples`), enabled: !!orgId })
  const [sel, setSel] = useState<number | null>(null)
  const [measure, setMeasure] = useState<any>(null)
  const sample = data?.find((s) => s.id === (sel ?? data[0]?.id))
  const refresh = () => qc.invalidateQueries({ queryKey: ["samples"] })
  const draw = useMutation({ mutationFn: () => api<any>(`/orgs/${orgId}/field-samples`, { method: "POST", json: {} }), onSuccess: (r) => { toast.success(t("Sampel {n} pohon (seed {s})", { n: r.items.length, s: r.seed })); setSel(r.id); refresh() }, onError: (e: Error) => toast.error(e.message) })
  const complete = useMutation({
    mutationFn: () => api<any>(`/field-samples/${sample.id}/complete`, { method: "POST" }),
    onSuccess: (r) => { r.status === "lolos" ? toast.success(t("Lolos: {p} sampel dalam toleransi 5%", { p: pct(r.passRate) })) : toast.warning(t("Gagal ({p}) — sampel diperluas ke {n} pohon", { p: pct(r.passRate), n: r.expanded })); refresh() },
    onError: (e: Error) => toast.error(e.message),
  })
  if (isLoading) return <PageSkeleton />
  return (
    <div className="space-y-8">
      <PageHeader icon={MapPinned} title={t("Kunjungan lapangan")} description={t("Ukur ulang 10% pohon (min. 10) dipilih acak + semua pohon bertanda Lokasi diragukan. Lolos bila selisih DBH ≤ 5% pada ≥ 90% sampel.")}
        actions={<>
          {me && me.orgs.length > 1 && <SimpleSelect className="w-56" value={String(orgId)} onChange={(v) => { setOrgId(Number(v)); setSel(null) }} options={me.orgs.map((o) => ({ value: String(o.id), label: o.name }))} />}
          <Button onClick={() => draw.mutate()} disabled={draw.isPending}><Dices /> {t("Undi sampel baru")}</Button>
        </>} />
      {!sample ? <EmptyState icon={MapPinned} title={t("Belum ada rencana kunjungan")} description={t("Undi sampel acak — seed disimpan agar dapat direproduksi.")} /> : (
        <>
          <div className="flex gap-2 overflow-x-auto">{(data ?? []).map((s) => (
            <button key={s.id} onClick={() => setSel(s.id)} className={cn("shrink-0 rounded-full bg-muted/60 px-4 py-2 text-left text-sm", sample.id === s.id ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
              <div className="flex items-center gap-2"><StatusBadge status={s.status} /> <span className="font-mono text-xs">{t("seed")} {s.seed}</span></div>
              <div className="mt-1 text-xs text-muted-foreground">{fmtDate(s.planned_date)} · {s.items.length} {t("pohon")}</div>
            </button>
          ))}</div>
          <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>{t("Daftar sampel")}</CardTitle>
                <CardDescription>{sample.measured}/{sample.items.length} {t("diukur · lolos")} {pct(sample.passRate)}</CardDescription>
                <CardAction>{sample.status === "rencana" && <Button size="sm" onClick={() => complete.mutate()} disabled={complete.isPending}>{t("Selesaikan kunjungan")}</Button>}</CardAction>
              </CardHeader>
              <CardContent className="px-0">
                <Meter value={(sample.measured / Math.max(sample.items.length, 1)) * 100} className="mx-6 mb-3 w-auto" />
                <Table>
                  <TableHeader><TableRow><TableHead className="pl-6">{t("Pohon")}</TableHead><TableHead className="text-right">{t("Operator")}</TableHead><TableHead className="text-right">{t("Verifikator")}</TableHead><TableHead className="text-right">{t("Selisih")}</TableHead><TableHead className="pr-6" /></TableRow></TableHeader>
                  <TableBody>{sample.items.map((it: any) => (
                    <TableRow key={it.id}>
                      <TableCell className="pl-6"><div className="font-mono text-xs">{it.code}</div><div className="text-xs text-muted-foreground">{it.species}</div></TableCell>
                      <TableCell className="text-right tabular">{num(it.operator?.dbh, 1)}</TableCell>
                      <TableCell className="text-right tabular">{num(it.verifier?.dbh, 1)}</TableCell>
                      <TableCell className="text-right">{it.pass === null ? "–" : <span className={cn("inline-flex items-center gap-1 tabular", it.pass ? "text-emerald-600" : "text-destructive")}>{it.pass ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}{num(it.diffPct, 1)}%</span>}</TableCell>
                      <TableCell className="pr-6 text-right">{sample.status === "rencana" && <Button size="xs" variant={it.verifier ? "ghost" : "outline"} onClick={() => setMeasure(it)}><Ruler /> {t("Ukur")}</Button>}</TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>{t("Peta sampel")}</CardTitle><CardDescription>{t("Hijau = lolos · merah = di luar toleransi · abu = belum diukur")}</CardDescription></CardHeader>
              <CardContent><TreeMap height={420} points={sample.items.filter((i: any) => i.lat).map((i: any) => ({ id: i.id, lat: i.lat, lng: i.lng, label: i.code, kind: "pohon", size: i.operator?.dbh, color: i.pass === null ? "#94a3b8" : i.pass ? "#16a571" : "#ef4444", onClick: () => sample.status === "rencana" && setMeasure(i) }))} /></CardContent>
            </Card>
          </div>
          {sample.result && <Badge variant="outline">{t("Hasil:")} {sample.status} {t("· lolos")} {pct(sample.result.passRate)}</Badge>}
        </>
      )}
      <Sheet open={!!measure} onOpenChange={(o) => !o && setMeasure(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader><SheetTitle>{t("Ukur banding")} {measure?.code}</SheetTitle><SheetDescription>{t("DBH operator")} {num(measure?.operator?.dbh, 1)} {t("cm — bandingkan otomatis. GPS verifikator tersimpan.")}</SheetDescription></SheetHeader>
          {measure && <div className="px-4 pb-6"><MeasureForm orgId={orgId!} assetId={measure.id} role="verifikator" compact onDone={() => { setMeasure(null); refresh() }} /></div>}
        </SheetContent>
      </Sheet>
    </div>
  )
}
