import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { Building2, ClipboardList, Lock, Trees, Users } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Meter, PageHeader, PageSkeleton, SimpleSelect, StatCard, StatusBadge } from "@/components/common"
import { BarsChart } from "@/components/charts"
import { api } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { num, pct, ton } from "@/lib/format"
import { cn } from "@/lib/utils"
import { t, tl } from "@/lib/i18n"

export default function Program() {
  const nav = useNavigate()
  const { setOrgId } = useAuth()
  const [kec, setKec] = useState("")
  const [jen, setJen] = useState("")
  const { data, isLoading } = useQuery({ queryKey: ["program", kec, jen], queryFn: () => api<any>(`/program/overview?kecamatan=${kec}&jenjang=${jen}`) })
  if (isLoading) return <PageSkeleton />
  const o = data.orgs as any[]
  const locked = o.filter((x) => x.baseline?.status === "terkunci").length
  return (
    <div className="space-y-8">
      <PageHeader icon={Building2} title={tl("Dasbor program", "Program dashboard")} description={tl("Rekap semua lembaga: status Survei Awal, kelengkapan pemantauan, dan antrean persetujuan.", "All institutions: Baseline Survey status, monitoring completeness and approval queue.")}
        actions={<>
          <SimpleSelect className="w-44" value={kec || "semua"} onChange={(v) => setKec(v === "semua" ? "" : v)} options={[{ value: "semua", label: t("Semua kecamatan") }, ...data.filters.kecamatan.map((k: string) => ({ value: k, label: k }))]} />
          <SimpleSelect className="w-36" value={jen || "semua"} onChange={(v) => setJen(v === "semua" ? "" : v)} options={[{ value: "semua", label: t("Semua jenjang") }, ...data.filters.jenjang.map((k: string) => ({ value: k, label: k }))]} />
        </>} />
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard featured label={t("Lembaga")} value={o.length} icon={Building2} sub={`${num(o.reduce((s, x) => s + x.population, 0))} warga`} />
        <StatCard label={t("Baseline terkunci")} value={`${locked}/${o.length}`} icon={Lock} tone="leaf" sub={t("Target G1: 2/2 ≤ 6 minggu")} footer={<Meter value={(locked / Math.max(o.length, 1)) * 100} />} />
        <StatCard label={t("Emisi 30 hari")} value={ton(o.reduce((s, x) => s + x.emission30, 0))} icon={ClipboardList} tone="scope2" sub={t("CO₂e semua lembaga")} />
        <StatCard label={t("Stok karbon pohon")} value={`${num(o.reduce((s, x) => s + x.treeStock, 0) / 1000, 1)} t`} icon={Trees} tone="leaf" sub={`${num(o.reduce((s, x) => s + x.treeCount, 0))} pohon`} />
      </div>
      <Card>
        <CardHeader><CardTitle>{t("Rekap lembaga")}</CardTitle><CardDescription>{t("Klik baris untuk membuka dasbor sekolah")}</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto px-0">
          <Table>
            <TableHeader><TableRow><TableHead className="pl-6">{t("Lembaga")}</TableHead><TableHead>{t("Baseline")}</TableHead><TableHead className="w-36">{t("Kelengkapan")}</TableHead><TableHead className="text-right">{t("Emisi 30 hr")}</TableHead><TableHead className="text-right">{t("kg/orang/hari")}</TableHead><TableHead className="text-right">{t("Data kuat")}</TableHead><TableHead>{t("Verifikasi")}</TableHead><TableHead className="pr-6">{t("Pemantauan")}</TableHead></TableRow></TableHeader>
            <TableBody>{o.map((x) => (
              <TableRow key={x.id} className="cursor-pointer" onClick={() => { setOrgId(x.id); nav("/app") }}>
                <TableCell className="pl-6"><div className="font-medium">{x.name}</div><div className="text-xs text-muted-foreground">{t("Kec.")} {x.kecamatan} · {x.jenjang} · {x.verifiers.map((v: any) => v.name).join(", ")}</div></TableCell>
                <TableCell>{x.baseline ? <div className="space-y-1"><StatusBadge status={x.baseline.status} /><div className="text-[0.6875rem] text-muted-foreground">{x.baseline.version}</div></div> : <Badge variant="outline">{t("belum")}</Badge>}</TableCell>
                <TableCell>{x.baseline && <div className="flex items-center gap-2"><Meter value={x.baseline.completeness} tone={x.baseline.completeness >= 80 ? "primary" : "warn"} /><span className="text-xs tabular">{num(x.baseline.completeness)}%</span></div>}</TableCell>
                <TableCell className="text-right tabular">{ton(x.emission30)}</TableCell>
                <TableCell className="text-right tabular">{num(x.perPersonDay, 3)}</TableCell>
                <TableCell className="text-right tabular">{pct(x.strongShare)}</TableCell>
                <TableCell><span className="text-sm">{x.pendingTasks} {t("terbuka")}</span>{x.overdueTasks > 0 && <Badge variant="destructive" className="ml-1">{x.overdueTasks} {t("lewat SLA")}</Badge>}</TableCell>
                <TableCell className="pr-6"><span className={cn("text-sm", x.monitoring.late && "text-destructive")}>{x.monitoring.total} {t("tugas")}{x.monitoring.late ? ` · ${x.monitoring.late} terlambat` : ""}</span></TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        </CardContent>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Users className="size-4" /> {tl("Antrean persetujuan", "Approval queue")}</CardTitle><CardDescription>{t("Antrian terbuka & lewat SLA per verifikator")}</CardDescription></CardHeader>
          <CardContent>
            <BarsChart height={200} data={data.verifierLoad.map((v: any) => ({ name: v.name.split(" ").slice(0, 2).join(" "), terbuka: v.open, lewat: v.overdue }))} xKey="name" bars={[{ key: "terbuka", label: t("Terbuka"), color: "var(--primary)", stack: "a" }, { key: "lewat", label: t("Lewat SLA"), color: "var(--destructive)", stack: "a" }]} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("Intensitas per lembaga")}</CardTitle><CardDescription>{t("kg CO₂e per orang per hari aktif (30 hari)")}</CardDescription></CardHeader>
          <CardContent><BarsChart height={200} data={o.map((x) => ({ name: x.short ?? x.name, intensitas: +x.perPersonDay.toFixed(3) }))} xKey="name" bars={[{ key: "intensitas", label: t("kg/orang/hari"), color: "var(--scope3)" }]} /></CardContent>
        </Card>
      </div>
    </div>
  )
}
