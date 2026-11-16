import type { ReactNode } from "react"
import { useOrg } from "@/lib/hooks"
import { GisMap, type GisPoint, type SiteFeature } from "./gis-map"

export interface MapPoint extends GisPoint { radius?: number }

/** Peta aset pada denah GIS sekolah aktif (batas lahan, gedung, lapangan, jalan). */
export function TreeMap({ points, height = 360, legend, selectedId, features }: {
  points: MapPoint[]; height?: number; center?: [number, number]; legend?: ReactNode; selectedId?: number | string | null; features?: SiteFeature[]
}) {
  const { org } = useOrg()
  const site: SiteFeature[] = features ?? (Array.isArray(org?.polygon) ? org.polygon : [])
  return <GisMap points={points} features={site} height={height} legend={legend} selectedId={selectedId} />
}
