import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { AlarmClock, ClipboardCheck, Flame } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyState, PageHeader, PageSkeleton, SimpleSelect, StatCard, StatusBadge } from "@/components/common"
import { api } from "@/lib/api"
import { fmtDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { t as tr, tl } from "@/lib/i18n"

const TYPE_LABEL: Record<string, string> = { activity: "Data aktivitas", baseline: "Baseline", report: "Rapor" }

export default function Queue() {
  const nav = useNavigate()
  const [status, setStatus] = useState("terbuka")
  const [org, setOrg] = useState("semua")
  const [type, setType] = useState("semua")
  const { data, isLoading } = useQuery({ queryKey: ["vtasks", status], queryFn: () => api<any[]>(`/verification/tasks?status=${status}`) })
  const orgs = useMemo(() => [...new Map((data ?? []).map((t) => [t.org_id, t.org_name])).entries()], [data])
  const rows = (data ?? []).filter((t) => (org === "semua" || String(t.org_id) === org) && (type === "semua" || t.object_type === type))
  if (isLoading) return <PageSkeleton />
  const open = (data ?? []).filter((t) => t.status === "terbuka")
  return (
    <div className="space-y-8">
      <PageHeader icon={ClipboardCheck} title={tl("Persetujuan", "Approvals")} description={tl("Data bulanan petugas monitoring di-ACC operator; Survei Awal & rapor disahkan Admin. Terurut: anomali → baseline → tenggat.", "Monitoring officers' monthly data is approved by the operator; the Baseline Survey and reports by the Admin. Sorted: anomalies → baseline → due date.")} />
      <div className="grid gap-6 sm:grid-cols-3">
        <StatCard label={tr("Tugas terbuka")} value={open.length} icon={ClipboardCheck} />
        <StatCard label={tr("Prioritas (anomali)")} value={open.filter((t) => t.priority === "tinggi").length} icon={Flame} tone="warn" />
        <StatCard label={tr("Melewati SLA")} value={open.filter((t) => t.overdue).length} icon={AlarmClock} tone={open.some((t) => t.overdue) ? "warn" : "default"} sub={tl("Admin otomatis diberi tahu", "Admin is notified automatically")} />
      </div>
      <Card>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-3">
            <SimpleSelect value={status} onChange={setStatus} options={[{ value: "terbuka", label: tr("Terbuka") }, { value: "selesai", label: tr("Selesai") }, { value: "semua", label: tr("Semua") }]} />
            <SimpleSelect value={org} onChange={setOrg} options={[{ value: "semua", label: tr("Semua sekolah") }, ...orgs.map(([id, n]) => ({ value: String(id), label: n }))]} />
            <SimpleSelect value={type} onChange={setType} options={[{ value: "semua", label: tr("Semua jenis") }, ...Object.entries(TYPE_LABEL).map(([v, l]) => ({ value: v, label: l }))]} />
          </div>
          {rows.length === 0 ? <EmptyState icon={ClipboardCheck} title={tr("Antrian kosong")} description={tr("Tidak ada tugas pada filter ini.")} /> : (
            <div className="-mx-4 overflow-x-auto sm:mx-0">
              <Table>
                <TableHeader><TableRow><TableHead>{tr("Tugas")}</TableHead><TableHead>{tr("Sekolah")}</TableHead><TableHead>{tr("Jenis")}</TableHead><TableHead>{tr("Prioritas")}</TableHead><TableHead>{tr("Tenggat")}</TableHead><TableHead>{tr("Status")}</TableHead></TableRow></TableHeader>
                <TableBody>{rows.map((t) => (
                  <TableRow key={t.id} className="cursor-pointer" onClick={() => nav(`/approvals/${t.uuid ?? t.id}`)}>
                    <TableCell className="max-w-72"><div className="truncate font-medium">{t.title}</div>{t.reason && <div className="truncate text-xs text-amber-600">{t.reason}</div>}</TableCell>
                    <TableCell className="text-sm">{t.org_name}</TableCell>
                    <TableCell><Badge variant="outline">{TYPE_LABEL[t.object_type] ?? t.object_type}</Badge></TableCell>
                    <TableCell>{t.priority === "tinggi" ? <Badge className="bg-red-500/12 text-red-600">{tr("Tinggi")}</Badge> : <Badge variant="secondary">{tr("Normal")}</Badge>}</TableCell>
                    <TableCell className={cn("text-sm", t.overdue && "font-medium text-destructive")}>{fmtDate(t.due_at)}<div className="text-[0.6875rem] text-muted-foreground">{tr("umur")} {t.ageDays} {tr("hari")}</div></TableCell>
                    <TableCell><StatusBadge status={t.status} />{t.result && <div className="text-[0.6875rem] text-muted-foreground">{t.result}</div>}</TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
