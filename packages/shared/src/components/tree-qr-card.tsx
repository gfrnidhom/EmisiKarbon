import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { QRCodeSVG } from "qrcode.react"
import { CloudRain, Droplets, Fuel, Leaf, Recycle, Snowflake, Sun, TreeDeciduous, Warehouse, type LucideIcon } from "lucide-react"
import { appUrl } from "@/lib/hosts"
import { fmtDate, num } from "@/lib/format"
import { tl } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/** Alamat profil publik aset — selalu di domain utama (dipindai siapa saja). */
export const treeQrUrl = (code: string, sig: string) => appUrl("web", `/p/${encodeURIComponent(code)}?s=${sig}`)
export const assetQrUrl = treeQrUrl

/** Tampilan per jenis aset: nama, deskripsi singkat, ikon, warna panel QR. */
export const ASSET_META: Record<string, { sid: string; sen: string; id: string; en: string; descId: string; descEn: string; icon: LucideIcon; from: string; to: string; chip: string; ink: string }> = {
  pohon: { sid: "Pohon", sen: "Tree", id: "Pohon", en: "Tree", descId: "Pohon sekolah yang diukur berkala untuk menghitung serapan karbon.", descEn: "A school tree measured regularly to estimate carbon uptake.", icon: TreeDeciduous, from: "#14724f", to: "#0b3d2b", chip: "#e3f3ea", ink: "#0b5e40" },
  biopori: { sid: "Biopori", sen: "Biopore", id: "Lubang Resapan Biopori", en: "Biopore infiltration hole", descId: "Lubang resapan berisi sampah organik: menyerap air hujan, mengurangi genangan, dan menghasilkan kompos.", descEn: "An infiltration hole filled with organic waste: absorbs rainwater, reduces puddles and makes compost.", icon: Droplets, from: "#0e7490", to: "#0c3b4a", chip: "#dff3f6", ink: "#0e6177" },
  atap: { sid: "Tangkapan Hujan", sen: "Rain harvest", id: "Atap Tangkapan Hujan", en: "Rainwater harvesting roof", descId: "Menampung air hujan dari atap untuk menyiram tanaman dan menghemat air bersih.", descEn: "Collects roof rainwater for watering plants and saving clean water.", icon: CloudRain, from: "#2563eb", to: "#1e3a6e", chip: "#e2ebfd", ink: "#1d4ed8" },
  komposter: { sid: "Komposter", sen: "Composter", id: "Komposter", en: "Composter", descId: "Mengolah sampah organik sekolah menjadi kompos — mengurangi sampah ke TPA dan emisi metana.", descEn: "Turns organic school waste into compost — less landfill waste and methane.", icon: Recycle, from: "#a16207", to: "#4a2f08", chip: "#fbf0d9", ink: "#8a5306" },
  bank_sampah: { sid: "Bank Sampah", sen: "Waste bank", id: "Bank Sampah", en: "Waste bank", descId: "Mengumpulkan sampah anorganik terpilah untuk didaur ulang.", descEn: "Collects sorted inorganic waste for recycling.", icon: Warehouse, from: "#4d7c0f", to: "#263f08", chip: "#ecf5dc", ink: "#3f6a0b" },
  panel: { sid: "Panel Surya", sen: "Solar panel", id: "Panel Surya (PLTS)", en: "Solar panel (PV)", descId: "Menghasilkan listrik bersih dari matahari dan mengurangi pemakaian listrik PLN.", descEn: "Generates clean electricity from the sun and cuts grid power use.", icon: Sun, from: "#d97706", to: "#7c3a06", chip: "#fdf0d7", ink: "#a85a05" },
  ac: { sid: "Unit AC", sen: "AC unit", id: "Unit AC", en: "Air conditioner", descId: "Dipantau untuk kebocoran refrigeran — gas pendingin termasuk gas rumah kaca kuat.", descEn: "Monitored for refrigerant leaks — cooling gases are potent greenhouse gases.", icon: Snowflake, from: "#4f46e5", to: "#26206b", chip: "#e8e7fc", ink: "#4338ca" },
  genset: { sid: "Genset", sen: "Generator", id: "Genset", en: "Generator", descId: "Mesin pembangkit cadangan berbahan bakar solar — pemakaiannya dicatat bulanan.", descEn: "Diesel backup generator — fuel use is logged monthly.", icon: Fuel, from: "#57534e", to: "#292524", chip: "#efedeb", ink: "#44403c" },
}

export type TreeCardData = {
  code: string; qr_sig: string; type?: string | null; name?: string | null; meta?: Record<string, any> | null; status?: string | null
  species_name?: string | null; species_scientific?: string | null; species_description?: string | null; created_at?: string | null; planted_at?: string | null
}
export type AssetCardData = TreeCardData

/** Ringkasan ukuran aset (non-pohon) dari meta. */
function specOf(a: AssetCardData) {
  const m = a.meta ?? {}
  const parts: string[] = []
  if (a.type === "biopori") { if (m.diameter_cm) parts.push(`Ø ${num(m.diameter_cm)} cm`); if (m.depth_cm) parts.push(`${tl("dalam", "depth")} ${num(m.depth_cm)} cm`) }
  if (a.type === "atap") { if (m.area_m2) parts.push(`${num(m.area_m2)} m²`); if (m.tank_l) parts.push(`${tl("tandon", "tank")} ${num(m.tank_l)} L`) }
  if (a.type === "komposter") { if (m.capacity_l) parts.push(`${num(m.capacity_l)} L`); if (m.kind) parts.push(String(m.kind)) }
  if (a.type === "panel") { if (m.kwp) parts.push(`${num(m.kwp, 1)} kWp`); if (m.inverter) parts.push(String(m.inverter)) }
  if (a.type === "ac") { if (m.gas) parts.push(String(m.gas)); if (m.charge_kg) parts.push(`${num(m.charge_kg, 2)} kg`); if (m.room) parts.push(String(m.room)) }
  if (a.type === "bank_sampah" && m.name) parts.push(String(m.name))
  return parts.join(" · ")
}

/** Kartu QR aset (90 × 55 mm): nama/jenis, keterangan, deskripsi singkat, ID unik, tanggal terdaftar, QR bertanda tangan.
 *  Satu kartu = satu aset: QR memuat ID unik aset itu + tanda tangan HMAC, jadi 50 pohon mahoni atau 45 biopori punya QR berbeda. */
export function AssetQrCard({ t, orgName, className }: { t: AssetCardData; orgName: string; className?: string }) {
  const type = t.type ?? "pohon"
  const M = ASSET_META[type] ?? ASSET_META.pohon
  const tree = type === "pohon"
  const fresh = t.status === "belum_dipasang"
  const registered = fresh ? "" : (t.created_at ?? t.planted_at ?? "").slice(0, 10)
  const title = tree ? (t.species_name || tl("Pohon", "Tree")) : (t.name || tl(M.sid, M.sen))
  const sub = tree ? (t.species_scientific && t.species_scientific !== "-" ? t.species_scientific : null) : (specOf(t) || (t.name ? tl(M.id, M.en) : null))
  const desc = tree
    ? (t.species_description || (fresh ? tl("Jenis pohon diisi saat pengukuran pertama. Pindai QR untuk melihat profil dan serapan karbonnya.", "Species is set at the first measurement. Scan the QR to see its profile and carbon uptake.") : tl(M.descId, M.descEn)))
    : tl(M.descId, M.descEn)
  return (
    <div className={cn("tree-card relative flex h-[55mm] w-[90mm] shrink-0 overflow-hidden rounded-[4mm] bg-white text-[#10201a] shadow-[0_12px_32px_-16px_rgba(6,40,26,0.45)] ring-1 ring-black/[0.06] [print-color-adjust:exact] [-webkit-print-color-adjust:exact]", className)}>
      {/* sisi kiri: identitas aset */}
      <div className="relative flex min-w-0 flex-1 flex-col p-[3.6mm] pr-[3mm]">
        <M.icon className="pointer-events-none absolute -right-[4mm] -bottom-[5mm] size-[24mm] opacity-[0.07]" style={{ color: M.from }} strokeWidth={1.4} />
        <div className="flex items-center gap-[1.6mm]">
          <span className="flex size-[5.2mm] items-center justify-center rounded-full bg-[#0f8a5f] text-white"><Leaf className="size-[3mm]" /></span>
          <div className="min-w-0 flex-1 leading-[1.15]">
            <div className="text-[6.5pt] font-semibold">Sekolah Lestari</div>
            <div className="truncate text-[5.5pt] text-[#5d6f66]">{orgName}</div>
          </div>
          {!tree && t.name && <span className="flex h-[4.4mm] shrink-0 items-center gap-[0.8mm] rounded-full px-[1.6mm] text-[5pt] font-semibold" style={{ background: M.chip, color: M.ink }}><M.icon className="size-[2.6mm]" />{tl(M.sid, M.sen)}</span>}
        </div>
        <div className="mt-[2.6mm] min-w-0">
          <div className="truncate text-[14pt] leading-[1.05] font-semibold tracking-tight">{title}</div>
          {sub && <div className={cn("mt-[0.6mm] truncate text-[6.5pt]", tree && "italic")} style={{ color: M.ink }}>{sub}</div>}
          <p className="mt-[1.4mm] line-clamp-3 text-[6pt] leading-[1.35] text-[#4b5d54]">{desc}</p>
        </div>
        <div className="relative mt-auto flex items-end gap-[2.4mm]">
          <div className="leading-tight">
            <div className="text-[5pt] font-medium tracking-[0.08em] text-[#7a8a82] uppercase">{tree ? tl("ID Pohon", "Tree ID") : tl("ID Aset", "Asset ID")}</div>
            <div className="mt-[0.5mm] rounded-full px-[2mm] py-[0.5mm] font-mono text-[7pt] font-semibold" style={{ background: M.chip, color: M.ink }}>{t.code}</div>
          </div>
          <div className="leading-tight">
            <div className="text-[5pt] font-medium tracking-[0.08em] text-[#7a8a82] uppercase">{tl("Terdaftar", "Registered")}</div>
            <div className="mt-[0.5mm] py-[0.5mm] text-[7pt] font-medium">{registered ? fmtDate(registered) : fresh ? tl("Belum dipasang", "Not installed") : "—"}</div>
          </div>
        </div>
      </div>
      {/* sisi kanan: QR */}
      <div className="relative flex w-[33mm] shrink-0 flex-col items-center justify-center gap-[1.6mm] overflow-hidden px-[2.5mm] text-white" style={{ background: `linear-gradient(135deg, ${M.from}, ${M.to})` }}>
        <span className="pointer-events-none absolute -top-[8mm] -right-[8mm] size-[22mm] rounded-full bg-white/10" />
        <span className="pointer-events-none absolute -bottom-[10mm] -left-[6mm] size-[20mm] rounded-full bg-white/[0.07]" />
        <div className="relative rounded-[2.4mm] bg-white p-[1.4mm] shadow-[0_6px_14px_-6px_rgba(0,0,0,0.5)]">
          <QRCodeSVG value={assetQrUrl(t.code, t.qr_sig)} size={256} level="M" fgColor="#0b2e22" className="block size-[24mm]" />
        </div>
        <div className="relative text-center text-[5.5pt] leading-[1.25] font-medium text-white/85">
          {tree ? <>{tl("Pindai untuk profil", "Scan for profile")}<br />{tl("& serapan karbon", "& carbon uptake")}</> : <>{tl("Pindai untuk", "Scan for")}<br />{tl("profil aset", "asset profile")}</>}
        </div>
      </div>
    </div>
  )
}
export const TreeQrCard = AssetQrCard

/** Cetak kartu langsung dari halaman (tanpa jendela baru): lembar A4 berisi 2 kartu per baris, siap gunting. */
export function useTreeCardPrint() {
  const [job, setJob] = useState<{ items: AssetCardData[]; orgName: string } | null>(null)
  useEffect(() => {
    if (!job) return
    const done = () => setJob(null)
    window.addEventListener("afterprint", done, { once: true })
    const id = setTimeout(() => window.print(), 150) // tunggu QR selesai digambar
    return () => { clearTimeout(id); window.removeEventListener("afterprint", done) }
  }, [job])
  const node = job ? createPortal(
    <div className="print-embed tree-card-sheet">
      <div className="grid grid-cols-2 justify-items-center gap-[5mm]">
        {job.items.map((t) => <AssetQrCard key={t.code} t={t} orgName={job.orgName} className="break-inside-avoid shadow-none ring-[0.3mm] ring-black/15" />)}
      </div>
    </div>,
    document.body,
  ) : null
  return { node, print: (items: AssetCardData[], orgName: string) => setJob({ items, orgName }) }
}
export const useAssetCardPrint = useTreeCardPrint
