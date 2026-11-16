import { useState, useEffect } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ArrowLeft, Check, FileText, Lock, TriangleAlert, Undo2 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ErrorState, HeroCard, Meter, PageSkeleton, QualityBadge, StatusBadge, Spinner } from "@/components/common"
import { api, fileUrl } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { fmtDate, fmtMonth, kg, num, pct, SOURCES, ton } from "@/lib/format"
import { cn, canonicalUuidPath } from "@/lib/utils"
import { t as tr } from "@/lib/i18n"

export default function Review() {
  const { id } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const { setOrgId } = useAuth()
  const { data: t, isLoading, error } = useQuery({ queryKey: ["vtask", id], queryFn: () => api<any>(`/verification/tasks/${id}`) })
  useEffect(() => { const to = canonicalUuidPath("/approvals", id, t?.uuid); if (to) nav(to, { replace: true }) }, [t?.uuid]) // eslint-disable-line
  const [check, setCheck] = useState<Record<string, boolean>>({})
  const [note, setNote] = useState("")
  const [ret, setRet] = useState(false)
  const [cat, setCat] = useState("minor")
  const done = () => { qc.invalidateQueries({ queryKey: ["vtasks"] }); qc.invalidateQueries({ queryKey: ["vtask", id] }) }
  const approve = useMutation({
    mutationFn: () => api(`/verification/tasks/${id}/approve`, { method: "POST", json: { checklist: check, note: note || undefined } }),
    onSuccess: () => { toast.success(tr("Disahkan")); done() },
    onError: (e: Error) => toast.error(e.message),
  })
  const back = useMutation({
    mutationFn: () => api(`/verification/tasks/${id}/return`, { method: "POST", json: { category: cat, note } }),
    onSuccess: () => { toast.success(tr("Dikembalikan — pengisi data diberi notifikasi")); setRet(false); done(); nav("/approvals") },
    onError: (e: Error) => toast.error(e.message),
  })
  const lock = useMutation({
    mutationFn: (bid: number) => api(`/baselines/${bid}/lock`, { method: "POST" }),
    onSuccess: () => { toast.success(tr("Baseline terkunci (versi + hash + versi faktor)")); done() },
    onError: (e: Error) => toast.error(e.message),
  })
  if (isLoading) return <PageSkeleton />
  if (error) return <ErrorState error={error} />
  const o = t.object
  const allChecked = o.checklist.every((c: string) => check[c])
  const isOpen = t.status === "terbuka" && t.canAct !== false
  return (
    <div className="space-y-8">
      <HeroCard>
      <div className="-ml-2 flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" render={<Link to="/approvals" />}><ArrowLeft /> {tr("Antrian")}</Button>
        <StatusBadge status={t.status} />{t.priority === "tinggi" && <Badge className="bg-red-500/12 text-red-600">{tr("Prioritas")}</Badge>}
        <span className="text-sm text-muted-foreground">{tr("tenggat")} {fmtDate(t.due_at)}</span>
      </div>
      <div className="mt-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
        <p className="mt-1 text-[0.9375rem] text-muted-foreground">{t.org_name}{t.reason && <span className="ml-2 text-amber-600">· {t.reason}</span>}</p>
      </div>
      </HeroCard>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {o.kind === "activity" && o.record && (
            <>
              <div className="grid gap-5 sm:grid-cols-4">
                <Compare label={tr("Data diajukan")} value={`${num(o.record.quantity, 1)} ${o.record.unit}`} sub={fmtMonth(o.record.period)} strong />
                <Compare label={tr("Periode sebelumnya")} value={o.prev ? `${num(o.prev.quantity, 1)} ${o.record.unit}` : "–"} sub={o.prev ? `${o.prev.period} · ${diff(o.record.quantity, o.prev.quantity)}` : tr("tidak ada")} />
                <Compare label={tr("Bulan sama tahun lalu")} value={o.lastYear ? `${num(o.lastYear.quantity, 1)} ${o.record.unit}` : "–"} sub={o.lastYear ? diff(o.record.quantity, o.lastYear.quantity) : tr("tidak ada")} />
                <Compare label={tr("Baseline (rata-rata/bulan)")} value={o.baseline?.monthlyKg ? kg(o.baseline.monthlyKg, 0) : "–"} sub={o.baseline?.version ?? tr("belum ada")} />
              </div>
              {o.record.flags?.length > 0 && <div className="flex flex-wrap gap-2">{o.record.flags.map((f: string) => <Badge key={f} variant="outline" className="gap-1 border-amber-500/30 text-amber-700"><TriangleAlert className="size-3" />{f}</Badge>)}</div>}
              <Card>
                <CardHeader><CardTitle>{tr("Bukti")}</CardTitle><CardDescription>{o.evidence.length} {tr("berkas · SHA-256 tersimpan")}</CardDescription></CardHeader>
                <CardContent className="grid gap-5 sm:grid-cols-2">
                  {o.evidence.length === 0 && <p className="text-sm text-muted-foreground">{tr("Tidak ada bukti dilampirkan.")}</p>}
                  {o.evidence.map((e: any) => (
                    <a key={e.id} href={fileUrl(e.id)} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-2xl border">
                      {e.mime?.startsWith("image/") ? <img src={fileUrl(e.id)} alt={e.filename} className="aspect-video w-full bg-muted object-contain transition-transform group-hover:scale-[1.02]" /> : <div className="flex aspect-video items-center justify-center bg-muted"><FileText className="size-8 text-muted-foreground" /></div>}
                      <div className="p-2 text-xs"><div className="truncate font-medium">{e.filename}</div><div className="truncate font-mono text-[0.625rem] text-muted-foreground">{e.sha256}</div>{e.flags?.map((f: string) => <div key={f} className="text-amber-600">{f}</div>)}</div>
                    </a>
                  ))}
                </CardContent>
              </Card>
              <Card size="sm"><CardContent className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <div><div className="text-xs text-muted-foreground">{tr("Revisi")}</div>{o.record.revision}</div>
                <div><div className="text-xs text-muted-foreground">{tr("Metode")}</div><QualityBadge label={o.record.method} /></div>
                <div><div className="text-xs text-muted-foreground">{tr("ID pelanggan")}</div>{o.record.meta?.customer_id ?? "–"}</div>
                <div><div className="text-xs text-muted-foreground">{tr("Catatan")}</div>{o.record.note ?? "–"}</div>
              </CardContent></Card>
            </>
          )}
          {o.kind === "baseline" && (
            <Card>
              <CardHeader><CardTitle>{o.baseline.version_label} · {fmtDate(o.baseline.period_start)} – {fmtDate(o.baseline.period_end)}</CardTitle><CardDescription>{tr("Total")} {ton(o.baseline.summary.total)} {tr("CO₂e · kelengkapan")} {num(o.baseline.completeness.score)}{tr("% · Estimasi")} {pct(o.baseline.estimate_share)}</CardDescription></CardHeader>
              <CardContent className="space-y-2">
                {o.baseline.components.map((c: any) => (
                  <div key={c.source} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 text-sm">
                    <span className="flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: SOURCES[c.source]?.color }} />{SOURCES[c.source]?.label}</span>
                    <QualityBadge label={c.method} /><span className="w-24 text-right tabular">{ton(c.total_kg)}</span>
                  </div>
                ))}
                <div className="pt-2"><Meter value={o.baseline.completeness.score} /></div>
                <Button variant="outline" size="sm" onClick={() => { setOrgId(t.org_id); nav("/app/baseline") }}>{tr("Buka halaman baseline sekolah")}</Button>
                {false && <Button size="sm" className="ml-2" onClick={() => lock.mutate(o.baseline.id)} disabled={lock.isPending}><Lock /> {tr("Kunci baseline")}</Button>}
              </CardContent>
            </Card>
          )}
          {o.kind === "report" && (
            <Card><CardHeader><CardTitle>{o.report.period_label}</CardTitle><CardDescription>{tr("Baseline")} {o.report.baseline_version}</CardDescription></CardHeader>
              <CardContent className="text-sm"><p>{tr("Total")} {ton(o.report.snapshot.total ?? 0)} {tr("· resmi")} {ton(o.report.snapshot.officialTotal ?? 0)}</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => { setOrgId(t.org_id); nav(`/app/reports/${o.report.uuid ?? o.report.id}`) }}>{tr("Lihat rapor lengkap")}</Button></CardContent></Card>
          )}
        </div>

        <Card className="h-fit xl:sticky xl:top-20">
          <CardHeader><CardTitle>{tr("Checklist pemeriksaan")}</CardTitle><CardDescription>{tr("Wajib dicentang lengkap sebelum menyetujui")}</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              {o.checklist.map((c: string) => (
                <label key={c} className={cn("flex cursor-pointer items-start gap-3 rounded-2xl bg-muted/50 p-3.5 text-sm transition-colors", (check[c] || t.checklist?.[c]) && "border-primary/40 bg-primary/5")}>
                  <Checkbox disabled={!isOpen} checked={!!(check[c] || t.checklist?.[c])} onCheckedChange={(v) => setCheck({ ...check, [c]: !!v })} className="mt-0.5" />{c}
                </label>
              ))}
            </div>
            {isOpen ? (
              <>
                <Textarea placeholder={tr("Catatan Admin (wajib bila Estimasi > 20%)")} value={note} onChange={(e) => setNote(e.target.value)} />
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={() => setRet(true)}><Undo2 /> {tr("Kembalikan")}</Button>
                  <Button disabled={!allChecked || approve.isPending} onClick={() => approve.mutate()}>{approve.isPending ? <Spinner /> : <Check />} {tr("Setujui")}</Button>
                </div>
                <p className="text-[0.6875rem] text-muted-foreground">{tr("Pemisahan tugas: Anda tidak dapat menyetujui data yang Anda ajukan sendiri. Persetujuan mencatat akun, waktu, versi data, dan catatan.")}</p>
              </>
            ) : <div className="rounded-lg bg-muted p-3 text-sm">{tr("Hasil:")} <b>{t.result}</b>{t.note && <p className="mt-1 text-muted-foreground">{t.note}</p>}</div>}
            {t.findings.map((f: any) => <div key={f.id} className="rounded-2xl border border-destructive/20 bg-destructive/5 p-3 text-sm"><Badge variant="destructive" className="mr-2">{f.category}</Badge>{f.note}</div>)}
          </CardContent>
        </Card>
      </div>
      <Dialog open={ret} onOpenChange={setRet}>
        <DialogContent>
          <DialogHeader><DialogTitle>{tr("Kembalikan dengan temuan")}</DialogTitle><DialogDescription>{tr("Minor: salah ketik/bukti kurang jelas. Mayor: angka tidak sesuai bukti — baseline tidak dapat dikunci sampai selesai.")}</DialogDescription></DialogHeader>
          <RadioGroup value={cat} onValueChange={(v) => setCat(String(v))} className="grid grid-cols-2 gap-2">
            {["minor", "mayor"].map((c) => <Label key={c} className="flex items-center gap-2 rounded-2xl bg-muted/50 p-3.5 capitalize"><RadioGroupItem value={c} />{c}</Label>)}
          </RadioGroup>
          <Textarea placeholder={tr("Catatan temuan (wajib)")} value={note} onChange={(e) => setNote(e.target.value)} />
          <DialogFooter><Button variant="destructive" disabled={!note || back.isPending} onClick={() => back.mutate()}>{tr("Kembalikan")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
const diff = (a: number, b: number) => (b ? `${a >= b ? "+" : ""}${num((a / b - 1) * 100, 0)}%` : "")
function Compare({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return <Card size="sm" className={cn(strong && "ring-2 ring-primary/30")}><CardContent><div className="text-xs text-muted-foreground">{label}</div><div className="text-lg font-semibold tabular">{value}</div><div className="text-[0.6875rem] text-muted-foreground">{sub}</div></CardContent></Card>
}
