import { useEffect, useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { Play, SlidersHorizontal } from "lucide-react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, PageHeader, PageSkeleton } from "@/components/common"
import { api } from "@/lib/api"
import { fmtDateTime, num } from "@/lib/format"
import { t } from "@/lib/i18n"

const W_LABEL: Record<string, string> = { listrik: "Listrik", mobilitas: "Mobilitas", sampah: "Sampah", pohon: "Pohon", lpg: "LPG", ac: "AC", genset: "Genset", air_limbah: "Air limbah", kertas: "Kertas" }
export default function Config() {
  const { data, isLoading, refetch } = useQuery({ queryKey: ["settings"], queryFn: () => api<any>("/admin/settings") })
  const [s, setS] = useState<any>(null)
  useEffect(() => { if (data) setS(data) }, [data])
  const save = useMutation({ mutationFn: () => api("/admin/settings", { method: "PUT", json: s }), onSuccess: () => toast.success(t("Konfigurasi tersimpan & tercatat di audit")), onError: (e: Error) => toast.error(e.message) })
  const job = useMutation({ mutationFn: () => api<any>("/admin/jobs/daily", { method: "POST" }), onSuccess: (r) => { toast.success(`Job harian ${r.date}: ${r.orgs} lembaga dalam ${num(r.ms)} ms`); refetch() } })
  if (isLoading || !s) return <PageSkeleton />
  const total = Object.values<number>(s.completeness_weights).reduce((a, b) => a + Number(b), 0)
  return (
    <div className="space-y-8">
      <PageHeader icon={SlidersHorizontal} title={t("Konfigurasi")} description={t("Bobot kelengkapan, ambang anomali, SLA, dan job harian (00.30 WIB).")} actions={<Button onClick={() => save.mutate()}>{t("Simpan semua")}</Button>} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t("Bobot kelengkapan baseline")}</CardTitle><CardDescription>{t("Total")} {total}</CardDescription></CardHeader>
          <CardContent className="grid grid-cols-3 gap-3">{Object.entries<number>(s.completeness_weights).map(([k, v]) => (
            <Field key={k} label={W_LABEL[k] ?? k}><Input type="number" value={v} onChange={(e) => setS({ ...s, completeness_weights: { ...s.completeness_weights, [k]: Number(e.target.value) } })} /></Field>
          ))}</CardContent>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>{t("Ambang & SLA")}</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <Field label={t("Anomali kWh (× acuan)")}><Input type="number" step="0.1" value={s.anomaly_kwh_multiplier} onChange={(e) => setS({ ...s, anomaly_kwh_multiplier: Number(e.target.value) })} /></Field>
              {Object.entries<number>(s.sla_days).map(([k, v]) => <Field key={k} label={t("SLA {k} (hari kerja)", { k })}><Input type="number" value={v} onChange={(e) => setS({ ...s, sla_days: { ...s.sla_days, [k]: Number(e.target.value) } })} /></Field>)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>{t("Job hitung harian")}</CardTitle><CardDescription>Terjadwal 00.30 WIB · alert bila gagal atau &gt; 30 menit</CardDescription></CardHeader>
            <CardContent className="text-sm">{s.last_daily_job ? <>{t("Terakhir:")} {s.last_daily_job.date} · {s.last_daily_job.orgs} {t("lembaga")} · {num(s.last_daily_job.ms)} ms · {fmtDateTime(s.last_daily_job.at)}</> : t("Belum pernah berjalan")}</CardContent>
            <CardFooter><Button variant="outline" onClick={() => job.mutate()} disabled={job.isPending}><Play /> {t("Jalankan sekarang")}</Button></CardFooter>
          </Card>
        </div>
      </div>
    </div>
  )
}
