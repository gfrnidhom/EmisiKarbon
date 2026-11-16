import { useEffect, type ReactNode } from "react"
import { canonicalUuidPath } from "@/lib/utils"
import { Link, useNavigate, useParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { QRCodeSVG } from "qrcode.react"
import { toast } from "sonner"
import * as XLSX from "xlsx"
import { ArrowLeft, FileSpreadsheet, Printer, RefreshCcw, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ErrorState, PageSkeleton, StatusBadge } from "@/components/common"
import { api } from "@/lib/api"
import { fmtDate, fmtDateTime, fmtMonth, groupByScope, num, pct, SCOPE_INFO, signedPct, SOURCES } from "@/lib/format"
import { t, tl } from "@/lib/i18n"

const t2 = (kg: number) => num((kg ?? 0) / 1000, 2)
const SCOPE_COLOR = { 1: "var(--scope1)", 2: "var(--scope2)", 3: "var(--scope3)" } as const
const H = ({ children }: { children: ReactNode }) => <h3 className="mt-6 mb-2.5 text-[11.5pt] font-semibold text-[var(--primary-deep)] first:mt-0">{children}</h3>
const Kpi = ({ label, value, sub, strong }: { label: string; value: ReactNode; sub?: ReactNode; strong?: boolean }) => (
  <div className={strong ? "rounded-xl bg-[var(--primary-deep)] p-3.5 text-white" : "rounded-xl bg-[var(--muted)] p-3.5"}>
    <div className={strong ? "text-[8pt] text-white/75" : "text-[8pt] text-[var(--muted-foreground)]"}>{label}</div>
    <div className="mt-1 text-[16pt] leading-tight font-semibold tabular-nums">{value}</div>
    {sub && <div className={strong ? "mt-0.5 text-[8pt] text-white/80" : "mt-0.5 text-[8pt] text-[var(--muted-foreground)]"}>{sub}</div>}
  </div>
)

function MonthBars({ data }: { data: [string, number][] }) {
  const W = 680, Hh = 200, L = 44, B = 24, T = 8
  const max = Math.max(...data.map(([, v]) => v), 1) * 1.1
  const bw = (W - L - 8) / Math.max(data.length, 1)
  const y = (v: number) => T + (Hh - T - B) * (1 - v / max)
  const peak = data.reduce((m, d, i) => (d[1] > data[m][1] ? i : m), 0)
  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} className="w-full">
      {[0, 0.5, 1].map((f) => <g key={f}><line x1={L} x2={W} y1={y(max * f)} y2={y(max * f)} stroke="oklch(0.9 0.01 150)" strokeDasharray="2 4" /><text x={L - 6} y={y(max * f) + 3} fontSize="8" textAnchor="end" fill="#777">{num((max * f) / 1000, 1)}t</text></g>)}
      {data.map(([m, v], i) => (
        <g key={m}>
          <rect x={L + i * bw + bw * 0.2} y={y(v)} width={bw * 0.6} height={Math.max(y(0) - y(v), 0)} rx={Math.min(bw * 0.3, 10)} fill={i === peak ? "var(--primary-deep)" : "var(--primary)"} />
          <text x={L + i * bw + bw / 2} y={Hh - 8} fontSize="8" textAnchor="middle" fill="#555">{fmtMonth(m).slice(0, 3)}</text>
        </g>
      ))}
    </svg>
  )
}

/** Versi cetak rapor: dokumen A4 tanpa sidebar (untuk PDF). Tampilan di aplikasi ada di /app/reports/:id. */
export default function ReportDocument({ report }: { report?: any } = {}) {
  const { id } = useParams()
  const qc = useQueryClient()
  const embedded = !!report
  const q = useQuery({ queryKey: ["report", id], queryFn: () => api<any>(`/reports/${id}`), enabled: !embedded })
  const r = report ?? q.data, isLoading = !embedded && q.isLoading, error = embedded ? null : q.error
  const navCanon = useNavigate()
  useEffect(() => { if (embedded) return; const to = canonicalUuidPath("/print/reports", id, r?.uuid); if (to) navCanon(to, { replace: true }) }, [r?.uuid]) // eslint-disable-line
  const act = useMutation({
    mutationFn: (a: string) => api(`/reports/${id}/${a}`, { method: "POST" }),
    onSuccess: (_, a) => { toast.success(t({ request: "Diajukan ke Admin", approve: "Disahkan", refresh: "Data rapor diperbarui" }[a] ?? "")); qc.invalidateQueries({ queryKey: ["report", id] }); qc.invalidateQueries({ queryKey: ["reports"] }) },
    onError: (e: Error) => toast.error(e.message),
  })
  useEffect(() => { if (r && !embedded) document.title = `${r.kind === "karbon" ? "Rapor Karbon" : "Rapor Jasa Lingkungan"} – ${r.snapshot?.org?.name ?? ""} – ${r.period_label}`; return () => { document.title = "Sekolah Lestari — Dashboard Emisi Karbon" } }, [r])
  useEffect(() => { if (r && !embedded && new URLSearchParams(location.search).get("print") === "1") { const t = setTimeout(() => window.print(), 600); return () => clearTimeout(t) } }, [r])
  if (isLoading) return embedded ? null : <div className="p-8"><PageSkeleton /></div>
  if (error) return <div className="p-8"><ErrorState error={error} /></div>

  const s = r.snapshot
  const roles: string[] = r.myRoles ?? []
  const karbon = r.kind === "karbon"
  const official = r.status === "terkunci"
  const title = karbon ? "Rapor Karbon" : "Rapor Jasa Lingkungan"
  const exportXlsx = () => {
    const wb = XLSX.utils.book_new()
    const head = [["Rapor", title], ["Lembaga", s.org.name], ["Periode", `${s.period.start} s.d. ${s.period.end}`], ["Versi baseline", s.baselineVersion], ["Status", r.status], ["Hash", r.hash ?? "-"]]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(head), "Ringkasan")
    if (karbon) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s.sources.map((x: any) => ({ sumber: x.label, scope: x.scope, total_kg: x.total, resmi_kg: x.verified, catatan_kg: x.other }))), "Per_sumber")
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(Object.entries(s.monthly).map(([m, v]) => ({ bulan: m, kg_co2e: v }))), "Bulanan")
    } else {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ stok_kg: s.trees.stock, serapan_kg: s.trees.absorbed, pelepasan_kg: s.trees.released, kompos_kg: s.avoided.kompos.co2e, bank_kertas_kg: s.avoided.bankKertas.co2e, plts_kg: s.avoided.plts.co2e, biopori_l: s.avoided.biopori.liters }]), "Jasa_lingkungan")
    }
    XLSX.writeFile(wb, `rapor-${r.kind}-${s.period.start}.xlsx`)
  }
  const monthly: [string, number][] = karbon ? Object.entries<number>(s.monthly ?? {}) : []
  const period = `${r.period_label} (${fmtDate(s.period.start)} – ${fmtDate(s.period.end)})`
  const pageHead = (no: string, name: string) => (
    <header className="mb-6 flex items-end justify-between border-b-2 border-[oklch(0.48_0.115_156)] pb-2.5">
      <div className="flex items-center gap-2.5"><img src="/favicon.svg" className="size-7 rounded-md" alt="" /><div className="leading-tight"><div className="text-[10pt] font-semibold">Sekolah Lestari · {title}</div><div className="text-[8pt] text-[var(--muted-foreground)]">{s.org.name} · {r.period_label}</div></div></div>
      <div className="text-right"><div className="text-[8pt] font-semibold tracking-wide text-[var(--primary)] uppercase">{no}</div><div className="text-[11pt] font-semibold">{name}</div></div>
    </header>
  )

  return (
    <div className={embedded ? "report-doc print-embed" : "report-doc min-h-svh bg-[var(--background)] pb-10"}>
      {/* ---------- toolbar alur kerja (tidak ikut dicetak) ---------- */}
      {!embedded && <div className="no-print sticky top-0 z-20 mb-6 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[210mm] flex-wrap items-center gap-2 px-4 py-3">
          <Button variant="outline" render={<Link to={`/app/reports/${r.uuid ?? id}`} />}><ArrowLeft /> {tl("Kembali ke rapor", "Back to report")}</Button>
          <StatusBadge status={r.status} />
          <div className="ml-auto flex flex-wrap gap-2">
            {["draf", "perlu_perbaikan", "perlu_tinjau"].includes(r.status) && roles.includes("operator") && <Button variant="outline" onClick={() => act.mutate("refresh")}><RefreshCcw /> {t("Perbarui data")}</Button>}
            {["draf", "perlu_perbaikan"].includes(r.status) && (roles.includes("operator") || roles.includes("admin")) && <Button onClick={() => act.mutate("request")}><Send /> {tl("Ajukan ke Admin", "Submit to Admin")}</Button>}
            
            <Button variant="outline" onClick={exportXlsx}><FileSpreadsheet /> Excel</Button>
            <Button onClick={() => window.print()}><Printer /> {tl("Cetak / Unduh PDF", "Print / Download PDF")}</Button>
          </div>
        </div>
      </div>}

      {/* ================= 1. sampul & ringkasan ================= */}
      <section className="sheet">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3"><img src="/favicon.svg" className="size-12 rounded-xl" alt="" /><div className="leading-tight"><div className="text-[13pt] font-semibold">Sekolah Lestari</div><div className="text-[9pt] text-[var(--muted-foreground)]">Dashboard Emisi Karbon</div></div></div>
          {r.hash ? (
            <div className="flex flex-col items-center gap-1 text-center"><div className="rounded-lg bg-white p-1.5 ring-1 ring-[oklch(0.9_0.01_150)]"><QRCodeSVG value={`${location.origin}/verify/${r.hash}`} size={78} /></div><span className="text-[7.5pt] text-[var(--muted-foreground)]">QR keaslian</span></div>
          ) : <span className="rounded-full bg-amber-500/15 px-3 py-1 text-[8.5pt] font-semibold text-amber-700">DRAF — belum resmi</span>}
        </div>
        <div className="mt-10 rounded-2xl bg-[var(--primary-deep)] px-8 py-10 text-white">
          <div className="text-[9pt] tracking-[0.2em] text-white/70 uppercase">{karbon ? "Laporan Emisi Gas Rumah Kaca" : "Laporan Jasa Lingkungan"}</div>
          <h1 className="mt-2 text-[34pt] leading-none font-semibold">{title}</h1>
          <div className="mt-4 text-[15pt] font-medium">{s.org.name}</div>
          <div className="mt-1 text-[10pt] text-white/80">{num(s.org.population)} warga · {num(s.org.building_m2)} m² bangunan</div>
          <div className="mt-8 grid grid-cols-3 gap-4 text-[9pt]">
            <div><div className="text-white/65">Periode</div><div className="mt-0.5 font-semibold">{period}</div></div>
            <div><div className="text-white/65">Baseline</div><div className="mt-0.5 font-semibold">{s.baselineVersion ?? "—"}</div></div>
            <div><div className="text-white/65">Faktor emisi</div><div className="mt-0.5 font-semibold">IPCC 2006 · GWP AR5</div></div>
          </div>
          <div className="mt-6 inline-flex rounded-full bg-white/12 px-3 py-1 text-[8.5pt]">{official ? `Disahkan & terkunci${r.published_at ? ` · terbit ${fmtDate(r.published_at)}` : ""}` : `Status: ${r.status.replace(/_/g, " ")}`}</div>
        </div>

        {karbon ? (
          <>
            <H>Ringkasan</H>
            <div className="grid grid-cols-4 gap-3">
              <Kpi strong label="Total emisi" value={<>{t2(s.total)} <span className="text-[9pt] font-normal">t CO₂e</span></>} />
              <Kpi label="Angka resmi (disahkan)" value={<>{t2(s.officialTotal)} <span className="text-[9pt] font-normal">t</span></>} sub={pct(s.total ? s.officialTotal / s.total : 0) + " dari total"} />
              <Kpi label="Per orang per tahun" value={<>{num(s.perPersonYear, 1)} <span className="text-[9pt] font-normal">kg</span></>} />
              <Kpi label="Per hari aktif" value={<>{num(s.perActiveDay, 0)} <span className="text-[9pt] font-normal">kg</span></>} />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 text-[9pt]">
              {([1, 2, 3] as const).map((sc) => (
                <div key={sc} className="rounded-xl border border-[oklch(0.9_0.01_150)] p-3">
                  <div className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: SCOPE_COLOR[sc] }} /><b>Scope {sc}</b><span className="ml-auto tabular-nums">{pct(s.total ? s.scope[sc] / s.total : 0, 1)}</span></div>
                  <div className="mt-1 text-[13pt] font-semibold tabular-nums">{t2(s.scope[sc])} t</div>
                  <div className="text-[8pt] text-[var(--muted-foreground)]">{sc === 1 ? "Bahan bakar & refrigeran" : sc === 2 ? "Listrik PLN" : "Mobilitas, sampah, air limbah, kertas"}</div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <H>Ringkasan</H>
            <div className="grid grid-cols-4 gap-3">
              <Kpi strong label="Stok karbon pohon" value={<>{num(s.trees.stock / 1000, 2)} <span className="text-[9pt] font-normal">t CO₂</span></>} sub={`${num(s.trees.count)} pohon`} />
              <Kpi label="Serapan periode" value={<>{num(s.trees.absorbed, 0)} <span className="text-[9pt] font-normal">kg</span></>} />
              <Kpi label="Pelepasan (pohon mati)" value={<>{num(s.trees.released, 0)} <span className="text-[9pt] font-normal">kg</span></>} />
              <Kpi label="Emisi terhindar" value={<>{num(s.avoided.totalCo2e, 0)} <span className="text-[9pt] font-normal">kg</span></>} />
            </div>
          </>
        )}
      </section>

      {/* ================= 2. rincian ================= */}
      <section className="sheet">
        {pageHead("Bagian 2", karbon ? "Rincian emisi" : "Rincian jasa lingkungan")}
        {karbon ? (
          <>
            <H>Rincian per sumber</H>
            <table><thead><tr><th>Sumber</th><th>Scope</th><th className="num">Total (kg)</th><th className="num">Resmi (kg)</th><th className="num">Catatan (kg)</th><th className="num">Porsi</th><th className="num">vs baseline*</th></tr></thead>
              <tbody>{groupByScope(s.sources, (x: any) => x.source, null, (x: any) => x.scope).map((g) => [
                <tr key={`scope-${g.scope}`} className="scope-row"><td colSpan={7} style={{ background: "var(--muted)", fontWeight: 600, fontSize: "8pt" }}>{SCOPE_INFO[g.scope].id} <span style={{ fontWeight: 400, color: "var(--muted-foreground)" }}>· {SCOPE_INFO[g.scope].descId}</span><span style={{ float: "right" }}>{num(g.items.reduce((acc: number, x: any) => acc + x.total, 0), 0)} kg</span></td></tr>,
                ...g.items.map((x: any) => { const vb = s.vsBaseline.find((v: any) => v.source === x.source); return (
                <tr key={x.source}><td><span className="mr-2 inline-block size-2.5 rounded-full align-middle" style={{ background: SOURCES[x.source]?.color }} />{x.label}</td><td>{x.scope}</td><td className="num font-semibold">{num(x.total, 0)}</td><td className="num">{num(x.verified, 0)}</td><td className="num">{num(x.other, 0)}</td><td className="num">{pct(s.total ? x.total / s.total : 0, 1)}</td><td className="num" style={{ color: vb?.change < 0 ? "oklch(0.45 0.12 156)" : vb?.change > 0 ? "oklch(0.55 0.15 60)" : undefined }}>{signedPct(vb?.change)}</td></tr>
              ) })])}
                <tr className="font-semibold"><td>Total</td><td /><td className="num">{num(s.total, 0)}</td><td className="num">{num(s.officialTotal, 0)}</td><td className="num">{num(s.total - s.officialTotal, 0)}</td><td className="num">100%</td><td /></tr>
              </tbody></table>
            <p className="mt-1.5 text-[8pt] text-[var(--muted-foreground)]">* Intensitas emisi per hari aktif per orang dibanding baseline {s.baselineVersion}. "Resmi" = data yang sudah disahkan; "Catatan" = proyeksi/estimasi yang belum diverifikasi.</p>
            {monthly.length > 0 && (<>
              <H>Emisi bulanan</H>
              <MonthBars data={monthly} />
              <table className="mt-3"><thead><tr><th>Bulan</th><th className="num">kg CO₂e</th><th className="num">t CO₂e</th><th className="num">Porsi periode</th></tr></thead>
                <tbody>{monthly.map(([m, v]) => <tr key={m}><td>{fmtMonth(m)}</td><td className="num">{num(v, 0)}</td><td className="num font-semibold">{t2(v)}</td><td className="num">{pct(s.total ? v / s.total : 0, 1)}</td></tr>)}</tbody></table>
            </>)}
            {s.notes?.length > 0 && <div className="mt-5 rounded-xl border border-dashed border-[#bbb] p-4 text-[8.5pt]"><b>Catatan data non-resmi</b><ul className="mt-1 list-disc space-y-0.5 pl-4 text-[var(--muted-foreground)]">{s.notes.map((n: string) => <li key={n}>{n}</li>)}</ul></div>}
          </>
        ) : (
          <>
            <H>Emisi terhindar</H>
            <table><thead><tr><th>Aksi</th><th className="num">Kuantitas</th><th className="num">kg CO₂e terhindar</th></tr></thead>
              <tbody>
                <tr><td>Kompos (dibanding ke TPA)</td><td className="num">{num(s.avoided.kompos.kg, 0)} kg</td><td className="num">{num(s.avoided.kompos.co2e, 1)}</td></tr>
                <tr><td>Bank sampah kertas</td><td className="num">{num(s.avoided.bankKertas.kg, 0)} kg</td><td className="num">{num(s.avoided.bankKertas.co2e, 1)}</td></tr>
                <tr><td>Bank sampah plastik/logam</td><td className="num">{num(s.avoided.bankMaterial.kg, 0)} kg</td><td className="num text-[var(--muted-foreground)]">tanpa klaim</td></tr>
                <tr><td>Panel surya (PLTS)</td><td className="num">{num(s.avoided.plts.kwh, 0)} kWh</td><td className="num">{num(s.avoided.plts.co2e, 1)}</td></tr>
                <tr className="font-semibold"><td>Total</td><td /><td className="num">{num(s.avoided.totalCo2e, 1)}</td></tr>
              </tbody></table>
            <H>Pohon & biopori</H>
            <table><thead><tr><th>Indikator</th><th className="num">Nilai</th></tr></thead>
              <tbody>
                <tr><td>Jumlah pohon terpantau</td><td className="num">{num(s.trees.count)}</td></tr>
                <tr><td>Stok karbon pohon akhir periode</td><td className="num">{num(s.trees.stock / 1000, 2)} t CO₂</td></tr>
                <tr><td>Serapan selama periode</td><td className="num">{num(s.trees.absorbed, 0)} kg CO₂</td></tr>
                <tr><td>Pelepasan (pohon mati)</td><td className="num">{num(s.trees.released, 0)} kg CO₂</td></tr>
                <tr><td>Lubang biopori · kapasitas tampung</td><td className="num">{num(s.avoided.biopori.count)} · {num(s.avoided.biopori.liters, 0)} L</td></tr>
              </tbody></table>
            <p className="mt-2 text-[8pt] text-[var(--muted-foreground)]">Serapan pohon adalah estimasi pelaporan internal (model riap per jenis), dilaporkan terpisah dari Rapor Karbon dan bukan kredit karbon.</p>
          </>
        )}
      </section>

      {/* ================= 3. keabsahan & pengesahan ================= */}
      <section className="sheet">
        {pageHead("Bagian 3", "Keabsahan & pengesahan")}
        <H>Pernyataan</H>
        <p className="text-[10pt] leading-relaxed">{s.disclaimer}</p>
        <H>Pengesahan</H>
        <div className="grid grid-cols-3 gap-4 text-center text-[9pt]">
          {[["Disusun oleh,", "Operator sekolah"], ["Disahkan oleh,", "Admin"], ["Mengetahui,", "Kepala sekolah"]].map(([a, b]) => (
            <div key={b} className="rounded-xl border border-[oklch(0.9_0.01_150)] p-3">
              <div className="text-[var(--muted-foreground)]">{a}<br />{b}</div>
              <div className="flex h-20 items-center justify-center">{official && <span className="rounded-full border border-[oklch(0.48_0.115_156)] px-3 py-1 text-[8pt] font-semibold text-[var(--primary)]">✓ disahkan di sistem</span>}</div>
              <div className="border-t border-dashed border-[#999] pt-1.5">Nama & tanda tangan</div>
            </div>
          ))}
        </div>
        <H>Jejak dokumen</H>
        <table><tbody>
          <tr><td className="w-48 text-[var(--muted-foreground)]">Disusun</td><td>{fmtDateTime(s.generatedAt)}</td></tr>
          {r.published_at && <tr><td className="text-[var(--muted-foreground)]">Terbit</td><td>{fmtDateTime(r.published_at)}</td></tr>}
          <tr><td className="text-[var(--muted-foreground)]">Versi baseline</td><td>{s.baselineVersion ?? "—"}</td></tr>
          <tr><td className="text-[var(--muted-foreground)]">Status</td><td>{r.status.replace(/_/g, " ")}</td></tr>
          {r.hash && <tr><td className="text-[var(--muted-foreground)]">SHA-256</td><td className="font-mono text-[8pt] break-all">{r.hash}</td></tr>}
          {r.hash && <tr><td className="text-[var(--muted-foreground)]">Cek keaslian</td><td className="text-[8.5pt]">{location.origin}/verify/{r.hash.slice(0, 16)}…</td></tr>}
        </tbody></table>
        {!official && <p className="mt-5 rounded-xl bg-amber-500/10 px-4 py-3 text-[8.5pt] text-amber-800">Dokumen ini masih DRAF. Rapor resmi dengan QR keaslian tersedia setelah disahkan Admin.</p>}
      </section>
    </div>
  )
}
