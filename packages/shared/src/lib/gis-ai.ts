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

type Rect = { x1: number; y1: number; x2: number; y2: number } // sel grid, inklusif

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

type Region = { label: number; mean?: number[]; cells: number[]; box: Rect; edge: boolean; kind?: "building" | "white" | "veg" | "water" | "paved" | "solid"; name?: string }
export type GisProgress = (msg: string) => void

/** Kecocokan nama label denah → jenis objek GIS. */
function typeFromName(name: string): SiteFeatureType | null {
  const n = `${name.toLowerCase()} ${name.toLowerCase().replace(/\s+/g, "")}` // label terpotong baris: "GER BANG" → "gerbang"
  if (/\b(lapangan|halaman|taman|kebun|rumput|hutan)\b/.test(n)) return /taman|kebun|hutan/.test(n) ? "garden" : "field"
  if (/\b(parkir|paving|teras|selasar|koridor|jalan)\b/.test(n)) return "parking"
  if (/\b(kolam|tandon|sumur|empang)\b/.test(n)) return "water"
  if (/\b(gerbang|gate|pintu masuk)\b/.test(n)) return "gate"
  return null
}

/**
 * Vektorisasi lokal gambar denah / citra → `SiteFeature[]` (tanpa layanan luar kecuali OCR teks).
 * Mendukung: kotak berwarna (denah infografis), ruang bergaris (denah garis/arsitektur), arsiran, bingkai lahan.
 *  1. Piksel gelap = garis/dinding/teks (pembatas). Warna lain dikelompokkan (k-means) lalu dihaluskan
 *     (filter modus) agar arsiran tipis & anti-alias hilang.
 *  2. Area berwarna sama yang tersambung = satu objek; latar luar dibuang; area putih yang membungkus
 *     objek lain = batas lahan; area putih tertutup = ruang/gedung, yang besar & kosong = halaman.
 *  3. Warna → jenis: hijau = taman/lapangan, biru = air, kuning pekat/abu-abu = perkerasan, lainnya = gedung.
 *  4. OCR (tesseract.js, bahasa Indonesia) membaca label di dalam tiap objek → nama & jenis (mis. "Lapangan", "Parkir").
 *  5. Proporsi gambar dipertahankan; skala meter dari luas lahan sekolah. Tidak ada objek karangan.
 */
export async function analyzeImageToGis(dataUrl: string, opts: { center: GisCenter; landM2?: number; onProgress?: GisProgress; ocr?: boolean }): Promise<GisAiResult> {
  const say = opts.onProgress ?? (() => {})
  say("Membaca gambar…")
  const img = await loadImage(dataUrl)
  say("Mendeteksi ruang & area…")
  const iw = img.naturalWidth || img.width || 800, ih = img.naturalHeight || img.height || 600
  const k = Math.min(1.5, 640 / Math.max(iw, ih))
  const W = Math.max(64, Math.round(iw * k)), H = Math.max(64, Math.round(ih * k))
  const canvas = document.createElement("canvas")
  canvas.width = W; canvas.height = H
  const cx = canvas.getContext("2d", { willReadFrequently: true })!
  cx.fillStyle = "#fff"; cx.fillRect(0, 0, W, H)
  cx.drawImage(img, 0, 0, W, H)
  const px = cx.getImageData(0, 0, W, H).data
  const N = W * H
  const at = (x: number, y: number) => y * W + x
  // 1) warna latar = warna terbanyak di tepi gambar (bukan rata-rata: garis & jalan di tepi tidak ikut)
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>()
  const tallyBorder = (x: number, y: number) => { const i = at(x, y) * 4; const key = ((px[i] >> 4) << 8) | ((px[i + 1] >> 4) << 4) | (px[i + 2] >> 4); const e = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }; e.n++; e.r += px[i]; e.g += px[i + 1]; e.b += px[i + 2]; bins.set(key, e) }
  for (let x = 0; x < W; x++) for (const y of [0, 1, 2, H - 3, H - 2, H - 1]) tallyBorder(x, y)
  for (let y = 0; y < H; y++) for (const x of [0, 1, 2, W - 3, W - 2, W - 1]) tallyBorder(x, y)
  const topBin = [...bins.values()].sort((u, v) => v.n - u.n)[0]
  const bgC = [topBin.r / topBin.n, topBin.g / topBin.n, topBin.b / topBin.n]
  const bgHsv = rgbToHsv(bgC[0], bgC[1], bgC[2])
  const bgLight = bgHsv.v > 0.7 && bgHsv.s < 0.25
  // 2) pembatas: garis/dinding gelap (garis tipis yang memudar saat diperkecil tetap dihitung)
  const darkV = bgLight ? Math.min(0.62, bgHsv.v - 0.3) : 0.3
  const dark = new Uint8Array(N)
  for (let p = 0; p < N; p++) {
    const { s, v } = rgbToHsv(px[p * 4], px[p * 4 + 1], px[p * 4 + 2])
    if (v < darkV && s < 0.4) dark[p] = 1
  }
  for (let x = 0; x < W; x++) { dark[x] = 1; dark[at(x, H - 1)] = 1 } // bingkai buatan: ruang terpotong tepi tetap tertutup
  for (let y = 0; y < H; y++) { dark[at(0, y)] = 1; dark[at(W - 1, y)] = 1 }

  // 3) penghalusan median 3×3 (hanya piksel bukan pembatas): arsiran tipis, tepi anti-alias, derau JPEG hilang
  const col = new Float32Array(N * 3)
  for (let p = 0; p < N; p++) { col[p * 3] = px[p * 4]; col[p * 3 + 1] = px[p * 4 + 1]; col[p * 3 + 2] = px[p * 4 + 2] }
  const buf: number[][] = [[], [], []]
  for (let pass = 0; pass < 2; pass++) {
    const next = col.slice()
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const p = at(x, y)
      if (dark[p]) continue
      buf[0].length = buf[1].length = buf[2].length = 0
      for (const q of [p - W - 1, p - W, p - W + 1, p - 1, p, p + 1, p + W - 1, p + W, p + W + 1]) if (!dark[q]) for (let c = 0; c < 3; c++) buf[c].push(col[q * 3 + c])
      const m = buf[0].length >> 1
      for (let c = 0; c < 3; c++) next[p * 3 + c] = buf[c].sort((u, v) => u - v)[m]
    }
    col.set(next)
  }

  // 4) region growing: piksel bergabung bila warnanya dekat rata-rata area
  say("Mendeteksi ruang & area…")
  const T2 = 17 * 17
  const seen = new Uint8Array(N)
  const regions: Region[] = []
  for (let p0 = 0; p0 < N; p0++) {
    if (dark[p0] || seen[p0]) continue
    const stack = [p0], cells: number[] = []
    seen[p0] = 1
    let mr = col[p0 * 3], mg = col[p0 * 3 + 1], mb = col[p0 * 3 + 2]
    let x1 = W, y1 = H, x2 = 0, y2 = 0, edge = false
    while (stack.length) {
      const p = stack.pop()!, x = p % W, y = (p / W) | 0
      cells.push(p)
      const n = cells.length
      mr += (col[p * 3] - mr) / n; mg += (col[p * 3 + 1] - mg) / n; mb += (col[p * 3 + 2] - mb) / n
      if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y
      if (x <= 1 || y <= 1 || x >= W - 2 || y >= H - 2) edge = true
      for (const q of [p - 1, p + 1, p - W, p + W]) {
        if (dark[q] || seen[q]) continue
        const dr = col[q * 3] - mr, dg = col[q * 3 + 1] - mg, db = col[q * 3 + 2] - mb
        if (dr * dr + dg * dg + db * db < T2) { seen[q] = 1; stack.push(q) }
      }
    }
    const isBg = (mr - bgC[0]) ** 2 + (mg - bgC[1]) ** 2 + (mb - bgC[2]) ** 2 < T2
    regions.push({ label: isBg ? 0 : 1, mean: [mr, mg, mb], cells, box: { x1, y1, x2, y2 }, edge })
  }
  // area terbesar (> 25% gambar) = latar, apa pun warnanya (mis. latar abu-abu muda di dalam bingkai jalan)
  const biggest = regions.reduce((m, r) => (r.cells.length > (m?.cells.length ?? 0) ? r : m), regions[0])
  if (biggest && biggest.cells.length > N * 0.25) biggest.label = 0
  // blok terisi gelap (gedung diarsir hitam/abu tua): pembatas yang tetap ada setelah "opening" radius 2
  const erode = (m: Uint8Array) => { const o = new Uint8Array(N); for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const p = at(x, y); o[p] = m[p] & m[p - 1] & m[p + 1] & m[p - W] & m[p + W] }; return o }
  const dilate = (m: Uint8Array) => { const o = new Uint8Array(N); for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const p = at(x, y); o[p] = m[p] | m[p - 1] | m[p + 1] | m[p - W] | m[p + W] }; return o }
  const solid = dilate(dilate(erode(erode(dark))))
  const seen2 = new Uint8Array(N)
  for (let p0 = 0; p0 < N; p0++) {
    if (!solid[p0] || seen2[p0]) continue
    const stack = [p0], cells: number[] = []
    seen2[p0] = 1
    let x1 = W, y1 = H, x2 = 0, y2 = 0
    while (stack.length) { const p = stack.pop()!, x = p % W, y = (p / W) | 0; cells.push(p); if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y; for (const q of [p - 1, p + 1, p - W, p + W]) if (solid[q] && !seen2[q]) { seen2[q] = 1; stack.push(q) } }
    regions.push({ label: -1, cells, box: { x1, y1, x2, y2 }, edge: false, kind: "solid" })
  }

  // 5) latar luar & penyaringan (label 0 = sewarna latar)
  const bgLabel = 0
  const bwOf = (r: Region) => r.box.x2 - r.box.x1 + 1, bhOf = (r: Region) => r.box.y2 - r.box.y1 + 1
  const maxOuter = Math.max(0, ...regions.filter((r) => r.edge && r.label === bgLabel).map((r) => r.cells.length))
  const minCells = Math.max(60, Math.round(N * 0.0018))
  const cand = regions.filter((r) => {
    if (r.cells.length < minCells) return false
    if (r.label === bgLabel && r.edge && r.cells.length >= maxOuter * 0.4) return false // latar luar
    if (r.edge && Math.max(bwOf(r), bhOf(r)) / Math.min(bwOf(r), bhOf(r)) > 4) return false // jalan di tepi
    if (bwOf(r) * bhOf(r) > N * 0.85) return false
    if (r.kind !== "solid" && r.label !== bgLabel && r.cells.length < N * 0.01 && r.cells.length / (bwOf(r) * bhOf(r)) < 0.3) return false // cincin/halo tipis
    if (Math.min(bwOf(r), bhOf(r)) < Math.max(4, Math.max(W, H) * 0.008)) return false // garis/strip tipis
    return true
  })
  for (const r of cand) {
    if (r.kind === "solid") continue
    const [R, G, B] = r.mean!
    const { h, s, v } = rgbToHsv(R, G, B)
    r.kind = r.label === bgLabel ? "white"
      : h >= 175 && h <= 250 && s > 0.2 ? "water"
      : h >= 70 && h <= 170 && s >= 0.25 ? "veg"
      : (h >= 45 && h < 68 && s >= 0.32 && v > 0.7) || (s < 0.1 && v > 0.45 && v < 0.88) ? "paved"
      : "building"
  }
  const inside = (o: Region, r: Region) => { const ox = (o.box.x1 + o.box.x2) / 2, oy = (o.box.y1 + o.box.y2) / 2; return o !== r && ox > r.box.x1 && ox < r.box.x2 && oy > r.box.y1 && oy < r.box.y2 }
  // area putih/latar yang membungkus ≥ 2 objek lain = halaman dalam batas lahan (bukan objek)
  const sites = cand.filter((r) => r.kind === "white" && cand.filter((o) => inside(o, r) && o.cells.length < r.cells.length).length >= 2)
  let objs = cand.filter((r) => !sites.includes(r) && !(r.kind === "white" && r.cells.length / (bwOf(r) * bhOf(r)) < 0.35))
  // objek yang terlalu besar dibanding yang lain dan bukan putih (mis. latar berwarna) dibuang
  if (!objs.length) throw new Error("Tidak ada ruang, gedung, atau area yang terdeteksi. Pakai gambar denah yang lebih jelas (garis/kotak kontras) atau isi Kunci API Gemini di Konfigurasi.")

  // 6) nama dari OCR per objek: potong area tiap ruang dari gambar asli, perbesar, baca sebagai satu blok teks
  if (opts.ocr !== false && objs.length) {
    try {
      say("Membaca nama ruang (OCR)…")
      const T: any = await import("tesseract.js")
      const worker = await T.createWorker("ind")
      await worker.setParameters({ tessedit_pageseg_mode: "6" })
      const crop = document.createElement("canvas")
      const read = async (r: Region, rotate: boolean) => {
        const ox = Math.max(0, r.box.x1 / k + 1), oy = Math.max(0, r.box.y1 / k + 1)
        const ow = Math.max(4, (r.box.x2 - r.box.x1 + 1) / k - 2), oh = Math.max(4, (r.box.y2 - r.box.y1 + 1) / k - 2)
        const u = Math.max(1, Math.min(4, 900 / Math.max(ow, oh)))
        const cw = Math.round(ow * u), ch = Math.round(oh * u)
        crop.width = rotate ? ch : cw; crop.height = rotate ? cw : ch
        const g = crop.getContext("2d")!
        g.fillStyle = "#fff"; g.fillRect(0, 0, crop.width, crop.height)
        g.save()
        if (rotate) { g.translate(ch, 0); g.rotate(Math.PI / 2) }
        g.imageSmoothingQuality = "high"
        g.drawImage(img, ox, oy, ow, oh, 0, 0, cw, ch)
        g.restore()
        const { data } = await worker.recognize(crop)
        const ws = ((data?.words ?? []) as any[])
          .map((w) => ({ t: String(w.text ?? "").replace(/[^\p{L}\p{N}/&.\-]/gu, ""), c: Number(w.confidence) || 0 }))
          .filter((w) => w.t && w.c >= 55 && (/[\p{L}]{2}/u.test(w.t) || /^\d{1,3}$|^[IVX]+(-?[A-Z])?$/i.test(w.t)))
        const text = ws.map((w) => w.t).join(" ").replace(/\s+/g, " ").trim().slice(0, 48)
        const score = ws.reduce((sum, w) => sum + w.c * w.t.length, 0)
        return { text, score }
      }
      const targets = [...objs].sort((a, b) => b.cells.length - a.cells.length).slice(0, 60)
      let i = 0
      for (const r of targets) {
        say(`Membaca nama ruang (OCR) ${++i}/${targets.length}…`)
        let best = await read(r, false)
        // ruang tinggi-sempit sering berlabel tegak → coba diputar
        if (bhOf(r) > bwOf(r) * 1.4 && best.score < 400) { const alt = await read(r, true); if (alt.score > best.score) best = alt }
        const clean = best.text.replace(/^(\d\s+)+(?=\p{L})/u, "").trim() // titik/ikon kecil terbaca sebagai angka di depan
        if (clean && /[\p{L}]{2}/u.test(clean)) r.name = clean
      }
      await worker.terminate()
    } catch { /* OCR opsional (mis. luring) — nama otomatis dipakai */ }
  }
  // putih tertutup & besar tanpa nama gedung = halaman
  const contentArea = (() => { const xs = [...objs, ...sites]; return Math.max(1, (Math.max(...xs.map((r) => r.box.x2)) - Math.min(...xs.map((r) => r.box.x1))) * (Math.max(...xs.map((r) => r.box.y2)) - Math.min(...xs.map((r) => r.box.y1)))) })()
  objs = objs.filter((r) => r.cells.length >= minCells * 1.5 || r.name)

  // 7) skala & proyeksi
  const site = sites.sort((a, b) => b.cells.length - a.cells.length)[0]
  const all = [...objs, ...(site ? [site] : [])]
  const bx1 = Math.min(...all.map((r) => r.box.x1)), by1 = Math.min(...all.map((r) => r.box.y1))
  const bx2 = Math.max(...all.map((r) => r.box.x2)) + 1, by2 = Math.max(...all.map((r) => r.box.y2)) + 1
  const mPerCell = Math.min(5, Math.max(0.02, Math.sqrt((opts.landM2 || 12000) / Math.max(1, (bx2 - bx1) * (by2 - by1)))))
  const mx = (bx1 + bx2) / 2, my = (by1 + by2) / 2
  const ll = (gx: number, gy: number) => toLatLng(opts.center, (gx - mx) * mPerCell, (my - gy) * mPerCell)
  const poly = (r: Rect): [number, number][] => [ll(r.x1, r.y2 + 1), ll(r.x2 + 1, r.y2 + 1), ll(r.x2 + 1, r.y1), ll(r.x1, r.y1)]
  const rectsOf = (r: Region): Rect[] => {
    let holes = 0
    for (let y = r.box.y1; y <= r.box.y2; y++) for (let x = r.box.x1; x <= r.box.x2; x++) if (dark[at(x, y)]) holes++
    if ((r.cells.length + holes) / (bwOf(r) * bhOf(r)) >= 0.6) return [r.box]
    return toRectsOf(r.cells, r.box, W)
  }

  const counters: Record<string, number> = {}
  const used = new Set(objs.map((r) => r.name).filter(Boolean))
  const autoName = (t: SiteFeatureType): string => {
    counters[t] = (counters[t] ?? 0) + 1
    const n = counters[t]
    const nm = t === "field" ? (n === 1 ? "Lapangan / halaman" : `Halaman ${n}`) : t === "garden" ? `Taman ${n}` : t === "water" ? (n === 1 ? "Kolam / air" : `Air ${n}`) : t === "parking" ? (n === 1 ? "Perkerasan / parkir" : `Perkerasan ${n}`) : `Gedung ${n}`
    return used.has(nm) ? autoName(t) : nm
  }
  const features: SiteFeature[] = []
  const ordered = [...objs].sort((a, b) => a.box.y1 - b.box.y1 || a.box.x1 - b.box.x1)
  for (const r of ordered) {
    let type: SiteFeatureType = r.kind === "veg" ? "garden" : r.kind === "water" ? "water" : r.kind === "paved" ? "parking" : "building"
    if (r.kind === "white" && r.cells.length > contentArea * 0.06 && !r.name) type = "field"
    if (r.kind === "veg" && r.cells.length > contentArea * 0.08) type = "field"
    const byName = r.name ? typeFromName(r.name) : null
    if (byName) type = byName
    const name = r.name || autoName(type)
    if (type === "gate") { features.push({ type, name, coords: [ll((r.box.x1 + r.box.x2) / 2, (r.box.y1 + r.box.y2) / 2)] }); continue }
    for (const rc of rectsOf(r)) features.push({ type, name, coords: poly(rc) })
  }
  const boundary: SiteFeature = { type: "boundary", name: "Batas lahan", coords: poly({ x1: bx1, y1: by1, x2: bx2 - 1, y2: by2 - 1 }) }
  const order: SiteFeatureType[] = ["field", "garden", "parking", "water", "building", "gate"]
  features.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))
  return {
    features: [boundary, ...features],
    summary: { buildings: features.filter((f) => f.type === "building").length, green: features.filter((f) => f.type === "field" || f.type === "garden").length, water: features.filter((f) => f.type === "water").length, paths: 0, mode: "ai-vision" },
    dataUrl,
  }
}

/** Pecah bentuk L/U menjadi beberapa persegi (gabungan baris dengan rentang sama). */
function toRectsOf(cells: number[], box: Rect, W: number): Rect[] {
  const bw = box.x2 - box.x1 + 1, bh = box.y2 - box.y1 + 1
  const grid = new Uint8Array(bw * bh)
  for (const p of cells) grid[(((p / W) | 0) - box.y1) * bw + (p % W) - box.x1] = 1
  const rects: Rect[] = []
  let open: Rect[] = []
  for (let y = 0; y < bh; y++) {
    const runs: [number, number][] = []
    for (let x = 0; x < bw; x++) if (grid[y * bw + x]) { const s0 = x; while (x + 1 < bw && grid[y * bw + x + 1]) x++; runs.push([s0, x]) }
    const next: Rect[] = []
    for (const [a, b] of runs) {
      const i = open.findIndex((r) => Math.abs(r.x1 - (a + box.x1)) <= 2 && Math.abs(r.x2 - (b + box.x1)) <= 2)
      if (i >= 0) { const r = open.splice(i, 1)[0]; r.y2 = y + box.y1; next.push(r) }
      else next.push({ x1: a + box.x1, x2: b + box.x1, y1: y + box.y1, y2: y + box.y1 })
    }
    rects.push(...open); open = next
  }
  rects.push(...open)
  const big = rects.filter((r) => (r.x2 - r.x1 + 1) * (r.y2 - r.y1 + 1) >= Math.max(12, cells.length * 0.08))
  return big.length && big.length <= 6 ? big : [box]
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
