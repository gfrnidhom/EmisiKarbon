import { useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { BadgeCheck, ShieldX } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { PageSkeleton } from "@/components/common"
import { PublicHeader } from "./landing"
import { api } from "@/lib/api"
import { fmtDateTime } from "@/lib/format"
import { t } from "@/lib/i18n"

export default function ReportVerify() {
  const { hash } = useParams()
  const { data, isLoading } = useQuery({ queryKey: ["verify", hash], queryFn: () => api<any>(`/public/reports/${hash}`) })
  return (
    <div className="min-h-svh bg-muted/30">
      <PublicHeader />
      <div className="mx-auto max-w-lg px-4 py-12">
        {isLoading ? <PageSkeleton /> : (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-6 text-center">
              {data.valid ? <BadgeCheck className="size-14 text-primary" /> : <ShieldX className="size-14 text-destructive" />}
              <h1 className="text-xl font-semibold">{data.valid ? t("Rapor asli & terkunci") : t("Rapor tidak valid")}</h1>
              {data.valid && (
                <div className="w-full space-y-1 rounded-lg bg-muted p-4 text-left text-sm">
                  <p><b>{data.kind === "karbon" ? t("Rapor Karbon") : t("Rapor Jasa Lingkungan")}</b> — {data.org_name}</p>
                  <p>{t("Periode:")} {data.period_label}</p>
                  <p>{t("Baseline:")} {data.baseline_version}</p>
                  <p>{t("Terbit:")} {fmtDateTime(data.published_at)}</p>
                  <p className="break-all font-mono text-[0.6875rem] text-muted-foreground">{t("SHA-256")} {data.hash}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
