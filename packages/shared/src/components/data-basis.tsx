import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { ArrowRight, Trees } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { SRC_ICON } from "@/components/dash-kit"
import { api } from "@/lib/api"
import { fmtDate, groupByScope, SOURCES } from "@/lib/format"
import { tl } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export type BasisKind = "bulan_ini" | "terbaru" | "baseline" | "asumsi" | "kosong"

const BASIS: Record<BasisKind, { id: string; en: string; cls: string }> = {
  bulan_ini: { id: "Input terbaru", en: "Latest input", cls: "bg-primary text-primary-foreground" },
  terbaru: { id: "Data terbaru", en: "Latest data", cls: "bg-primary/12 text-primary" },
  baseline: { id: "Data awal", en: "Initial data", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  asumsi: { id: "Asumsi/faktor", en: "Assumption", cls: "bg-muted text-muted-foreground" },
  kosong: { id: "Belum ada", en: "None yet", cls: "bg-muted text-muted-foreground" },
}

export function BasisChip({ kind, className }: { kind?: BasisKind; className?: string }) {
  if (!kind) return null
  const b = BASIS[kind]
  return <span className={cn("inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-[0.6875rem] font-medium whitespace-nowrap", b.cls, className)}>{tl(b.id, b.en)}</span>
}

const LINK: Record<string, string> = { listrik: "/app/input", lpg: "/app/input", kertas: "/app/input", genset: "/app/input", ac: "/app/input", sampah_lokal: "/app/waste", sampah: "/app/waste", mobilitas: "/app/mobility", air_limbah: "/app/settings" }

/** Menunjukkan data apa yang dipakai engine hari ini: data awal baseline atau data terbaru yang menggantikannya. */
export function DataBasisCard({ orgId }: { orgId: number }) {
  const { data: d } = useQuery({ queryKey: ["dashboard", orgId], queryFn: () => api<any>(`/orgs/${orgId}/dashboard`), enabled: !!orgId })
  if (!d) return <Skeleton className="h-80 rounded-2xl" />
  const rows = groupByScope(Object.entries<any>(d.today.sources), ([k]) => k, null, ([, v]) => v.scope).flatMap((g) => g.items)
  const tb = d.trees.basis ?? { remeasured: 0, initialOnly: 0, stopped: 0 }
  const updated = rows.filter(([, s]) => ["bulan_ini", "terbaru"].includes(s.basis?.kind)).length + (tb.remeasured > 0 ? 1 : 0)
  const total = rows.length + 1
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{tl("Data yang dipakai engine hari ini", "Data the engine uses today")}</CardTitle>
        <CardDescription>
          {tl("Baseline dipakai sebagai titik awal. Begitu ada data pemantauan baru (tagihan bulanan, sesi timbang ulang, survei baru, ukur ulang pohon), engine otomatis memakai data terbaru itu — data awal tidak dipakai lagi.",
            "The baseline is the starting point. As soon as new monitoring data arrives (monthly bills, repeat weighings, new surveys, tree re-measurements), the engine automatically switches to it — the initial data is no longer used.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3 rounded-2xl bg-muted/50 p-4">
          <div className="flex h-3 flex-1 overflow-hidden rounded-full bg-amber-500/25">
            <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${(updated / total) * 100}%` }} />
          </div>
          <span className="shrink-0 text-sm"><b className="tabular">{updated}</b> <span className="text-muted-foreground">{tl(`dari ${total} sumber sudah memakai data terbaru`, `of ${total} sources use the latest data`)}</span></span>
        </div>
        <div className="divide-y">
          {rows.map(([k, s]) => {
            const I = SRC_ICON[k] ?? Trees
            return (
              <Link key={k} to={LINK[k] ?? "/app/input"} className="group flex items-center gap-3.5 py-3 transition-colors first:pt-0 hover:text-primary">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full" style={{ background: `color-mix(in srgb, ${SOURCES[k]?.color} 18%, transparent)`, color: SOURCES[k]?.color }}><I className="size-[1.125rem]" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{SOURCES[k]?.label ?? k}</span>
                  <span className="block truncate text-xs text-muted-foreground">{s.basis?.text}</span>
                </span>
                <BasisChip kind={s.basis?.kind} />
                <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            )
          })}
          <Link to="/app/trees" className="group flex items-center gap-3.5 py-3 transition-colors hover:text-primary">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary"><Trees className="size-[1.125rem]" /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{tl("Pohon (pertumbuhan)", "Trees (growth)")}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {tl(`${tb.remeasured} pohon sudah diukur ulang (riap terukur) · ${tb.initialOnly} masih data awal (riap default jenis)`, `${tb.remeasured} re-measured (measured growth) · ${tb.initialOnly} still initial data (species default)`)}
                {tb.stopped ? tl(` · ${tb.stopped} perlu ukur ulang`, ` · ${tb.stopped} need re-measuring`) : ""}
                {tb.lastMeasured ? ` · ${tl("ukur terakhir", "last measured")} ${fmtDate(tb.lastMeasured)}` : ""}
              </span>
            </span>
            <BasisChip kind={tb.remeasured > 0 ? (tb.initialOnly > 0 ? "terbaru" : "bulan_ini") : "baseline"} />
            <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
