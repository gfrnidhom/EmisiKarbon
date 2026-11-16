// Peta GIS vektor (SVG) tanpa ubin eksternal: denah lokasi + titik aset.
// Proyeksi ekuirektangular lokal (meter) — akurat untuk area sekolah (< 1 km).
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Crosshair, Layers, Minus, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { tl } from "@/lib/i18n"

export type SiteFeatureType = "boundary" | "building" | "field" | "garden" | "parking" | "path" | "water" | "gate"
export interface SiteFeature { type: SiteFeatureType; name?: string; coords: [number, number][] } // [lat, lng]
export interface GisPoint {
  id: number | string; lat: number; lng: number; label: string
  kind?: string; color?: string; size?: number; muted?: boolean; onClick?: () => void
}

const M_PER_DEG_LAT = 110540
const mPerDegLng = (lat: number) => 111320 * Math.cos((lat * Math.PI) / 180)

// Gaya layer denah (memakai token tema → otomatis gelap/terang)
const FEATURE_STYLE: Record<SiteFeatureType, { fill: string; stroke: string; dash?: string; width?: number }> = {
  boundary: { fill: "color-mix(in srgb, var(--primary) 5%, transparent)", stroke: "var(--primary)", dash: "6 4", width: 1.6 },
  building: { fill: "color-mix(in srgb, var(--foreground) 9%, var(--card))", stroke: "color-mix(in srgb, var(--foreground) 35%, transparent)", width: 1 },
  field: { fill: "rgb(134 197 120 / 0.28)", stroke: "rgb(74 150 70 / 0.55)", width: 1 },
  garden: { fill: "rgb(64 150 72 / 0.32)", stroke: "rgb(40 120 50 / 0.6)", dash: "2 2", width: 1 },
  parking: { fill: "color-mix(in srgb, var(--foreground) 5%, var(--card))", stroke: "color-mix(in srgb, var(--foreground) 25%, transparent)", dash: "3 3", width: 1 },
  path: { fill: "none", stroke: "color-mix(in srgb, var(--foreground) 14%, var(--card))", width: 5 },
  water: { fill: "rgb(80 150 220 / 0.3)", stroke: "rgb(60 120 200 / 0.6)", width: 1 },
  gate: { fill: "var(--primary)", stroke: "var(--primary)", width: 2 },
}
const KIND_COLOR: Record<string, string> = {
  pohon: "#16a571", biopori: "#2563eb", komposter: "#a16207", bank_sampah: "#9333ea", panel: "#f59e0b", atap: "#0891b2", ac: "#e11d48", genset: "#57534e",
}

function niceStep(raw: number) {
  const p = Math.pow(10, Math.floor(Math.log10(raw)))
  return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? 10 * p
}

export function GisMap({ points, features = [], height = 420, legend, className, selectedId, showLabels = true }: {
  points: GisPoint[]; features?: SiteFeature[]; height?: number; legend?: ReactNode; className?: string; selectedId?: number | string | null; showLabels?: boolean
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(800)
  const h = height
  useEffect(() => {
    if (!wrap.current) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, e.contentRect.width)))
    ro.observe(wrap.current)
    return () => ro.disconnect()
  }, [])

  // Titik acuan & proyeksi lat/lng → meter (x timur, y utara)
  const all = useMemo(() => [...features.flatMap((f) => f.coords), ...points.map((p) => [p.lat, p.lng] as [number, number])], [features, points])
  const origin = useMemo(() => {
    if (!all.length) return { lat: -7.23, lng: 111.78 }
    return { lat: all.reduce((s, c) => s + c[0], 0) / all.length, lng: all.reduce((s, c) => s + c[1], 0) / all.length }
  }, [all])
  const toM = useCallback((lat: number, lng: number) => ({ x: (lng - origin.lng) * mPerDegLng(origin.lat), y: (lat - origin.lat) * M_PER_DEG_LAT }), [origin])
  const toLatLng = (x: number, y: number) => ({ lat: origin.lat + y / M_PER_DEG_LAT, lng: origin.lng + x / mPerDegLng(origin.lat) })

  // Skala dasar: muat semua data dengan padding
  const fit = useMemo(() => {
    const pts = all.map(([la, ln]) => toM(la, ln))
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y)
    const minX = Math.min(...xs, -20), maxX = Math.max(...xs, 20), minY = Math.min(...ys, -20), maxY = Math.max(...ys, 20)
    const pad = 36
    const s = Math.min((w - pad * 2) / (maxX - minX || 1), (h - pad * 2) / (maxY - minY || 1))
    return { s, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 }
  }, [all, toM, w, h])
  // Transformasi tampilan (zoom k, geser tx/ty dalam piksel)
  const [view, setView] = useState({ k: 1, tx: 0, ty: 0 })
  // Bila ada titik terpilih: pusatkan & perbesar ke titik itu; selain itu tampilkan semua
  const reset = useCallback(() => {
    const sel = selectedId != null ? points.find((p) => p.id === selectedId) : undefined
    if (!sel || points.length > 1) return setView({ k: 1, tx: 0, ty: 0 })
    const m = toM(sel.lat, sel.lng), k = 2.4
    setView({ k, tx: -(m.x - fit.cx) * fit.s * k, ty: (m.y - fit.cy) * fit.s * k })
  }, [selectedId, points, toM, fit])
  useEffect(reset, [features.length, points.length, fit.s])
  const px = useCallback((m: { x: number; y: number }) => ({
    x: w / 2 + ((m.x - fit.cx) * fit.s) * view.k + view.tx,
    y: h / 2 - ((m.y - fit.cy) * fit.s) * view.k + view.ty,
  }), [w, h, fit, view])
  const unpx = (x: number, y: number) => ({ x: (x - w / 2 - view.tx) / (fit.s * view.k) + fit.cx, y: -(y - h / 2 - view.ty) / (fit.s * view.k) + fit.cy })
  const scale = fit.s * view.k // piksel per meter

  // Interaksi: roda = zoom di kursor, seret = geser
  const zoomAt = (factor: number, cx = w / 2, cy = h / 2) => setView((v) => {
    const k = Math.min(Math.max(v.k * factor, 0.5), 16)
    const f = k / v.k
    return { k, tx: cx - w / 2 - (cx - w / 2 - v.tx) * f, ty: cy - h / 2 - (cy - h / 2 - v.ty) * f }
  })
  const drag = useRef<{ x: number; y: number } | null>(null)
  const [cursor, setCursor] = useState<{ lat: number; lng: number } | null>(null)
  const [hover, setHover] = useState<GisPoint | null>(null)
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 })
  const svgRef = useRef<SVGSVGElement>(null)
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => { e.preventDefault(); const r = el.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1.18 : 1 / 1.18, e.clientX - r.left, e.clientY - r.top) }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  })

  // Grid meter + label koordinat
  const gridStep = niceStep(70 / scale)
  const tl0 = unpx(0, 0), br0 = unpx(w, h)
  const gx: number[] = [], gy: number[] = []
  for (let x = Math.ceil(tl0.x / gridStep) * gridStep; x <= br0.x; x += gridStep) gx.push(x)
  for (let y = Math.ceil(br0.y / gridStep) * gridStep; y <= tl0.y; y += gridStep) gy.push(y)
  const scaleM = niceStep(90 / scale)
  const poly = (coords: [number, number][]) => coords.map(([la, ln]) => { const p = px(toM(la, ln)); return `${p.x.toFixed(1)},${p.y.toFixed(1)}` }).join(" ")
  const centroid = (coords: [number, number][]) => px(toM(coords.reduce((s, c) => s + c[0], 0) / coords.length, coords.reduce((s, c) => s + c[1], 0) / coords.length))
  const order: SiteFeatureType[] = ["boundary", "field", "garden", "parking", "water", "path", "building", "gate"]
  const sorted = [...features].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))

  return (
    <div ref={wrap} className={cn("relative overflow-hidden rounded-xl bg-[color-mix(in_oklch,var(--muted)_60%,var(--card))] ring-1 ring-border select-none", className)} style={{ height: h }}>
      <svg ref={svgRef} width={w} height={h} className={cn("block touch-none", drag.current ? "cursor-grabbing" : "cursor-grab")}
        onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY }; (e.target as Element).setPointerCapture?.(e.pointerId) }}
        onPointerMove={(e) => {
          const r = svgRef.current!.getBoundingClientRect()
          const m = unpx(e.clientX - r.left, e.clientY - r.top); setCursor(toLatLng(m.x, m.y))
          if (drag.current) { const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y; drag.current = { x: e.clientX, y: e.clientY }; setView((v) => ({ ...v, tx: v.tx + dx, ty: v.ty + dy })) }
        }}
        onPointerUp={() => { drag.current = null }} onPointerLeave={() => { drag.current = null; setCursor(null) }}
        onDoubleClick={(e) => { const r = svgRef.current!.getBoundingClientRect(); zoomAt(1.6, e.clientX - r.left, e.clientY - r.top) }}>
        <defs>
          <filter id="gis-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="1.5" dy="2" stdDeviation="1.6" floodOpacity="0.18" /></filter>
          <pattern id="gis-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" strokeWidth="0.6" opacity="0.18" /></pattern>
        </defs>
        {/* grid */}
        <g className="text-muted-foreground" fontSize={9}>
          {gx.map((x) => { const p = px({ x, y: 0 }); return <line key={`x${x}`} x1={p.x} x2={p.x} y1={0} y2={h} stroke="currentColor" strokeOpacity={0.12} /> })}
          {gy.map((y) => { const p = px({ x: 0, y }); return <line key={`y${y}`} y1={p.y} y2={p.y} x1={0} x2={w} stroke="currentColor" strokeOpacity={0.12} /> })}
          {gx.map((x) => { const p = px({ x, y: 0 }); const ll = toLatLng(x, 0); return <text key={`tx${x}`} x={p.x + 3} y={h - 6} fill="currentColor" opacity={0.7}>{ll.lng.toFixed(4)}°</text> })}
          {gy.map((y) => { const p = px({ x: 0, y }); const ll = toLatLng(0, y); return <text key={`ty${y}`} x={4} y={p.y - 3} fill="currentColor" opacity={0.7}>{ll.lat.toFixed(4)}°</text> })}
        </g>
        {/* denah */}
        {sorted.map((f, i) => {
          const st = FEATURE_STYLE[f.type]
          if (f.type === "path") return <polyline key={i} points={poly(f.coords)} fill="none" stroke={st.stroke} strokeWidth={Math.max(2, 4 * scale)} strokeLinecap="round" strokeLinejoin="round" />
          if (f.type === "gate") { const p = centroid(f.coords); return <g key={i}><rect x={p.x - 7} y={p.y - 4} width={14} height={8} rx={2} fill="var(--primary)" /><text x={p.x} y={p.y + 16} textAnchor="middle" fontSize={10} className="fill-primary font-semibold">{f.name}</text></g> }
          return (
            <g key={i} filter={f.type === "building" ? "url(#gis-shadow)" : undefined}>
              <polygon points={poly(f.coords)} fill={st.fill} stroke={st.stroke} strokeWidth={st.width} strokeDasharray={st.dash} strokeLinejoin="round" />
              {f.type === "building" && <polygon points={poly(f.coords)} fill="url(#gis-hatch)" className="text-foreground" />}
            </g>
          )
        })}
        {showLabels && sorted.filter((f) => f.name && !["gate", "path", "boundary"].includes(f.type)).map((f, i) => {
          const p = centroid(f.coords)
          return scale > 1.4 ? <text key={`l${i}`} x={p.x} y={p.y + 3} textAnchor="middle" fontSize={Math.min(12, 6 + scale * 1.2)} className="pointer-events-none fill-foreground/70 font-medium" style={{ paintOrder: "stroke", stroke: "var(--card)", strokeWidth: 3 }}>{f.name}</text> : null
        })}
        {/* titik aset */}
        {points.map((pt) => {
          const p = px(toM(pt.lat, pt.lng))
          if (p.x < -20 || p.y < -20 || p.x > w + 20 || p.y > h + 20) return null
          const color = pt.color ?? KIND_COLOR[pt.kind ?? "pohon"] ?? "#16a571"
          const sel = selectedId != null && pt.id === selectedId
          const common = { onMouseEnter: () => { setHover(pt); setHoverPos(p) }, onMouseLeave: () => setHover(null), onClick: (e: any) => { e.stopPropagation(); pt.onClick?.() }, className: "cursor-pointer" }
          if (!pt.kind || pt.kind === "pohon") {
            // tajuk pohon: jari-jari ≈ 0,12 × DBH (m), minimal 4 px
            const r = Math.max(4, Math.min(28, (pt.size ? Math.max(1.6, pt.size * 0.12) : 2.5) * scale))
            return (
              <g key={pt.id} {...common} opacity={pt.muted ? 0.45 : 1}>
                <circle cx={p.x} cy={p.y} r={r} fill={color} fillOpacity={0.28} stroke={color} strokeOpacity={0.65} strokeWidth={1} />
                <circle cx={p.x} cy={p.y} r={Math.max(2.2, r * 0.28)} fill={color} stroke="white" strokeWidth={1} />
                {sel && <circle cx={p.x} cy={p.y} r={r + 5} fill="none" stroke="var(--foreground)" strokeWidth={2} strokeDasharray="3 2" />}
              </g>
            )
          }
          const s = 5.5
          return (
            <g key={pt.id} {...common} opacity={pt.muted ? 0.45 : 1}>
              {pt.kind === "biopori" ? <circle cx={p.x} cy={p.y} r={s - 1} fill="white" stroke={color} strokeWidth={2.4} />
                : pt.kind === "atap" ? <rect x={p.x - s} y={p.y - s} width={s * 2} height={s * 2} transform={`rotate(45 ${p.x} ${p.y})`} fill={color} stroke="white" strokeWidth={1.2} />
                : pt.kind === "komposter" ? <polygon points={`${p.x},${p.y - s - 1} ${p.x + s + 1},${p.y + s} ${p.x - s - 1},${p.y + s}`} fill={color} stroke="white" strokeWidth={1.2} />
                : <rect x={p.x - s} y={p.y - s} width={s * 2} height={s * 2} rx={2} fill={color} stroke="white" strokeWidth={1.2} />}
              {sel && <circle cx={p.x} cy={p.y} r={s + 6} fill="none" stroke="var(--foreground)" strokeWidth={2} strokeDasharray="3 2" />}
            </g>
          )
        })}
        {/* panah utara & skala */}
        <g transform={`translate(${w - 34}, 30)`} className="text-foreground">
          <circle r={16} fill="var(--card)" stroke="var(--border)" />
          <path d="M0,-11 L5,5 L0,2 L-5,5 Z" fill="currentColor" />
          <text y={-19} textAnchor="middle" fontSize={10} fontWeight={700} fill="currentColor">U</text>
        </g>
        <g transform={`translate(14, ${h - 34})`} className="text-foreground">
          <rect x={-6} y={-14} width={scaleM * scale + 12} height={26} rx={6} fill="var(--card)" fillOpacity={0.85} />
          <rect x={0} y={0} width={(scaleM * scale) / 2} height={4} fill="currentColor" />
          <rect x={(scaleM * scale) / 2} y={0} width={(scaleM * scale) / 2} height={4} fill="none" stroke="currentColor" />
          <text x={0} y={-4} fontSize={9} fill="currentColor">0</text>
          <text x={scaleM * scale} y={-4} fontSize={9} textAnchor="end" fill="currentColor">{scaleM} m</text>
        </g>
      </svg>

      {/* tooltip */}
      {hover && (
        <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-popover px-2.5 py-1.5 text-xs shadow-lg ring-1 ring-border" style={{ left: hoverPos.x, top: hoverPos.y - 10 }}>
          {hover.label}
        </div>
      )}
      {/* kontrol */}
      <div className="absolute right-3 top-14 flex flex-col overflow-hidden rounded-lg bg-card shadow-sm ring-1 ring-border">
        <button className="flex size-8 items-center justify-center hover:bg-muted" onClick={() => zoomAt(1.4)} aria-label="Zoom in"><Plus className="size-4" /></button>
        <button className="flex size-8 items-center justify-center border-y hover:bg-muted" onClick={() => zoomAt(1 / 1.4)} aria-label="Zoom out"><Minus className="size-4" /></button>
        <button className="flex size-8 items-center justify-center hover:bg-muted" onClick={reset} aria-label={tl("Tampilkan semua", "Fit all")}><Crosshair className="size-4" /></button>
      </div>
      <div className="pointer-events-none absolute bottom-3 right-3 rounded-md bg-card/85 px-2 py-1 font-mono text-[0.625rem] text-muted-foreground ring-1 ring-border">
        {cursor ? `${cursor.lat.toFixed(5)}, ${cursor.lng.toFixed(5)}` : <span className="inline-flex items-center gap-1"><Layers className="size-3" /> {tl("Denah GIS · WGS84", "GIS site plan · WGS84")}</span>}
      </div>
      {legend && <div className="absolute left-3 top-3 max-w-[60%] rounded-lg bg-card/90 p-2 text-xs shadow-sm ring-1 ring-border backdrop-blur">{legend}</div>}
    </div>
  )
}
