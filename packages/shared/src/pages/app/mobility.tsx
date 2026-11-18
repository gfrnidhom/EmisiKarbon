import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { QRCodeSVG } from "qrcode.react"
import { toast } from "sonner"
import { Bike, Copy, Plus, QrCode, Share2, TriangleAlert } from "lucide-react"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EditDialog, RowActions, usePerm } from "@/components/row-actions"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyState, Field, Meter, PageHeader, PageSkeleton, Spinner, StatCard, StatusBadge } from "@/components/common"
import { DonutChart } from "@/components/charts"
import { api } from "@/lib/api"
import { useOrg } from "@/lib/hooks"
import { fmtDate, kg, num, pct, todayWIB } from "@/lib/format"
import { cn } from "@/lib/utils"
import { t as tr, tl } from "@/lib/i18n"
import { modeColor, modeLabel } from "@/lib/mobility-modes"

export default function Mobility() {
  const { orgId, can } = useOrg()
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ["mobility", orgId], queryFn: () => api<any>(`/orgs/${orgId}/mobility`), enabled: !!orgId })
  const [sel, setSel] = useState<number | null>(null)
  const [share, setShare] = useState<any>(null)
  const [create, setCreate] = useState(false)
  const [form, setForm] = useState({ title: `Survei mobilitas ${fmtDate(todayWIB(), { month: "long", year: "numeric" })}`, classes: "7A:32, 7B:32, 8A:32, 8B:32, 9A:32, 9B:32" })
  const s = data?.surveys.find((x: any) => x.id === (sel ?? data?.surveys[0]?.id))
  const link = (t: string) => `${location.origin}/s/${t}`

  const mk = useMutation({
    mutationFn: () => api<any>(`/orgs/${orgId}/mobility/surveys`, { method: "POST", json: { title: form.title, classes: Object.fromEntries(form.classes.split(",").map((x) => x.trim().split(":")).filter((x) => x[0]).map(([k, v]) => [k.trim(), Number(v) || 30])) } }),
    onSuccess: (r) => { setCreate(false); setSel(r.id); qc.invalidateQueries({ queryKey: ["mobility"] }); setShare({ token: r.token, title: form.title }) },
    onError: (e: Error) => toast.error(e.message),
  })
  const close = useMutation({
    mutationFn: (id: number) => api(`/mobility/surveys/${id}`, { method: "PATCH", json: { status: "ditutup" } }),
    onSuccess: () => { toast.success(tr("Survei ditutup")); qc.invalidateQueries({ queryKey: ["mobility"] }) },
  })

  const perm = usePerm()
  const [editS, setEditS] = useState<any>(null)
  if (isLoading) return <PageSkeleton />
  const modes = s ? Object.entries<any>(s.byMode).map(([k, v]) => ({ key: k, label: modeLabel(k), value: v.n, color: modeColor(k), ...v })) : []
  return (
    <div className="space-y-8">
      <PageHeader icon={Bike} title={tr("Mobilitas")} description={tl("Survei 1 menit tanpa akun via tautan/QR: moda (jalan kaki sampai pesawat) dan jarak harian pulang-pergi. Dihitung dengan faktor emisi per moda, dibagi penumpang, porsi hari, lalu diekstrapolasi per kelas.", "1-minute survey via link/QR, no account: mode (walking to flying) and daily round-trip distance. Calculated with a per-mode emission factor, divided by passengers, weighted by days, then extrapolated per class.")}
        actions={perm.manage && <Button onClick={() => setCreate(true)}><Plus /> {tr("Survei baru")}</Button>} />
      {!perm.manage && (
        <div className="flex items-start gap-3 rounded-2xl bg-sky-500/10 px-4 py-3 text-sm text-sky-900 ring-1 ring-sky-500/20 dark:text-sky-200">
          <Bike className="mt-0.5 size-4 shrink-0" />
          <span>{tl("Survei mobilitas dibuat oleh Operator sekolah. Pilih survei untuk memantau respons per kelas dan bagikan tautannya ke wali kelas.", "Mobility surveys are created by the school Operator. Pick a survey to monitor responses per class and share its link with homeroom teachers.")}</span>
        </div>
      )}
      {!s ? <EmptyState icon={Bike} title={tr("Belum ada survei")} description={perm.manage ? tr("Bagikan survei ke wali kelas; target respons ≥ 70% per kelas.") : tl("Menunggu Operator membuat survei semester ini.", "Waiting for the Operator to create this semester's survey.")} /> : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {data.surveys.map((x: any) => (
              <button key={x.id} onClick={() => setSel(x.id)} className={cn("shrink-0 rounded-full border px-4 py-1.5 text-sm", s.id === x.id ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted")}>{x.title}</button>
            ))}
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label={tr("Respons")} value={`${num(s.responses)} / ${num(data.population)}`} sub={<span className="flex items-center gap-2"><StatusBadge status={s.status} />{fmtDate(s.period)}</span>} />
            <StatCard label={tr("Tingkat respons")} value={pct(s.result?.rate)} tone={s.result?.flagged ? "warn" : "leaf"} sub={s.result?.flagged ? tr("< 70% — hasil ditandai") : tr("Memadai (≥ 70%)")} footer={<Meter value={(s.result?.rate ?? 0) * 100} tone={s.result?.flagged ? "warn" : "primary"} />} />
            <StatCard label={tr("km kendaraan / hari aktif")} value={num(s.result?.km, 0)} sub={tr("diekstrapolasi ke seluruh warga")} />
            <StatCard label={tr("Emisi / hari aktif")} value={kg(s.result?.kg)} tone="scope3" sub={tr("Scope 3 · hanya hari aktif")} />
          </div>
          <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
            <Card>
              <CardHeader><CardTitle>{tr("Pilihan moda")}</CardTitle><CardDescription>{tr("Jumlah responden")}</CardDescription>
                <CardAction className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => setShare(s)}><QrCode /> {tr("Bagikan")}</Button>
                  {s.status === "aktif" && can("operator", "admin") && <Button size="sm" variant="ghost" onClick={() => close.mutate(s.id)}>{tr("Tutup")}</Button>}
                  {perm.manage && <RowActions onEdit={() => setEditS(s)} del={{ path: `/mobility/surveys/${s.uuid ?? s.id}`, title: tl(`Hapus survei "${s.title}"?`, `Delete survey "${s.title}"?`), description: tl(`Survei beserta ${s.responses} jawabannya dihapus permanen. Emisi mobilitas dihitung ulang.`, `The survey and its responses are removed permanently. Mobility emissions are recalculated.`), invalidate: [["mobility"]], onDone: () => setSel(null) }} />}
                </CardAction>
              </CardHeader>
              <CardContent className="space-y-4">
                <DonutChart data={modes} height={180} centerValue={num(s.responses)} centerLabel={tr("responden")} />
                <div className="space-y-1.5 text-sm">
                  {modes.sort((a, b) => b.kg - a.kg).map((m) => (
                    <div key={m.key} className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: m.color }} />{m.label}<span className="ml-auto text-muted-foreground tabular">{num(m.n)} {tr("org")}</span><span className="w-20 text-right font-medium tabular">{num(m.kg, 1)} {tr("kg")}</span></div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>{tr("Respons per kelas")}</CardTitle><CardDescription>{tr("Kelas < 70% ditandai; diekstrapolasi dari kelas yang merespons")}</CardDescription></CardHeader>
              <CardContent className="max-h-[26.25rem] overflow-y-auto px-0">
                <Table>
                  <TableHeader><TableRow><TableHead className="pl-6">{tr("Kelas")}</TableHead><TableHead className="text-right">{tr("Respons")}</TableHead><TableHead className="w-40">{tr("Tingkat")}</TableHead><TableHead className="pr-6" /></TableRow></TableHeader>
                  <TableBody>{s.byClass.map((c: any) => (
                    <TableRow key={c.name}>
                      <TableCell className="pl-6 font-medium">{c.name}</TableCell>
                      <TableCell className="text-right tabular">{c.n}/{c.size}</TableCell>
                      <TableCell><div className="flex items-center gap-2"><Meter value={c.rate * 100} tone={c.flagged ? "warn" : "primary"} className="h-1.5" /><span className="w-10 text-xs tabular">{pct(c.rate)}</span></div></TableCell>
                      <TableCell className="pr-6">{c.flagged && <Badge variant="outline" className="gap-1 border-amber-500/30 text-amber-600"><TriangleAlert className="size-3" />{tr("ulangi")}</Badge>}</TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </>
      )}
      {data.modes && (
        <Card>
          <CardHeader>
            <CardTitle>{tl("Cara hitung & faktor emisi per moda", "Method & emission factor per mode")}</CardTitle>
            <CardDescription>{tl(`Emisi per hari = jarak harian (km pulang-pergi) ÷ penumpang × faktor emisi × (hari/minggu ÷ ${data.schoolDays} hari sekolah). Faktor diambil dari menu Faktor Emisi.`, `Daily emission = daily distance (round-trip km) ÷ passengers × emission factor × (days/week ÷ ${data.schoolDays} school days). Factors come from the Emission Factors menu.`)}</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader><TableRow><TableHead className="pl-6">{tl("Moda", "Mode")}</TableHead><TableHead>{tl("Faktor emisi", "Emission factor")}</TableHead><TableHead>{tl("Dibagi", "Divided by")}</TableHead><TableHead className="pr-6">{tl("Sumber", "Source")}</TableHead></TableRow></TableHeader>
              <TableBody>{data.modes.map((m: any) => (
                <TableRow key={m.key}>
                  <TableCell className="pl-6 font-medium"><span className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: modeColor(m.key) }} />{modeLabel(m.key)}</span></TableCell>
                  <TableCell className="text-sm tabular">{m.factors.map((f: any) => <div key={f.code}>{f.value === null ? "–" : <b>{num(f.value, f.value === 0 ? 0 : f.value < 0.1 ? 4 : 3)}</b>} <span className="text-muted-foreground">{f.unit}</span>{m.factors.length > 1 && <span className="text-xs text-muted-foreground"> · {f.name.replace(/^Pesawat domestik ekonomi /, "")}</span>}</div>)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{m.per === "penumpang" ? tl("sudah per penumpang", "already per passenger") : m.load ? tl(`muatan rata-rata ${m.load} orang`, `average load ${m.load}`) : tl("jumlah orang di kendaraan", "people in the vehicle")}</TableCell>
                  <TableCell className="pr-6 text-xs text-muted-foreground">{m.factors[0]?.source}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      <Dialog open={!!share} onOpenChange={(o) => !o && setShare(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{tr("Bagikan survei")}</DialogTitle><DialogDescription>{tr("Tampilkan QR di kelas atau kirim tautan ke grup WhatsApp wali kelas.")}</DialogDescription></DialogHeader>
          {share && (
            <div className="flex flex-col items-center gap-4">
              <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-border"><QRCodeSVG value={link(share.token)} size={200} level="M" /></div>
              <code className="w-full break-all rounded-lg bg-muted px-3 py-2 text-center text-xs">{link(share.token)}</code>
              <div className="grid w-full grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => { navigator.clipboard.writeText(link(share.token)); toast.success(tr("Tautan disalin")) }}><Copy /> {tr("Salin")}</Button>
                <Button render={<a href={`https://wa.me/?text=${encodeURIComponent(`Isi survei perjalanan ke sekolah (1 menit, anonim): ${link(share.token)}`)}`} target="_blank" rel="noreferrer" />}><Share2 /> {tr("WhatsApp")}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={create} onOpenChange={setCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>{tr("Survei mobilitas baru")}</DialogTitle><DialogDescription>{tr("Ulangi tiap awal semester. Survei tidak menyimpan nama atau alamat.")}</DialogDescription></DialogHeader>
          <Field label={tr("Judul")}><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label={tr("Kelas & jumlah siswa")} hint={tr("Format: 7A:32, 7B:31, … — dipakai untuk tingkat respons & ekstrapolasi per kelas")}><Textarea rows={3} value={form.classes} onChange={(e) => setForm({ ...form, classes: e.target.value })} /></Field>
          <DialogFooter><Button onClick={() => mk.mutate()} disabled={mk.isPending}>{mk.isPending && <Spinner />} {tr("Buat & bagikan")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      {editS && <EditDialog open={!!editS} onOpenChange={(o) => !o && setEditS(null)} title={tl("Ubah survei", "Edit survey")} fields={[{ key: "title", label: tl("Judul survei", "Survey title") }]} initial={{ title: editS.title }} save={(v) => api(`/mobility/surveys/${editS.uuid ?? editS.id}`, { method: "PATCH", json: v })} invalidate={[["mobility"]]} />}
    </div>
  )
}
