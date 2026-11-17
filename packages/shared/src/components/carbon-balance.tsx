import { useMemo, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { ChevronDown, ClipboardCopy, Sparkles } from "lucide-react"
import { Delta, StatTile } from "@/components/dash-kit"
import { CountUp } from "@/components/interactive-charts"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { num, SOURCES } from "@/lib/format"
import { tl } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/**
 * Neraca karbon sederhana (emisi vs imbal jasa pohon).
 * Asumsi baku: 1 pohon dewasa menyerap ±22 kg CO₂/tahun (rujukan umum EEA / Arbor Day; rentang 10–40 kg tergantung jenis & umur).
 * Bila buku engine punya angka serapan terukur (model riap per pohon), angka itu yang dipakai untuk "sudah diserap".
 */
export const TREE_KG_PER_YEAR = 22

export type BalanceInput = {
  emissionKg: number
  days: number
  treeCount: number
  /** serapan terukur dari buku engine untuk periode yang sama (kg CO₂); null → pakai asumsi baku */
  absorbedKg?: number | null
  bySource?: Record<string, number>
}

export function carbonBalance({ emissionKg, days, treeCount, absorbedKg, bySource }: BalanceInput) {
  const d = Math.max(1, days)
  const perTreePeriod = (TREE_KG_PER_YEAR * d) / 365
  const absorbedAssumed = treeCount * perTreePeriod
  const measured = absorbedKg !== null && absorbedKg !== undefined && absorbedKg > 0
  const absorbed = measured ? absorbedKg! : absorbedAssumed
  // pohon yang dibutuhkan agar serapan periode yang sama = emisi periode itu (laju berkelanjutan)
  const needTrees = emissionKg > 0 ? Math.ceil(emissionKg / perTreePeriod) : 0
  // pohon yang dibutuhkan untuk menebus emisi periode ini dalam 1 tahun
  const needTreesYear = emissionKg > 0 ? Math.ceil(emissionKg / TREE_KG_PER_YEAR) : 0
  const balance = absorbed - emissionKg // < 0 = utang karbon
  const offsetShare = emissionKg > 0 ? absorbed / emissionKg : 0
  const treeGap = Math.max(0, needTrees - treeCount)
  const sources = Object.entries(bySource ?? {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  return { days: d, perTreePeriod, absorbed, measured, absorbedAssumed, needTrees, needTreesYear, balance, offsetShare, treeGap, sources, emissionKg, treeCount }
}
export type Balance = ReturnType<typeof carbonBalance>

const fmtKg = (v: number) => (Math.abs(v) >= 1000 ? `${num(v / 1000, 2)} t` : `${num(v, Math.abs(v) < 10 ? 2 : 0)} kg`)

/* ---------------- template prompt ---------------- */

export function promptBlank() {
  return `Bertindaklah sebagai ahli akuntansi karbon, lingkungan, dan mitigasi perubahan iklim. Analisis data aktivitas saya di bawah ini dan berikan laporan lengkap dalam 4 poin utama, ditambah rekomendasi.

Data Aktivitas Saya:
- Periode: [Harian / Bulanan - sebutkan bulannya jika ada]
- Penggunaan Energi/BBM/Transportasi: [Contoh: Penggunaan listrik X kWh, kendaraan bermotor Y km/hari, LPG Z kg, sampah W kg, dll.]
- Jumlah pohon yang sudah ditanam saat ini (Imbal Jasa): [Masukkan angka pohon eksisting, atau tulis 'Belum ada']

Tolong hitungkan dan tampilkan dalam format berikut:
1. Rekap Emisi Karbon: Total emisi yang dihasilkan dalam satuan kg atau ton CO₂eq untuk periode tersebut (sebutkan faktor emisi yang dipakai).
2. Konversi ke Jumlah Pohon (Imbal Jasa): Berapa jumlah pohon yang harus ditanam untuk mengimbangi (offset) emisi tersebut? (Sebutkan asumsi penyerapan karbon per pohon per tahun yang Anda gunakan).
3. Emisi yang Sudah Diserap: Berdasarkan jumlah pohon yang sudah ditanam, berapa estimasi total emisi yang saat ini sudah berhasil diserap?
4. Defisit / Utang Karbon: Selisih antara emisi yang dihasilkan dan emisi yang sudah diserap (apakah masih defisit/utang karbon, atau sudah surplus)?
5. Rekomendasi: 3–5 langkah paling berdampak untuk menurunkan emisi dan menutup utang karbon, urut dari yang termudah.

Sajikan hasil analisis ini dalam bentuk tabel ringkas dan penjelasan singkat yang mudah dipahami.`
}

export function promptFilled(b: Balance, ctx: { org?: string; periodLabel: string }) {
  const src = b.sources.length
    ? b.sources.map(([k, v]) => `  • ${SOURCES[k]?.label ?? k}: ${num(v, 1)} kg CO₂e`).join("\n")
    : "  • [Isi penggunaan listrik (kWh), BBM (liter), kendaraan (km/hari), LPG (kg), sampah (kg)]"
  return `Bertindaklah sebagai ahli akuntansi karbon, lingkungan, dan mitigasi perubahan iklim. Analisis data aktivitas saya di bawah ini dan berikan laporan lengkap dalam 4 poin utama, ditambah rekomendasi.

Data Aktivitas Saya${ctx.org ? ` (${ctx.org})` : ""}:
- Periode: ${ctx.periodLabel} (${b.days} hari)
- Penggunaan Energi/BBM/Transportasi (sudah dikonversi aplikasi ke emisi, faktor emisi nasional):
${src}
  Total: ${num(b.emissionKg, 1)} kg CO₂e
- Jumlah pohon yang sudah ditanam saat ini (Imbal Jasa): ${b.treeCount > 0 ? `${num(b.treeCount)} pohon` : "Belum ada"}${b.measured ? `\n- Serapan pohon terukur periode ini (model riap aplikasi): ${num(b.absorbed, 1)} kg CO₂` : ""}

Tolong hitungkan dan tampilkan dalam format berikut:
1. Rekap Emisi Karbon: Total emisi yang dihasilkan dalam satuan kg atau ton CO₂eq untuk periode tersebut.
2. Konversi ke Jumlah Pohon (Imbal Jasa): Berapa jumlah pohon yang harus ditanam untuk mengimbangi (offset) emisi tersebut? (Sebutkan asumsi penyerapan karbon per pohon per tahun yang Anda gunakan; sebagai pembanding aplikasi memakai ${TREE_KG_PER_YEAR} kg CO₂/pohon/tahun).
3. Emisi yang Sudah Diserap: Berdasarkan jumlah pohon yang sudah ditanam, berapa estimasi total emisi yang saat ini sudah berhasil diserap?
4. Defisit / Utang Karbon: Selisih antara emisi yang dihasilkan dan emisi yang sudah diserap (apakah masih defisit/utang karbon, atau sudah surplus)?
5. Rekomendasi: 3–5 langkah paling berdampak untuk menurunkan emisi dan menutup utang karbon, disesuaikan dengan sumber emisi terbesar di atas.

Sajikan hasil analisis ini dalam bentuk tabel ringkas dan penjelasan singkat yang mudah dipahami.`
}

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); toast.success(tl("Prompt disalin — tempel ke ChatGPT / Gemini", "Prompt copied — paste into ChatGPT / Gemini")) }
  catch { toast.error(tl("Gagal menyalin, salin manual dari kotak teks", "Copy failed, copy manually from the text box")) }
}

export function PromptTemplateDialog({ open, onOpenChange, balance, org, periodLabel }: { open: boolean; onOpenChange: (o: boolean) => void; balance: Balance; org?: string; periodLabel: string }) {
  const filled = useMemo(() => promptFilled(balance, { org, periodLabel }), [balance, org, periodLabel])
  const [tab, setTab] = useState("filled")
  const [text, setText] = useState<Record<string, string>>({})
  const value = text[tab] ?? (tab === "filled" ? filled : promptBlank())
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setText({}) }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="size-4 text-primary" />{tl("Template Prompt Analisis Karbon", "Carbon Analysis Prompt Template")}</DialogTitle>
          <DialogDescription>{tl("Salin lalu tempel ke asisten AI (ChatGPT, Gemini, dll.) untuk laporan naratif. Versi terisi sudah memuat data periode ini; teks bisa diedit dulu.", "Copy and paste into an AI assistant (ChatGPT, Gemini, etc.) for a narrative report. The filled version already contains this period's data; you can edit it first.")}</DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
          <TabsList>
            <TabsTrigger value="filled">{tl("Terisi data saya", "Filled with my data")}</TabsTrigger>
            <TabsTrigger value="blank">{tl("Template kosong", "Blank template")}</TabsTrigger>
          </TabsList>
          <TabsContent value={tab} className="mt-3">
            <Textarea value={value} onChange={(e) => setText({ ...text, [tab]: e.target.value })} className="h-80 font-mono text-xs leading-relaxed" />
          </TabsContent>
        </Tabs>
        <DialogFooter>
          {text[tab] !== undefined && <Button variant="ghost" onClick={() => setText({ ...text, [tab]: undefined as any })}>{tl("Kembalikan", "Reset")}</Button>}
          <Button onClick={() => copy(value)}><ClipboardCopy /> {tl("Salin prompt", "Copy prompt")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ---------------- statistik neraca ---------------- */

const big = (v: number) => (Math.abs(v) >= 1000 ? { v: num(Math.abs(v) / 1000, 2), u: "t" } : { v: num(Math.abs(v), Math.abs(v) < 10 ? 2 : 0), u: "kg" })

/** 4 statistik neraca karbon: rekap emisi · pohon dibutuhkan · sudah diserap · defisit/surplus — plus rekomendasi & template prompt AI. */
export function CarbonBalanceStats({ input, periodLabel, org, onEmission, onTrees, header, loading }: { input: BalanceInput; periodLabel: string; org?: string; onEmission?: () => void; onTrees?: () => void; header?: ReactNode; loading?: boolean }) {
  const key = JSON.stringify(input)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const b = useMemo(() => carbonBalance(input), [key])
  const deficit = b.balance < 0
  const em = big(b.emissionKg), ab = big(b.absorbed), bal = big(b.balance)
  const foot = (s: ReactNode, cls = "text-muted-foreground") => <span className={cn("text-[0.8125rem]", cls)}>{s}</span>
  return (
    <div className="space-y-3">
      {header && <div className="flex flex-col gap-3 pt-1 lg:flex-row lg:items-end lg:justify-between">{header}</div>}
      <div className={cn("grid gap-5 transition-opacity sm:grid-cols-2 xl:grid-cols-4", loading && "opacity-60")}>
        <StatTile title={tl("Rekap emisi karbon", "Carbon emissions")} unit={`${em.u} CO₂e`} onClick={onEmission}
          value={<CountUp value={Number(em.u === "t" ? b.emissionKg / 1000 : b.emissionKg)} format={(v) => num(v, em.u === "t" ? 2 : 0)} />}
          foot={foot(tl(`${periodLabel} · ${b.days} hari · ${fmtKg(b.emissionKg / b.days)}/hari`, `${periodLabel} · ${b.days} days · ${fmtKg(b.emissionKg / b.days)}/day`))} />
        <StatTile title={tl("Pohon dibutuhkan", "Trees needed")} unit={tl("pohon", "trees")} onClick={onTrees}
          value={<CountUp value={b.needTrees} format={(v) => num(v, 0)} />}
          foot={foot(tl(`untuk offset · asumsi ${TREE_KG_PER_YEAR} kg CO₂/pohon/tahun`, `to offset · assumes ${TREE_KG_PER_YEAR} kg CO₂/tree/yr`))} />
        <StatTile title={tl("Emisi sudah diserap", "Already absorbed")} unit={`${ab.u} CO₂`} onClick={onTrees}
          value={<CountUp value={ab.u === "t" ? b.absorbed / 1000 : b.absorbed} format={(v) => num(v, ab.u === "t" ? 2 : b.absorbed < 10 ? 2 : 0)} />}
          foot={b.treeCount > 0 ? <Delta value={`+${num(Math.min(b.offsetShare, 9.99) * 100, 1)}%`} good text={tl(`${num(b.treeCount)} pohon ${b.measured ? "· terukur" : "· asumsi"}`, `${num(b.treeCount)} trees ${b.measured ? "· measured" : "· assumed"}`)} /> : foot(tl("Belum ada pohon tercatat", "No trees recorded yet"))} />
        <StatTile featured title={deficit ? tl("Defisit / utang karbon", "Carbon deficit") : tl("Surplus karbon", "Carbon surplus")} unit={`${bal.u} CO₂e`}
          value={<span>{deficit ? "−" : "+"}<CountUp value={bal.u === "t" ? Math.abs(b.balance) / 1000 : Math.abs(b.balance)} format={(v) => num(v, bal.u === "t" ? 2 : 0)} /></span>}
          foot={foot(deficit ? tl(`kurang ±${num(b.treeGap)} pohon · serapan menutup ${num(b.offsetShare * 100, 1)}%`, `about ${num(b.treeGap)} trees short · uptake covers ${num(b.offsetShare * 100, 1)}%`) : tl("serapan pohon melampaui emisi", "tree uptake exceeds emissions"), "text-white/80")} />
      </div>
      <InsightBar balance={b} org={org} periodLabel={periodLabel} />
    </div>
  )
}

/** Baris ringkas: kalimat tambahan (opsional) + tombol template prompt AI. */
export function InsightBar({ balance: b, org, periodLabel, lead }: { balance: Balance; org?: string; periodLabel: string; lead?: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={cn("flex flex-wrap items-center gap-2", lead ? "rounded-2xl bg-card px-5 py-3 ring-1 ring-border" : "justify-end")}>
      {lead && <div className="min-w-0 flex-1 text-sm text-muted-foreground">{lead}</div>}
      <Button size="sm" variant="outline" className="border-primary text-primary hover:text-primary" onClick={() => setOpen(true)}><Sparkles /> {tl("Template prompt AI", "AI prompt template")}</Button>
      <PromptTemplateDialog open={open} onOpenChange={setOpen} balance={b} org={org} periodLabel={periodLabel} />
    </div>
  )
}

/** Bagian lipat untuk analisis lanjutan — dasbor tetap ringkas, detail tersedia saat dibutuhkan. */
export function MoreSection({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="space-y-5 pt-2">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-3 rounded-2xl bg-card px-5 py-4 text-left ring-1 ring-border transition-colors hover:bg-muted/40">
        <span className="text-lg font-semibold tracking-tight">{title}</span>
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">{open ? tl("Sembunyikan", "Hide") : tl("Tampilkan", "Show")}<ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} /></span>
      </button>
      {open && children}
    </section>
  )
}
