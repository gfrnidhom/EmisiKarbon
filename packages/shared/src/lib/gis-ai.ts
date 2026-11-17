import type { SiteFeature, SiteFeatureType } from "@/components/gis-map"

const M_PER_DEG_LAT = 110540
const mPerDegLng = (lat: number) => 111320 * Math.cos((lat * Math.PI) / 180)

export interface GisCenter { lat: number; lng: number }

export function toLatLng(c: GisCenter, x: number, y: number): [number, number] {
  return [
    Number((c.lat + y / M_PER_DEG_LAT).toFixed(6)),
    Number((c.lng + x / mPerDegLng(c.lat)).toFixed(6)),
  ]
}

export function toMeters(c: GisCenter, lat: number, lng: number) {
  return { x: (lng - c.lng) * mPerDegLng(c.lat), y: (lat - c.lat) * M_PER_DEG_LAT }
}

/** Hitung titik pusat & rentang meter dari fitur GIS atau titik aset yang sudah ada. */
export function inferCenter(features: SiteFeature[], points: { lat: number; lng: number }[], fallback?: GisCenter): GisCenter {
  const all: [number, number][] = [
    ...features.flatMap((f) => f.coords),
    ...points.filter((p) => p.lat && p.lng).map((p) => [p.lat, p.lng] as [number, number]),
  ]
  if (!all.length) return fallback ?? { lat: -7.2321, lng: 111.7792 }
  return {
    lat: all.reduce((s, c) => s + c[0], 0) / all.length,
    lng: all.reduce((s, c) => s + c[1], 0) / all.length,
  }
}

const BUILDING_NAMES = [
  "Gedung Utama & TU",
  "Ruang Kelas A",
  "Ruang Kelas B",
  "Ruang Kelas C",
  "Laboratorium",
  "Perpustakaan",
  "Aula Sekolah",
  "Musala",
  "Kantin",
  "UKS & Koperasi",
  "Ruang Guru",
  "Gudang & Bengkel",
]

type Box = { x1: number; y1: number; x2: number; y2: number; area: number; score: number }

function rgbToHsv(r: number, g: number, b: number) {
  const rf = r / 255, gf = g / 255, bf = b / 255
  const max = Math.max(rf, gf, bf), min = Math.min(rf, gf, bf), d = max - min
  let h = 0
  if (d > 0) {
    if (max === rf) h = ((gf - bf) / d + (gf < bf ? 6 : 0)) * 60
    else if (max === gf) h = ((bf - rf) / d + 2) * 60
    else h = ((rf - gf) / d + 4) * 60
  }
  return { h, s: max === 0 ? 0 : d / max, v: max }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("Gagal memuat gambar"))
    img.src = src
  })
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error("Gagal membaca berkas gambar"))
    r.readAsDataURL(file)
  })
}

export interface GisAiResult {
  features: SiteFeature[]
  summary: { buildings: number; green: number; water: number; paths: number; mode: "ai-server" | "ai-vision" }
  dataUrl: string
}

/**
 * Analisis citra/denah (foto satelit, gambar denah arsitektur, atau sketsa) → vektor GIS `SiteFeature[]`
 * sesuai format `GisMap` (boundary, building, field, garden, parking, path, water, gate).
 */
export async function analyzeImageToGis(
  dataUrl: string,
  opts: { center: GisCenter; landM2?: number }
): Promise<GisAiResult> {
  const img = await loadImage(dataUrl)
  const W = 96, H = 80
  const canvas = document.createElement("canvas")
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext("2d")!
  ctx.drawImage(img, 0, 0, W, H)
  const { data } = ctx.getImageData(0, 0, W, H)

  // Skala lahan: default ±120m × 100m (12.000 m²), menyesuaikan luas lahan sekolah
  const scale = Math.min(1.35, Math.max(0.75, Math.sqrt((opts.landM2 || 12000) / 12000)))
  const halfW = 60 * scale, halfH = 50 * scale
  const gxToM = (gx: number) => ((gx / W) * 2 - 1) * halfW
  // y di gambar: 0 = atas (Utara = +halfH), H = bawah (Selatan = -halfH)
  const gyToM = (gy: number) => (1 - (gy / H) * 2) * halfH
  const rectCoords = (x1: number, y1: number, x2: number, y2: number): [number, number][] => [
    toLatLng(opts.center, x1, y1),
    toLatLng(opts.center, x2, y1),
    toLatLng(opts.center, x2, y2),
    toLatLng(opts.center, x1, y2),
  ]

  // Estimasi warna latar dari tepi gambar (untuk membedakan denah di atas kertas putih/gelap vs foto satelit)
  let borderV = 0, borderS = 0, borderN = 0
  for (let x = 0; x < W; x++) for (const y of [0, 1, H - 2, H - 1]) {
    const i = (y * W + x) * 4
    const hsv = rgbToHsv(data[i], data[i + 1], data[i + 2])
    borderV += hsv.v; borderS += hsv.s; borderN++
  }
  const bgLight = borderV / borderN > 0.78 && borderS / borderN < 0.2

  // Klasifikasi piksel: 0 = netral, 1 = building, 2 = veg (field/garden), 3 = water, 4 = paved/parking
  const cls = new Uint8Array(W * H)
  const lum = new Float32Array(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x, i = idx * 4
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3]
      if (a < 40) continue
      lum[idx] = (0.299 * r + 0.587 * g + 0.114 * b) / 255
      const { h, s, v } = rgbToHsv(r, g, b)

      // Air / kolam (biru/toska)
      if (h >= 175 && h <= 250 && s > 0.24 && v > 0.22) { cls[idx] = 3; continue }
      // Vegetasi / lapangan rumput / taman (hijau)
      if ((h >= 68 && h <= 168 && s > 0.16 && v > 0.16) || (g > r * 1.12 && g > b * 1.1 && g > 45)) { cls[idx] = 2; continue }
      // Atap bangunan (merah bata / oranye / cokelat / kuning tua pada citra satelit atau denah berwarna)
      if ((h <= 46 || h >= 335) && s > 0.2 && v > 0.22 && v < 0.94) { cls[idx] = 1; continue }
      // Pada denah berlatar terang: blok abu-abu gelap / hitam / warna pekat = bangunan
      if (bgLight && ((v < 0.62 && s < 0.25) || (s > 0.28 && v < 0.88))) { cls[idx] = 1; continue }
      // Area perkerasan / parkir
      if (s < 0.16 && v >= 0.35 && v <= 0.76) { cls[idx] = 4; continue }
    }
  }

  // Bila gambar monokrom / sketsa tipis dan bangunan sedikit terdeteksi, gunakan kontras lokal terhadap rata-rata
  let bCount = 0
  for (let i = 0; i < cls.length; i++) if (cls[i] === 1) bCount++
  if (bCount < W * H * 0.03) {
    let mean = 0
    for (let i = 0; i < lum.length; i++) mean += lum[i]
    mean /= lum.length
    for (let y = 3; y < H - 3; y++) {
      for (let x = 3; x < W - 3; x++) {
        const idx = y * W + x
        if (cls[idx] !== 0) continue
        const d = bgLight ? mean - lum[idx] : Math.abs(lum[idx] - mean)
        if (d > 0.12) cls[idx] = 1
      }
    }
  }

  // Ekstraksi komponen terhubung (connected components)
  const extractBoxes = (target: number, minCells: number): Box[] => {
    const seen = new Uint8Array(W * H)
    const boxes: Box[] = []
    for (let y = 2; y < H - 2; y++) {
      for (let x = 2; x < W - 2; x++) {
        const start = y * W + x
        if (seen[start] || cls[start] !== target) continue
        const q = [start]
        seen[start] = 1
        let minX = x, maxX = x, minY = y, maxY = y, count = 0
        while (q.length) {
          const cur = q.pop()!
          const cy = Math.floor(cur / W), cx = cur % W
          count++
          if (cx < minX) minX = cx; if (cx > maxX) maxX = cx
          if (cy < minY) minY = cy; if (cy > maxY) maxY = cy
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
            const nx = cx + dx, ny = cy + dy
            if (nx < 1 || nx >= W - 1 || ny < 1 || ny >= H - 1) continue
            const ni = ny * W + nx
            if (!seen[ni] && cls[ni] === target) { seen[ni] = 1; q.push(ni) }
          }
        }
        if (count < minCells) continue
        const bw = maxX - minX + 1, bh = maxY - minY + 1
        const fillRatio = count / (bw * bh)
        // Pecah blok yang terlalu besar (mis. gedung bentuk U/L) menjadi sayap bangunan
        if (target === 1 && (bw > W * 0.48 || bh > H * 0.45) && fillRatio < 0.58) {
          const mx = Math.floor((minX + maxX) / 2), my = Math.floor((minY + maxY) / 2)
          const quads: [number, number, number, number][] = [
            [minX, minY, mx - 1, my - 1], [mx + 1, minY, maxX, my - 1],
            [minX, my + 1, mx - 1, maxY], [mx + 1, my + 1, maxX, maxY],
          ]
          for (const [qx1, qy1, qx2, qy2] of quads) {
            let sub = 0
            for (let sy = qy1; sy <= qy2; sy++) for (let sx = qx1; sx <= qx2; sx++) if (cls[sy * W + sx] === target) sub++
            if (sub >= minCells) {
              const x1 = gxToM(qx1), x2 = gxToM(qx2 + 1), y1 = gyToM(qy2 + 1), y2 = gyToM(qy1)
              boxes.push({ x1, y1, x2, y2, area: (x2 - x1) * (y2 - y1), score: sub })
            }
          }
        } else {
          const x1 = gxToM(minX), x2 = gxToM(maxX + 1), y1 = gyToM(maxY + 1), y2 = gyToM(minY)
          boxes.push({ x1, y1, x2, y2, area: (x2 - x1) * (y2 - y1), score: count })
        }
      }
    }
    return boxes.sort((a, b) => b.score - a.score)
  }

  const overlap = (a: Box, b: Box, pad = 2) =>
    !(a.x2 + pad < b.x1 || a.x1 - pad > b.x2 || a.y2 + pad < b.y1 || a.y1 - pad > b.y2)

  const clampBox = (b: Box, minW: number, maxW: number, minH: number, maxH: number): Box => {
    const cx = (b.x1 + b.x2) / 2, cy = (b.y1 + b.y2) / 2
    const w = Math.min(maxW, Math.max(minW, b.x2 - b.x1))
    const h = Math.min(maxH, Math.max(minH, b.y2 - b.y1))
    const x1 = Math.max(-halfW * 0.9, Math.min(halfW * 0.9 - w, cx - w / 2))
    const y1 = Math.max(-halfH * 0.88, Math.min(halfH * 0.88 - h, cy - h / 2))
    return { x1, y1, x2: x1 + w, y2: y1 + h, area: w * h, score: b.score }
  }

  // 1. Hijau (Lapangan & Kebun)
  const rawGreen = extractBoxes(2, 16)
  const placed: Box[] = []
  const greenFeatures: SiteFeature[] = []
  for (const g of rawGreen.slice(0, 4)) {
    const cb = clampBox(g, 14 * scale, 48 * scale, 12 * scale, 34 * scale)
    if (placed.some((p) => overlap(p, cb, 1.5))) continue
    placed.push(cb)
    const isField = greenFeatures.length === 0
    greenFeatures.push({
      type: isField ? "field" : "garden",
      name: isField ? "Lapangan upacara" : greenFeatures.length === 1 ? "Kebun sekolah" : `Taman ${greenFeatures.length}`,
      coords: rectCoords(cb.x1, cb.y1, cb.x2, cb.y2),
    })
  }
  // Pastikan minimal ada 1 lapangan & 1 kebun bila gambar minim warna hijau
  if (greenFeatures.length === 0) {
    const fb: Box = { x1: -18 * scale, y1: -24 * scale, x2: 22 * scale, y2: 2 * scale, area: 1000, score: 1 }
    placed.push(fb)
    greenFeatures.push({ type: "field", name: "Lapangan upacara", coords: rectCoords(fb.x1, fb.y1, fb.x2, fb.y2) })
    const gb: Box = { x1: 30 * scale, y1: -26 * scale, x2: 52 * scale, y2: -8 * scale, area: 400, score: 1 }
    placed.push(gb)
    greenFeatures.push({ type: "garden", name: "Kebun sekolah", coords: rectCoords(gb.x1, gb.y1, gb.x2, gb.y2) })
  }

  // 2. Bangunan (Gedung sekolah)
  const rawBuildings = extractBoxes(1, 10)
  const buildingBoxes: Box[] = []
  for (const b of rawBuildings) {
    if (buildingBoxes.length >= 10) break
    const cb = clampBox(b, 10 * scale, 42 * scale, 8 * scale, 22 * scale)
    if (placed.some((p) => overlap(p, cb, 2))) continue
    placed.push(cb)
    buildingBoxes.push(cb)
  }
  // Bila gambar terlalu polos hingga < 3 gedung terdeteksi, lengkapi sayap gedung di sekitar lapangan
  const fallbackWings: [number, number, number, number][] = [
    [-48, 26, -8, 38], [4, 26, 44, 38], [-48, 4, -30, 20], [32, 4, 52, 22], [-52, -42, -34, -30], [38, -42, 52, -30],
  ]
  for (const [x1, y1, x2, y2] of fallbackWings) {
    if (buildingBoxes.length >= 5) break
    const cb: Box = { x1: x1 * scale, y1: y1 * scale, x2: x2 * scale, y2: y2 * scale, area: (x2 - x1) * (y2 - y1), score: 1 }
    if (placed.some((p) => overlap(p, cb, 2))) continue
    placed.push(cb)
    buildingBoxes.push(cb)
  }

  // Urutkan gedung dari Utara ke Selatan, Barat ke Timur agar penamaan konsisten
  buildingBoxes.sort((a, b) => b.y2 - a.y2 || a.x1 - b.x1)
  const buildingFeatures: SiteFeature[] = buildingBoxes.map((b, i) => ({
    type: "building",
    name: BUILDING_NAMES[i] ?? `Gedung ${i + 1}`,
    coords: rectCoords(b.x1, b.y1, b.x2, b.y2),
  }))

  // 3. Air / Kolam (bila terdeteksi pada gambar)
  const waterFeatures: SiteFeature[] = []
  for (const w of extractBoxes(3, 12).slice(0, 2)) {
    const cb = clampBox(w, 8 * scale, 24 * scale, 6 * scale, 16 * scale)
    if (placed.some((p) => overlap(p, cb, 1.5))) continue
    placed.push(cb)
    waterFeatures.push({ type: "water", name: waterFeatures.length === 0 ? "Kolam / Drainase" : "Tandon Air", coords: rectCoords(cb.x1, cb.y1, cb.x2, cb.y2) })
  }

  // 4. Area Parkir
  const rawParking = extractBoxes(4, 18)
  let parkingFeature: SiteFeature | null = null
  for (const p of rawParking) {
    const cb = clampBox(p, 12 * scale, 26 * scale, 10 * scale, 20 * scale)
    if (!placed.some((x) => overlap(x, cb, 1.5))) {
      placed.push(cb)
      parkingFeature = { type: "parking", name: "Parkir", coords: rectCoords(cb.x1, cb.y1, cb.x2, cb.y2) }
      break
    }
  }
  if (!parkingFeature) {
    const pb: Box = { x1: -54 * scale, y1: -26 * scale, x2: -32 * scale, y2: -8 * scale, area: 396, score: 1 }
    if (!placed.some((x) => overlap(x, pb, 1))) parkingFeature = { type: "parking", name: "Parkir", coords: rectCoords(pb.x1, pb.y1, pb.x2, pb.y2) }
  }

  // 5. Batas lahan, jalur sirkulasi, dan gerbang
  const allX = placed.flatMap((b) => [b.x1, b.x2]), allY = placed.flatMap((b) => [b.y1, b.y2])
  const minX = Math.min(-56 * scale, ...allX) - 6 * scale
  const maxX = Math.max(56 * scale, ...allX) + 6 * scale
  const minY = Math.min(-46 * scale, ...allY) - 6 * scale
  const maxY = Math.max(44 * scale, ...allY) + 6 * scale
  const gateX = 2 * scale

  const boundary: SiteFeature = {
    type: "boundary",
    name: "Batas lahan",
    coords: [
      toLatLng(opts.center, minX, minY),
      toLatLng(opts.center, maxX, minY),
      toLatLng(opts.center, maxX + 1.5 * scale, maxY),
      toLatLng(opts.center, minX + 1.5 * scale, maxY + 1.5 * scale),
    ],
  }
  const paths: SiteFeature[] = [
    { type: "path", coords: [toLatLng(opts.center, gateX, minY), toLatLng(opts.center, gateX, maxY * 0.55)] },
    { type: "path", coords: [toLatLng(opts.center, minX * 0.85, 3 * scale), toLatLng(opts.center, maxX * 0.88, 3 * scale)] },
  ]
  const gate: SiteFeature = { type: "gate", name: "Gerbang", coords: [toLatLng(opts.center, gateX, minY)] }

  const features: SiteFeature[] = [
    boundary,
    ...greenFeatures,
    ...(parkingFeature ? [parkingFeature] : []),
    ...waterFeatures,
    ...paths,
    ...buildingFeatures,
    gate,
  ]

  return {
    features,
    summary: { buildings: buildingFeatures.length, green: greenFeatures.length, water: waterFeatures.length, paths: paths.length, mode: "ai-vision" },
    dataUrl,
  }
}

/** Putar seluruh denah GIS (mis. 90° searah jarum jam) terhadap titik pusat. */
export function rotateFeatures(features: SiteFeature[], center: GisCenter, deg: number): SiteFeature[] {
  const rad = (deg * Math.PI) / 180
  const cos = Math.cos(rad), sin = Math.sin(rad)
  return features.map((f) => ({
    ...f,
    coords: f.coords.map(([la, ln]) => {
      const m = toMeters(center, la, ln)
      return toLatLng(center, m.x * cos + m.y * sin, -m.x * sin + m.y * cos)
    }),
  }))
}

/** Ubah skala denah GIS terhadap titik pusat. */
export function scaleFeatures(features: SiteFeature[], center: GisCenter, factor: number): SiteFeature[] {
  return features.map((f) => ({
    ...f,
    coords: f.coords.map(([la, ln]) => {
      const m = toMeters(center, la, ln)
      return toLatLng(center, m.x * factor, m.y * factor)
    }),
  }))
}

/** Denah GIS standar sekolah (untuk tombol Reset ke denah awal). */
export function defaultSiteFeatures(center: GisCenter, landM2 = 12000): SiteFeature[] {
  const k = Math.min(1.3, Math.max(0.8, Math.sqrt((landM2 || 12000) / 12000)))
  const ll = (x: number, y: number) => toLatLng(center, x * k, y * k)
  const rect = ([x1, y1, x2, y2]: [number, number, number, number]) => [ll(x1, y1), ll(x2, y1), ll(x2, y2), ll(x1, y2)]
  const buildings: [string, [number, number, number, number]][] = [
    ["Ruang Kelas A", [-50, 30, -10, 42]], ["Ruang Kelas B", [0, 30, 40, 42]], ["Kantor & TU", [-50, 8, -32, 22]], ["Perpustakaan", [-26, 8, -8, 20]],
    ["Aula", [8, 8, 30, 20]], ["Laboratorium", [40, 4, 56, 24]], ["Musala", [44, -46, 56, -34]], ["Kantin", [-56, -46, -40, -36]],
  ]
  const open: [SiteFeatureType, string, [number, number, number, number]][] = [
    ["field", "Lapangan upacara", [-20, -32, 26, -2]],
    ["garden", "Kebun sekolah", [32, -30, 56, -10]],
    ["parking", "Parkir", [-56, -28, -34, -8]],
  ]
  return [
    { type: "boundary", name: "Batas lahan", coords: [[-62, -52], [62, -52], [64, 50], [-60, 52]].map(([x, y]) => ll(x, y)) },
    ...open.map(([type, name, r]) => ({ type, name, coords: rect(r) })),
    { type: "path", coords: [ll(2, -52), ll(2, 28)] },
    { type: "path", coords: [ll(-52, 3), ll(58, 3)] },
    ...buildings.map(([name, r]) => ({ type: "building" as const, name, coords: rect(r) })),
    { type: "gate", name: "Gerbang", coords: [ll(2, -52)] },
  ]
}
