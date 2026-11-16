import { useParams, useSearchParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { BadgeCheck, MapPin, Share2, ShieldAlert, TreeDeciduous } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { GrowthChart } from "@/components/charts"
import { EmptyState, PageSkeleton, QualityBadge, StatusBadge } from "@/components/common"
import { PublicHeader } from "./landing"
import { ASSET_META } from "@/components/tree-qr-card"
import { tl } from "@/lib/i18n"
import { api } from "@/lib/api"
import { fmtDate, num } from "@/lib/format"
import { t } from "@/lib/i18n"

export default function TreePublic() {
  const { code } = useParams()
  const [sp] = useSearchParams()
  const { data, isLoading, error } = useQuery({ queryKey: ["public-tree", code], queryFn: () => api<any>(`/public/trees/${code}?s=${sp.get("s") ?? ""}`) })
  const share = async () => {
    const url = location.href
    if (navigator.share) await navigator.share({ title: `Pohon ${data?.species} — ${data?.org}`, url }).catch(() => {})
    else { await navigator.clipboard.writeText(url); toast.success(t("Tautan disalin")) }
  }
  return (
    <div className="min-h-svh bg-muted/30">
      <PublicHeader />
      <div className="mx-auto max-w-3xl px-4 py-8">
        {isLoading ? <PageSkeleton /> : error ? <EmptyState icon={TreeDeciduous} title={t("Aset tidak ditemukan")} description={(error as Error).message} /> : data.kind === "asset" ? <AssetProfile data={data} share={share} /> : (
          <div className="space-y-6">
            {data.verified === false && (
              <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"><ShieldAlert className="size-4" /> {t("Tanda tangan QR tidak cocok — label mungkin palsu atau telah diubah.")}</div>
            )}
            <Card className="overflow-hidden">
              <div className="relative h-40 bg-gradient-to-br from-emerald-600 to-teal-500">
                <div className="bg-grid absolute inset-0 opacity-25" />
                <TreeDeciduous className="absolute -bottom-6 right-6 size-40 text-white/20" />
                <div className="absolute bottom-4 left-5 text-white">
                  <div className="flex items-center gap-2 font-mono text-sm opacity-90">{data.code}{data.verified && <BadgeCheck className="size-4" />}</div>
                  <h1 className="text-3xl font-semibold">{data.species ?? t("Label belum dipasang")}</h1>
                  <p className="text-sm italic opacity-90">{data.scientific}</p>
                  {data.description && <p className="mt-1 max-w-md text-sm opacity-90">{data.description}</p>}
                </div>
              </div>
              <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div><div className="text-xs text-muted-foreground">{t("Diameter (DBH)")}</div><div className="text-xl font-semibold tabular">{num(data.dbh, 1)} {t("cm")}</div></div>
                <div><div className="text-xs text-muted-foreground">{t("Tinggi")}</div><div className="text-xl font-semibold tabular">{num(data.height, 1)} m</div></div>
                <div><div className="text-xs text-muted-foreground">{t("Stok CO₂")}</div><div className="text-xl font-semibold tabular text-primary">{num(data.stockKg, 0)} {t("kg")}</div></div>
                <div><div className="text-xs text-muted-foreground">{t("Status")}</div><div className="mt-1 flex gap-1"><StatusBadge status={data.status} /><QualityBadge label={data.label} /></div></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>{t("Grafik tumbuh")}</CardTitle></CardHeader>
              <CardContent><GrowthChart data={data.growth.map((g: any) => ({ ...g, label: t("terukur") }))} height={220} /></CardContent>
            </Card>
            <Card>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground"><MapPin className="size-4" /> {data.org} {t("· Kec.")} {data.kecamatan} {t("· diukur")} {fmtDate(data.lastMeasured)}</div>
                <Button variant="outline" size="sm" onClick={share}><Share2 /> {t("Bagikan")}</Button>
              </CardContent>
            </Card>
            <p className="text-center text-xs text-muted-foreground">{data.note} {t("Data pribadi tidak ditampilkan.")}</p>
          </div>
        )}
      </div>
    </div>
  )
}

/** Profil publik aset non-pohon (biopori, atap, komposter, bank sampah, panel surya, AC, genset). */
const META_LABEL: Record<string, [string, string, string?]> = {
  diameter_cm: ["Diameter", "Diameter", "cm"], depth_cm: ["Kedalaman", "Depth", "cm"], area_m2: ["Luas atap", "Roof area", "m²"], tank_l: ["Tandon", "Tank", "L"],
  capacity_l: ["Kapasitas", "Capacity", "L"], kind: ["Jenis", "Kind"], kwp: ["Kapasitas", "Capacity", "kWp"], inverter: ["Inverter", "Inverter"],
  gas: ["Refrigeran", "Refrigerant"], charge_kg: ["Muatan refrigeran", "Refrigerant charge", "kg"], room: ["Ruang", "Room"], name: ["Nama", "Name"],
}
function AssetProfile({ data, share }: { data: any; share: () => void }) {
  const M = ASSET_META[data.type] ?? ASSET_META.biopori
  const rows = Object.entries(data.meta ?? {}).filter(([k, v]) => META_LABEL[k] && v !== "" && v != null)
  return (
    <div className="space-y-6">
      {data.verified === false && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"><ShieldAlert className="size-4" /> {t("Tanda tangan QR tidak cocok — label mungkin palsu atau telah diubah.")}</div>
      )}
      <Card className="overflow-hidden">
        <div className="relative flex min-h-44 flex-col justify-end px-5 pt-8 pb-4 text-white" style={{ background: `linear-gradient(135deg, ${M.from}, ${M.to})` }}>
          <div className="bg-grid absolute inset-0 opacity-20" />
          <M.icon className="absolute -right-4 -bottom-6 size-40 text-white/15" strokeWidth={1.4} />
          <div className="relative">
            <div className="flex items-center gap-2 font-mono text-sm opacity-90">{data.code}{data.verified && <BadgeCheck className="size-4" />}</div>
            <h1 className="text-3xl leading-tight font-semibold">{data.name || tl(M.id, M.en)}</h1>
            <p className="mt-1 max-w-md text-sm opacity-90">{tl(M.descId, M.descEn)}</p>
          </div>
        </div>
        <CardContent className="space-y-4 pt-5">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-muted/60 p-3"><dt className="text-xs text-muted-foreground">{tl("Jenis aset", "Asset type")}</dt><dd className="mt-0.5 font-semibold">{tl(M.id, M.en)}</dd></div>
            <div className="rounded-2xl bg-muted/60 p-3"><dt className="text-xs text-muted-foreground">{tl("Terdaftar", "Registered")}</dt><dd className="mt-0.5 font-semibold">{data.registered ? fmtDate(data.registered) : tl("Belum dipasang", "Not installed")}</dd></div>
            {rows.map(([k, v]) => { const [id, en, unit] = META_LABEL[k]; return <div key={k} className="rounded-2xl bg-muted/60 p-3"><dt className="text-xs text-muted-foreground">{tl(id, en)}</dt><dd className="mt-0.5 font-semibold">{typeof v === "number" ? num(v, Number.isInteger(v) ? 0 : 2) : String(v)}{unit ? ` ${unit}` : ""}</dd></div> })}
          </dl>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5"><MapPin className="size-4" />{data.org} · {t("Kec.")} {data.kecamatan}</span>
            <Button variant="outline" size="sm" onClick={share}><Share2 /> {t("Bagikan")}</Button>
          </div>
        </CardContent>
      </Card>
      <p className="text-center text-xs text-muted-foreground">{t("Tidak ada data pribadi yang ditampilkan.")}</p>
    </div>
  )
}
