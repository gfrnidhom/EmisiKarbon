import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Slider } from "@/components/ui/slider"
import { Field, PageHeader, PageSkeleton, SimpleSelect } from "@/components/common"
import { api } from "@/lib/api"
import { useOrg } from "@/lib/hooks"
import { fmtDate, fmtMonth, monthAdd, num, todayWIB } from "@/lib/format"
import { cn } from "@/lib/utils"
import { t as tr } from "@/lib/i18n"

const TYPE_STYLE: Record<string, string> = {
  aktif: "bg-primary/10 text-foreground ring-transparent",
  libur: "bg-muted text-muted-foreground ring-transparent",
  ujian: "bg-sky-500/12 ring-transparent",
  khusus: "bg-amber-500/15 ring-transparent",
}
const DOW = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"]

export default function CalendarPage() {
  const { orgId, can } = useOrg()
  const qc = useQueryClient()
  const [month, setMonth] = useState(todayWIB().slice(0, 7))
  const { data, isLoading } = useQuery({ queryKey: ["calendar", orgId, month], queryFn: () => api<any[]>(`/orgs/${orgId}/calendar?month=${month}`), enabled: !!orgId })
  const [edit, setEdit] = useState<any>(null)
  const save = useMutation({
    mutationFn: () => api(`/orgs/${orgId}/calendar/${edit.date}`, { method: "PUT", json: { type: edit.type, attendance_pct: edit.attendance, note: edit.note } }),
    onSuccess: () => { toast.success(tr("Kalender diperbarui — emisi dihitung ulang")); setEdit(null); qc.invalidateQueries({ queryKey: ["calendar"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }) },
    onError: (e: Error) => toast.error(e.message),
  })
  if (isLoading || !data) return <PageSkeleton />
  const offset = (new Date(month + "-01T00:00:00Z").getUTCDay() + 6) % 7
  const counts = data.reduce((s: any, d: any) => ({ ...s, [d.type]: (s[d.type] ?? 0) + 1 }), {})
  return (
    <div className="space-y-8">
      <PageHeader icon={CalendarDays} title={tr("Kalender akademik")} description={tr("Hari aktif, libur, ujian, dan hari khusus (kegiatan di hari libur dengan % kehadiran). Sumber berbasis orang mengikuti % kehadiran.")} />
      <Card>
        <CardHeader>
          <CardTitle>{fmtMonth(month)}</CardTitle>
          <CardDescription>{counts.aktif ?? 0} {tr("aktif ·")} {counts.ujian ?? 0} {tr("ujian ·")} {counts.khusus ?? 0} {tr("khusus ·")} {counts.libur ?? 0} {tr("libur")}</CardDescription>
          <CardAction className="flex gap-1">
            <Button size="icon" variant="outline" onClick={() => setMonth(monthAdd(month, -1))}><ChevronLeft /></Button>
            <Button variant="outline" onClick={() => setMonth(todayWIB().slice(0, 7))}>{tr("Hari ini")}</Button>
            <Button size="icon" variant="outline" onClick={() => setMonth(monthAdd(month, 1))}><ChevronRight /></Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1.5 text-center text-xs text-muted-foreground">{DOW.map((d) => <div key={d} className="py-1">{d}</div>)}</div>
          <div className="mt-1 grid grid-cols-7 gap-1.5">
            {Array.from({ length: offset }).map((_, i) => <div key={i} />)}
            {data.map((d: any) => (
              <button key={d.date} disabled={!can("operator", "admin")} onClick={() => setEdit({ ...d, attendance: d.attendance ?? 100 })}
                className={cn("flex min-h-16 flex-col rounded-xl p-1.5 text-left ring-1 transition-all hover:ring-2 hover:ring-primary/40 sm:min-h-20 sm:p-2.5", TYPE_STYLE[d.type], d.date === todayWIB() && "ring-2 ring-primary")}>
                <span className="text-sm font-medium">{Number(d.date.slice(8))}</span>
                {d.type === "khusus" && <span className="text-[0.625rem] font-medium text-amber-700 dark:text-amber-300">{num(d.attendance)}%</span>}
                {d.note && <span className="line-clamp-2 hidden text-[0.625rem] leading-tight text-muted-foreground sm:block">{d.note}</span>}
                {d.total != null && <span className="mt-auto hidden text-[0.625rem] tabular text-muted-foreground sm:block">{num(d.total, 0)} {tr("kg")}</span>}
              </button>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-3 text-xs">{Object.keys(TYPE_STYLE).map((t) => <span key={t} className="flex items-center gap-1.5 capitalize"><span className={cn("size-3 rounded ring-1", TYPE_STYLE[t])} />{t}</span>)}</div>
        </CardContent>
      </Card>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit && fmtDate(edit.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</DialogTitle><DialogDescription>{tr("Hari khusus: kegiatan di hari libur — mobilitas, sampah, dan air limbah mengikuti % kehadiran.")}</DialogDescription></DialogHeader>
          {edit && (
            <div className="space-y-6">
              <Field label={tr("Jenis hari")}><SimpleSelect value={edit.type} onChange={(v) => setEdit({ ...edit, type: v })} options={[{ value: "aktif", label: tr("Hari aktif") }, { value: "libur", label: tr("Libur") }, { value: "ujian", label: tr("Ujian") }, { value: "khusus", label: tr("Hari khusus") }, { value: "default", label: tr("Kembalikan ke bawaan") }]} /></Field>
              {edit.type === "khusus" && <Field label={`Kehadiran ${num(edit.attendance)}%`}><Slider value={[edit.attendance]} min={0} max={100} step={5} onValueChange={(v) => setEdit({ ...edit, attendance: Array.isArray(v) ? v[0] : v })} /></Field>}
              <Field label={tr("Keterangan")}><Input value={edit.note ?? ""} onChange={(e) => setEdit({ ...edit, note: e.target.value })} placeholder={tr("mis. Class meeting, SK kalender pendidikan")} /></Field>
            </div>
          )}
          <DialogFooter><Button onClick={() => save.mutate()}>{tr("Simpan")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
