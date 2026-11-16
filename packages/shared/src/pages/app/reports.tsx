import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { FileBarChart2, Leaf, Lock, Plus, Trash2, Zap } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EmptyState, ErrorState, Field, PageHeader, PageSkeleton, SimpleSelect, Spinner, StatusBadge } from "@/components/common"
import { api } from "@/lib/api"
import { useOrg } from "@/lib/hooks"
import { fmtDate, todayWIB } from "@/lib/format"
import { cn } from "@/lib/utils"
import { t as tr, tl } from "@/lib/i18n"

const PRESETS = (() => {
  const y = Number(todayWIB().slice(0, 4))
  return [
    { v: "bulan", label: tr("Bulan lalu"), ...(() => { const d = new Date(Date.UTC(y, Number(todayWIB().slice(5, 7)) - 2, 1)); const e = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)); return { start: d.toISOString().slice(0, 10), end: e.toISOString().slice(0, 10), name: d.toLocaleDateString("id-ID", { month: "long", year: "numeric" }) } })() },
    { v: "semester", label: tr("Semester ganjil"), start: `${y}-07-01`, end: `${y}-12-31`, name: tr("Semester ganjil {a}/{b}", { a: y, b: y + 1 }) },
    { v: "semester2", label: tr("Semester genap"), start: `${y}-01-01`, end: `${y}-06-30`, name: tr("Semester genap {a}/{b}", { a: y - 1, b: y }) },
    { v: "tahun", label: tr("Tahun berjalan"), start: `${y}-01-01`, end: `${y}-12-31`, name: tr("Tahun {y}", { y }) },
  ]
})()

export default function Reports() {
  const { orgId, can } = useOrg()
  const nav = useNavigate()
  const qc = useQueryClient()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["reports", orgId], queryFn: () => api<any[]>(`/orgs/${orgId}/reports`), enabled: !!orgId })
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ kind: "karbon", preset: "bulan", start: PRESETS[0].start, end: PRESETS[0].end, label: PRESETS[0].name })
  const create = useMutation({
    mutationFn: () => api<{ id: number; uuid?: string }>(`/orgs/${orgId}/reports`, { method: "POST", json: { kind: f.kind, period_type: f.preset.replace("2", ""), period_label: f.label, start_date: f.start, end_date: f.end > todayWIB() ? todayWIB() : f.end } }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["reports"] }); nav(`/app/reports/${r.uuid ?? r.id}`) },
    onError: (e: Error) => toast.error(e.message),
  })
  const del = useMutation({
    mutationFn: (rid: string) => api(`/reports/${rid}`, { method: "DELETE" }),
    onSuccess: () => { toast.success(tl("Rapor draf dihapus", "Draft report deleted")); qc.invalidateQueries({ queryKey: ["reports"] }) },
    onError: (e: Error) => toast.error(e.message),
  })
  if (isLoading) return <PageSkeleton />
  if (error || !data) return <ErrorState error={error ?? new Error("-")} retry={refetch} />
  return (
    <div className="space-y-8">
      <PageHeader icon={FileBarChart2} title={tr("Rapor")} description={tr("Rapor Karbon & Rapor Jasa Lingkungan per bulan/semester/tahun. Alur: operator ajukan → Admin mengesahkan → terbit & terkunci.")}
        actions={can("operator", "admin") && <Button onClick={() => setOpen(true)}><Plus /> {tr("Susun rapor")}</Button>} />
      {data!.length === 0 ? <EmptyState icon={FileBarChart2} title={tr("Belum ada rapor")} /> : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {data!.map((r) => (
            <Card key={r.id} className="cursor-pointer transition-colors hover:border-primary/40 hover:bg-muted/30" onClick={() => nav(`/app/reports/${r.uuid ?? r.id}`)}>
              <CardContent className="space-y-3">
                <div className="flex items-start justify-between">
                  <span className={cn("flex size-10 items-center justify-center rounded-xl", r.kind === "karbon" ? "bg-scope2/20 text-amber-700 dark:text-scope2" : "bg-leaf/15 text-leaf")}>{r.kind === "karbon" ? <Zap className="size-5" /> : <Leaf className="size-5" />}</span>
                  <StatusBadge status={r.status} />
                </div>
                <div>
                  <p className="font-semibold">{r.kind === "karbon" ? tr("Rapor Karbon") : tr("Rapor Jasa Lingkungan")}</p>
                  <p className="text-sm text-muted-foreground">{r.period_label}</p>
                </div>
                <div className="flex flex-wrap gap-1.5 text-[0.6875rem]">
                  <Badge variant="outline">{r.baseline_version ?? tr("tanpa baseline")}</Badge>
                  {r.hash && <Badge variant="outline" className="gap-1"><Lock className="size-3" />{fmtDate(r.published_at)}</Badge>}
                  {["draf", "perlu_perbaikan", "perlu_tinjau"].includes(r.status) && can("operator", "admin") && (
                    <button className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-destructive hover:bg-destructive/10" onClick={(e) => { e.stopPropagation(); if (confirm(tl("Hapus rapor draf ini?", "Delete this draft report?"))) del.mutate(r.uuid ?? String(r.id)) }}><Trash2 className="size-3" />{tl("Hapus", "Delete")}</button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{tr("Susun rapor")}</DialogTitle><DialogDescription>{tr("Angka resmi hanya dari data Terverifikasi/Terkunci; data lain dicantumkan sebagai catatan.")}</DialogDescription></DialogHeader>
          <div className="grid gap-3">
            <Field label={tr("Jenis")}><SimpleSelect value={f.kind} onChange={(v) => setF({ ...f, kind: v })} options={[{ value: "karbon", label: tr("Rapor Karbon") }, { value: "jasa", label: tr("Rapor Jasa Lingkungan") }]} /></Field>
            <Field label={tr("Periode")}><SimpleSelect value={f.preset} onChange={(v) => { const p = PRESETS.find((x) => x.v === v)!; setF({ ...f, preset: v, start: p.start, end: p.end, label: p.name }) }} options={PRESETS.map((p) => ({ value: p.v, label: p.label }))} /></Field>
            <div className="grid grid-cols-2 gap-3"><Field label={tr("Mulai")}><Input type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field><Field label={tr("Selesai")}><Input type="date" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field></div>
            <Field label={tr("Label")}><Input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></Field>
          </div>
          <DialogFooter><Button onClick={() => create.mutate()} disabled={create.isPending}>{create.isPending && <Spinner />} {tr("Susun")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
