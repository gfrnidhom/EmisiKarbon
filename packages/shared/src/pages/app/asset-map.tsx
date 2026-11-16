import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { Map as MapIcon } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { PageHeader, PageSkeleton, StatusBadge } from "@/components/common"
import { TreeMap } from "@/components/tree-map"
import { api } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { num } from "@/lib/format"
import { t } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const TYPES: Record<string, { label: string; color: string }> = {
  pohon: { label: "Pohon", color: "#16a571" },
  biopori: { label: "Biopori", color: "#2563eb" },
  komposter: { label: "Komposter", color: "#a16207" },
  bank_sampah: { label: "Bank sampah", color: "#9333ea" },
  panel: { label: "Panel surya", color: "#f59e0b" },
  atap: { label: "Atap tangkapan hujan", color: "#0891b2" },
  ac: { label: "Unit AC", color: "#e11d48" },
  genset: { label: "Genset", color: "#57534e" },
}

/** Peta Aset: semua aset ber-QR di satu peta dengan filter jenis. */
export default function AssetMap() {
  const { orgId } = useAuth()
  const nav = useNavigate()
  const { data, isLoading } = useQuery({ queryKey: ["assets", orgId, "all"], queryFn: () => api<any[]>(`/orgs/${orgId}/assets`), enabled: !!orgId })
  const [off, setOff] = useState<Set<string>>(new Set())
  const [sel, setSel] = useState<any>(null)
  const assets = useMemo(() => (data ?? []).filter((a) => a.lat && a.status !== "belum_dipasang"), [data])
  if (isLoading) return <PageSkeleton />
  const visible = assets.filter((a) => !off.has(a.type))
  const counts = Object.fromEntries(Object.keys(TYPES).map((k) => [k, assets.filter((a) => a.type === k).length]))
  return (
    <div className="space-y-8">
      <PageHeader icon={MapIcon} title={t("Peta Aset")} description={t("Pohon, biopori, komposter, panel surya, dan aset lingkungan lain ber-QR beserta lokasi GPS.")} />
      <div className="flex flex-wrap gap-2">
        {Object.entries(TYPES).filter(([k]) => counts[k]).map(([k, v]) => (
          <button key={k} onClick={() => { const s = new Set(off); s.has(k) ? s.delete(k) : s.add(k); setOff(s) }}
            className={cn("flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-all", off.has(k) ? "opacity-40" : "bg-card shadow-xs")}>
            <span className="size-2.5 rounded-full" style={{ background: v.color }} />{t(v.label)}<span className="text-xs text-muted-foreground">{counts[k]}</span>
          </button>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="overflow-hidden py-0"><TreeMap height={560} points={visible.map((a) => ({
          id: a.id, lat: a.lat, lng: a.lng, kind: a.type, size: a.type === "pohon" ? a.dbhNow : undefined, color: a.status !== "hidup" ? "#ef4444" : TYPES[a.type]?.color,
          label: `${a.code} · ${t(TYPES[a.type]?.label ?? a.type)}${a.species_name ? ` · ${a.species_name} · ${num(a.dbhNow, 1)} cm` : ""}`, onClick: () => setSel(a),
        }))} selectedId={sel?.id} /></Card>
        <Card>
          <CardHeader><CardTitle>{sel ? sel.code : t("Ringkasan aset")}</CardTitle><CardDescription>{sel ? t(TYPES[sel.type]?.label ?? sel.type) : t("Klik titik di peta untuk detail")}</CardDescription></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {sel ? (
              <>
                <div className="flex gap-2"><StatusBadge status={sel.status} />{sel.flags?.map((f: string) => <Badge key={f} variant="outline" className="border-amber-500/30 text-amber-600">{t(f)}</Badge>)}</div>
                {sel.type === "pohon" && <dl className="grid grid-cols-2 gap-2"><dt className="text-muted-foreground">{t("Jenis")}</dt><dd>{sel.species_name}</dd><dt className="text-muted-foreground">DBH</dt><dd>{num(sel.dbhNow, 1)} cm</dd><dt className="text-muted-foreground">{t("Stok CO₂")}</dt><dd>{num(sel.stock, 0)} kg</dd></dl>}
                {sel.type !== "pohon" && <dl className="grid grid-cols-2 gap-2">{Object.entries<any>(sel.meta ?? {}).map(([k, v]) => <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd>{String(v)}</dd></div>)}</dl>}
                <p className="font-mono text-xs text-muted-foreground">{sel.lat.toFixed(5)}, {sel.lng.toFixed(5)}</p>
                {sel.type === "pohon" && <button className="text-sm font-medium text-primary" onClick={() => nav(`/app/trees/${sel.uuid ?? sel.id}`)}>{t("Buka kartu pohon")} →</button>}
              </>
            ) : Object.entries(TYPES).filter(([k]) => counts[k]).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: v.color }} />{t(v.label)}<span className="ml-auto font-medium tabular">{counts[k]}</span></div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
