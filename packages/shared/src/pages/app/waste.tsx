import { useEmbed } from "@/components/embed"
import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { CheckCircle2, Play, Plus, Recycle, Scale, TriangleAlert } from "lucide-react"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { RowActions, usePerm } from "@/components/row-actions"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyState, Field, Meter, PageHeader, PageSkeleton, SimpleSelect, Spinner, StatusBadge } from "@/components/common"
import { BarsChart } from "@/components/charts"
import { api } from "@/lib/api"
import { useOrg } from "@/lib/hooks"
import { fmtDate, kg, num, todayWIB } from "@/lib/format"
import { cn } from "@/lib/utils"
import { t, tl } from "@/lib/i18n"

const ROWS = [
  { c: "makanan", t: "kompos", label: t("Sisa makanan → kompos") }, { c: "makanan", t: "tpa", label: t("Sisa makanan → TPA") },
  { c: "kebun", t: "kompos", label: t("Daun/kebun → kompos") }, { c: "kebun", t: "tpa", label: t("Daun/kebun → TPA") },
  { c: "kertas", t: "bank_sampah", label: t("Kertas → bank sampah") }, { c: "kertas", t: "tpa", label: t("Kertas → TPA") },
  { c: "plastik", t: "bank_sampah", label: t("Plastik → bank sampah") }, { c: "plastik", t: "bakar", label: t("Plastik → dibakar") },
  { c: "residu", t: "tpa", label: t("Plastik & residu → TPA") },
]
const rowLabel = (key: string) => ROWS.find((r) => `${r.c}|${r.t}` === key)?.label ?? key

export default function Waste() {
  const { orgId, can } = useOrg()
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ["waste", orgId], queryFn: () => api<any>(`/orgs/${orgId}/waste`), enabled: !!orgId })
  const [sel, setSel] = useState<number | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const [weigh, setWeigh] = useState<{ date: string; kg: Record<string, string> } | null>(null)
  const { context: embedCtx } = useEmbed()
  // di dalam Survei Awal: sesi baru otomatis jenis baseline (8 hari sekolah)
  const [newS, setNewS] = useState({ kind: embedCtx === "baseline" ? "baseline" : "ulang", start_date: todayWIB() })
  const session = data?.sessions.find((s: any) => s.id === (sel ?? data?.sessions[0]?.id))
  const edit = can("operator", "petugas", "admin")
  const perm = usePerm()

  const create = useMutation({
    mutationFn: () => api<{ id: number }>(`/orgs/${orgId}/waste/sessions`, { method: "POST", json: newS }),
    onSuccess: (r) => { toast.success(t("Sesi dimulai")); setNewOpen(false); setSel(r.id); qc.invalidateQueries({ queryKey: ["waste"] }) },
    onError: (e: Error) => toast.error(e.message),
  })
  const save = useMutation({
    mutationFn: () => api<any>(`/waste/sessions/${session.id}/weighings`, { method: "POST", json: { date: weigh!.date, entries: Object.entries(weigh!.kg).filter(([, v]) => v !== "").map(([k, v]) => { const [category, treatment] = k.split("|"); return { category, treatment, kg: Number(v) } }) } }),
    onSuccess: (r) => { toast.success(r.complete ? t("Sesi lengkap — rata-rata baru berlaku sejak hari pertama sesi") : `Tersimpan (${r.nDays}/${session.days} hari)`); setWeigh(null); qc.invalidateQueries({ queryKey: ["waste"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }) },
    onError: (e: Error) => toast.error(e.message),
  })

  const byDay = useMemo(() => {
    if (!session) return { dates: [] as string[], grid: {} as Record<string, Record<string, number>> }
    const grid: Record<string, Record<string, number>> = {}
    for (const w of session.weighings) (grid[`${w.category}|${w.treatment}`] ??= {})[w.date] = w.kg
    return { dates: [...new Set<string>(session.weighings.map((w: any) => w.date))].sort(), grid }
  }, [session])

  if (isLoading) return <PageSkeleton />
  return (
    <div className="space-y-8">
      <PageHeader icon={Recycle} title={t("Sampah")} description={t("Sesi penimbangan (baseline 8 hari sekolah, ulang 5 hari) → rata-rata kg/hari per jenis & perlakuan. Engine memakai rata-rata bergulir 2 sesi terakhir.")}
        actions={perm.manage && <Button onClick={() => setNewOpen(true)}><Play /> {t("Mulai sesi")}</Button>} />
      {!perm.manage && edit && (
        <div className="flex items-start gap-3 rounded-2xl bg-lime-500/10 px-4 py-3 text-sm text-lime-900 ring-1 ring-lime-600/20 dark:text-lime-200">
          <Scale className="mt-0.5 size-4 shrink-0" />
          <span>{tl("Sesi penimbangan dimulai oleh Operator sekolah. Pilih sesi yang berjalan, lalu tekan Catat timbangan setiap hari penimbangan.", "Weighing sessions are started by the school Operator. Pick the running session, then tap Record weighing on each weighing day.")}</span>
        </div>
      )}
      {data.sessions.length === 0 ? <EmptyState icon={Scale} title={t("Belum ada sesi penimbangan")} description={perm.manage ? t("Sampah tidak boleh diestimasi — wajib pengukuran (SNI 19-3964-1994).") : tl("Menunggu Operator memulai sesi penimbangan.", "Waiting for the Operator to start a weighing session.")} action={perm.manage && <Button onClick={() => setNewOpen(true)}>{t("Mulai sesi baseline")}</Button>} /> : (
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          <div className="space-y-2">
            {data.sessions.map((s: any) => (
              <div key={s.id} className="relative">
              <button onClick={() => setSel(s.id)} className={cn("w-full rounded-2xl bg-card p-5 text-left transition-all", session?.id === s.id ? "ring-2 ring-primary" : "hover:ring-1 hover:ring-primary/30")}>
                <div className="flex items-center gap-2 pr-8"><Badge variant={s.kind === "baseline" ? "default" : "secondary"}>{s.kind === "baseline" ? t("Baseline") : t("Ulang")}</Badge><StatusBadge status={s.status} /><span className="ml-auto text-xs text-muted-foreground">{s.nDays}/{s.days} {t("hari")}</span></div>
                <p className="mt-2 text-sm font-medium">{fmtDate(s.start_date)}{s.end_date && s.end_date !== s.start_date ? ` – ${fmtDate(s.end_date)}` : ""}</p>
                <div className="mt-2 flex items-baseline justify-between text-sm"><span className="text-muted-foreground">{num(s.totalKgPerDay, 1)} {t("kg/hari")}</span><span className="font-semibold tabular">{kg(s.co2ePerDay)} {t("CO₂e")}</span></div>
                <Meter value={(s.nDays / s.days) * 100} className="mt-2 h-1" />
              </button>
              {perm.manage && <div className="absolute top-3 right-3"><RowActions del={{ path: `/waste/sessions/${s.uuid ?? s.id}`, title: tl(`Hapus sesi ${fmtDate(s.start_date)}?`, `Delete session ${fmtDate(s.start_date)}?`), description: tl(`Sesi beserta ${s.weighings?.length ?? 0} catatan timbangnya dihapus permanen. Rata-rata sampah dan emisi dihitung ulang.`, `The session and its weighings are removed permanently. Waste averages and emissions are recalculated.`), invalidate: [["waste"]], onDone: () => setSel(null) }} /></div>}
              </div>
            ))}
          </div>
          {session && (
            <div className="space-y-6">
              <div className="grid gap-6 sm:grid-cols-3">
                <Card size="sm"><CardContent><div className="text-xs text-muted-foreground">{t("Rata-rata timbulan")}</div><div className="text-xl font-semibold tabular">{num(session.totalKgPerDay, 1)} {t("kg/hari")}</div></CardContent></Card>
                <Card size="sm"><CardContent><div className="text-xs text-muted-foreground">{t("Per orang")}</div><div className={cn("text-xl font-semibold tabular", !session.plausible && "text-amber-600")}>{num(session.perPerson, 3)} {t("kg")}</div><div className="text-[0.6875rem] text-muted-foreground">{session.plausible ? t("Wajar (0,01–0,15)") : <span className="flex items-center gap-1 text-amber-600"><TriangleAlert className="size-3" /> {t("Minta konfirmasi")}</span>}</div></CardContent></Card>
                <Card size="sm"><CardContent><div className="text-xs text-muted-foreground">{t("Emisi per hari aktif")}</div><div className="text-xl font-semibold tabular text-primary">{kg(session.co2ePerDay)}</div></CardContent></Card>
              </div>
              <Card>
                <CardHeader>
                  <CardTitle>{t("Rata-rata per jenis & perlakuan")}</CardTitle>
                  <CardDescription>{t("kg/hari — dipakai engine untuk setiap hari aktif sejak")} {fmtDate(session.start_date)}</CardDescription>
                </CardHeader>
                <CardContent>
                  <BarsChart height={220} data={session.avgs.map((a: any) => ({ name: rowLabel(a.key).replace(" → ", "→"), kg: +a.kgPerDay.toFixed(2) }))} xKey="name" bars={[{ key: "kg", label: t("kg/hari"), color: "var(--primary)" }]} xFormat={(v) => String(v).split("→")[0]} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>{t("Lembar catat")}</CardTitle>
                  <CardDescription>{t("Hari dengan penimbangan aktual memakai nilai aktual (label Aktual)")}</CardDescription>
                  {edit && session.status !== "selesai" && <CardAction><Button size="sm" onClick={() => setWeigh({ date: todayWIB(), kg: {} })}><Plus /> {t("Catat timbangan")}</Button></CardAction>}
                  {edit && session.status === "selesai" && <CardAction><Badge className="gap-1 bg-primary/10 text-primary"><CheckCircle2 className="size-3" />{t("Lengkap")}</Badge></CardAction>}
                </CardHeader>
                <CardContent className="overflow-x-auto px-0">
                  <Table>
                    <TableHeader><TableRow><TableHead className="pl-6">{t("Jenis → perlakuan")}</TableHead>{byDay.dates.map((d) => (
                      <TableHead key={d} className="text-right">
                        <div className="flex items-center justify-end gap-0.5">{fmtDate(d, { day: "numeric", month: "short" })}
                          {perm.manage && <RowActions
                            onEdit={() => setWeigh({ date: d, kg: Object.fromEntries(session.weighings.filter((w: any) => w.date === d).map((w: any) => [`${w.category}|${w.treatment}`, String(w.kg)])) })}
                            del={{ path: `/waste/sessions/${session.uuid ?? session.id}/days/${d}`, title: tl(`Hapus timbangan ${fmtDate(d)}?`, `Delete weighing for ${fmtDate(d)}?`), invalidate: [["waste"], ["dashboard"]] }} />}
                        </div>
                      </TableHead>
                    ))}<TableHead className="pr-6 text-right">{t("Rata-rata")}</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {Object.entries(byDay.grid).map(([key, vals]) => (
                        <TableRow key={key}>
                          <TableCell className="pl-6 whitespace-nowrap">{rowLabel(key)}</TableCell>
                          {byDay.dates.map((d) => <TableCell key={d} className="text-right tabular">{vals[d] !== undefined ? num(vals[d], 1) : "–"}</TableCell>)}
                          <TableCell className="pr-6 text-right font-medium tabular">{num(session.avgs.find((a: any) => a.key === key)?.kgPerDay, 2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("Mulai sesi penimbangan")}</DialogTitle><DialogDescription>{t("Sesi baru berlaku sejak hari pertama sesi; hari sebelumnya tidak berubah.")}</DialogDescription></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("Jenis sesi")}><SimpleSelect value={newS.kind} onChange={(v) => setNewS({ ...newS, kind: v })} options={[{ value: "baseline", label: t("Baseline (8 hari)") }, { value: "ulang", label: t("Ulang (5 hari)") }]} /></Field>
            <Field label={t("Mulai")}><Input type="date" value={newS.start_date} onChange={(e) => setNewS({ ...newS, start_date: e.target.value })} /></Field>
          </div>
          <DialogFooter><Button onClick={() => create.mutate()} disabled={create.isPending}>{create.isPending && <Spinner />} {t("Mulai")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!weigh} onOpenChange={(o) => !o && setWeigh(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{t("Catat timbangan")}</DialogTitle><DialogDescription>{t("Isi kg per jenis & perlakuan. Kosongkan bila tidak ada.")}</DialogDescription></DialogHeader>
          {weigh && (
            <div className="space-y-3">
              <Field label={t("Tanggal")}><Input type="date" value={weigh.date} onChange={(e) => setWeigh({ ...weigh, date: e.target.value })} /></Field>
              <div className="grid gap-2 sm:grid-cols-2">
                {ROWS.map((r) => {
                  const key = `${r.c}|${r.t}`
                  return (
                    <label key={key} className="flex items-center gap-2 rounded-xl bg-muted/50 px-3.5 py-2.5">
                      <span className="flex-1 text-sm">{r.label}</span>
                      <Input type="number" inputMode="decimal" step="0.1" className="h-9 w-20 text-right" value={weigh.kg[key] ?? ""} onChange={(e) => setWeigh({ ...weigh, kg: { ...weigh.kg, [key]: e.target.value } })} />
                      <span className="text-xs text-muted-foreground">{t("kg")}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}
          <DialogFooter><Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending && <Spinner />} {t("Simpan")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
