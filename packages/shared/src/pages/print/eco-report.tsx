import type { ReactNode } from "react"
import { fmtDate, fmtMonth, num, pct } from "@/lib/format"

/** Dokumen A4 Rapor Jasa Lingkungan dari data halaman Jasa Lingkungan (periode terpilih).
 *  Disisipkan tersembunyi (.print-embed) dan hanya tampil saat dialog cetak/PDF dibuka. */
const H = ({ children }: { children: ReactNode }) => <h3 className="mt-6 mb-2.5 text-[11.5pt] font-semibold text-[var(--primary-deep)] first:mt-0">{children}</h3>
const Kpi = ({ label, value, sub, strong }: { label: string; value: ReactNode; sub?: ReactNode; strong?: boolean }) => (
  <div className={strong ? "rounded-xl bg-[var(--primary-deep)] p-3.5 text-white" : "rounded-xl bg-[var(--muted)] p-3.5"}>
    <div className={strong ? "text-[8pt] text-white/75" : "text-[8pt] text-[var(--muted-foreground)]"}>{label}</div>
    <div className="mt-1 text-[16pt] leading-tight font-semibold tabular-nums">{value}</div>
    {sub && <div className={strong ? "mt-0.5 text-[8pt] text-white/80" : "mt-0.5 text-[8pt] text-[var(--muted-foreground)]"}>{sub}</div>}
  </div>
)

function MonthBars({ data }: { data: { period: string; absorbed: number }[] }) {
  const W = 680, Hh = 180, L = 44, B = 24, T = 8
  const max = Math.max(...data.map((d) => d.absorbed), 1) * 1.1
  const bw = (W - L - 8) / Math.max(data.length, 1)
  const y = (v: number) => T + (Hh - T - B) * (1 - v / max)
  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} className="w-full">
      {[0, 0.5, 1].map((f) => <g key={f}><line x1={L} x2={W} y1={y(max * f)} y2={y(max * f)} stroke="oklch(0.9 0.01 150)" strokeDasharray="2 4" /><text x={L - 6} y={y(max * f) + 3} fontSize="8" textAnchor="end" fill="#777">{num(max * f, 0)}</text></g>)}
      {data.map((d, i) => (
        <g key={d.period}>
          <rect x={L + i * bw + bw * 0.2} y={y(d.absorbed)} width={bw * 0.6} height={Math.max(y(0) - y(d.absorbed), 0)} rx={Math.min(bw * 0.3, 10)} fill="var(--primary)" />
          <text x={L + i * bw + bw / 2} y={Hh - 8} fontSize="8" textAnchor="middle" fill="#555">{fmtMonth(d.period).slice(0, 3)}</text>
        </g>
      ))}
    </svg>
  )
}

export default function EcoReportPrint({ env, orgName, period }: { env: any; orgName: string; period: { start: string; end: string; label: string } }) {
  if (!env) return null
  const a = env.avoided, t = env.trees
  const range = period.start === period.end ? fmtDate(period.start) : `${fmtDate(period.start)} – ${fmtDate(period.end)}`
  const generated = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "long", timeStyle: "short" })
  const avoidedRows: [string, string, number | null][] = [
    ["Kompos (dibanding dibuang ke TPA)", `${num(a.kompos.kg, 0)} kg`, a.kompos.co2e],
    ["Bank sampah kertas", `${num(a.bankKertas.kg, 0)} kg`, a.bankKertas.co2e],
    ["Bank sampah plastik/logam", `${num(a.bankMaterial.kg, 0)} kg`, null],
    ["Panel surya (PLTS)", `${num(a.plts.kwh, 0)} kWh`, a.plts.co2e],
  ]
  const pageHead = (no: string, name: string) => (
    <header className="mb-6 flex items-end justify-between border-b-2 border-[oklch(0.48_0.115_156)] pb-2.5">
      <div className="flex items-center gap-2.5"><img src="/favicon.svg" className="size-7 rounded-md" alt="" /><div className="leading-tight"><div className="text-[10pt] font-semibold">Sekolah Lestari · Rapor Jasa Lingkungan</div><div className="text-[8pt] text-[var(--muted-foreground)]">{orgName} · {range}</div></div></div>
      <div className="text-right"><div className="text-[8pt] font-semibold tracking-wide text-[var(--primary)] uppercase">{no}</div><div className="text-[11pt] font-semibold">{name}</div></div>
    </header>
  )

  return (
    <div className="report-doc print-embed">
      {/* ================= 1. sampul & ringkasan ================= */}
      <section className="sheet">
        <div className="flex items-center gap-3"><img src="/favicon.svg" className="size-12 rounded-xl" alt="" /><div className="leading-tight"><div className="text-[13pt] font-semibold">Sekolah Lestari</div><div className="text-[9pt] text-[var(--muted-foreground)]">Dashboard Emisi Karbon</div></div></div>
        <div className="mt-10 rounded-2xl bg-[var(--primary-deep)] px-8 py-10 text-white">
          <div className="text-[9pt] tracking-[0.2em] text-white/70 uppercase">Laporan Jasa Lingkungan</div>
          <h1 className="mt-2 text-[34pt] leading-none font-semibold">Rapor Jasa Lingkungan</h1>
          <div className="mt-4 text-[15pt] font-medium">{orgName}</div>
          <div className="mt-8 grid grid-cols-3 gap-4 text-[9pt]">
            <div><div className="text-white/65">Periode</div><div className="mt-0.5 font-semibold">{range}</div></div>
            <div><div className="text-white/65">Pohon terpantau</div><div className="mt-0.5 font-semibold">{num(t.count)} pohon</div></div>
            <div><div className="text-white/65">Metode</div><div className="mt-0.5 font-semibold">IPCC 2006 · SNI 7724:2011</div></div>
          </div>
          <div className="mt-6 inline-flex rounded-full bg-white/12 px-3 py-1 text-[8.5pt]">Disusun dari data sistem · {generated} WIB</div>
        </div>

        <H>Ringkasan</H>
        <div className="grid grid-cols-4 gap-3">
          <Kpi strong label="Stok karbon pohon" value={<>{num(t.stock / 1000, 2)} <span className="text-[9pt] font-normal">t CO₂</span></>} sub={`akhir periode · ${num(t.count)} pohon`} />
          <Kpi label="Serapan periode" value={<>{num(t.absorbed, 0)} <span className="text-[9pt] font-normal">kg CO₂</span></>} />
          <Kpi label="Pelepasan (pohon mati)" value={<>{num(t.released, 0)} <span className="text-[9pt] font-normal">kg CO₂</span></>} />
          <Kpi label="Emisi terhindar" value={<>{num(a.totalCo2e, 0)} <span className="text-[9pt] font-normal">kg CO₂e</span></>} sub="kompos + bank kertas + PLTS" />
        </div>
        <p className="mt-4 rounded-xl bg-[var(--muted)] px-4 py-3 text-[8.5pt] leading-relaxed text-[var(--muted-foreground)]">
          Serapan pohon dan emisi terhindar adalah estimasi pelaporan internal, dilaporkan terpisah dari Rapor Karbon dan <b>bukan kredit karbon</b> (Perpres 110/2025). Angka ini tidak dikurangkan dari emisi sekolah.
        </p>
      </section>

      {/* ================= 2. rincian ================= */}
      <section className="sheet">
        {pageHead("Bagian 2", "Rincian jasa lingkungan")}
        <H>Emisi terhindar</H>
        <table><thead><tr><th>Aksi</th><th className="num">Kuantitas</th><th className="num">kg CO₂e terhindar</th><th className="num">Porsi</th></tr></thead>
          <tbody>
            {avoidedRows.map(([label, qty, co2]) => <tr key={label}><td>{label}</td><td className="num">{qty}</td><td className="num font-semibold">{co2 === null ? <span className="font-normal text-[var(--muted-foreground)]">tanpa klaim</span> : num(co2, 1)}</td><td className="num">{co2 === null ? "—" : pct(a.totalCo2e ? co2 / a.totalCo2e : 0, 1)}</td></tr>)}
            <tr className="font-semibold"><td>Total</td><td /><td className="num">{num(a.totalCo2e, 1)}</td><td className="num">100%</td></tr>
          </tbody></table>

        <H>Serapan karbon pohon per bulan</H>
        <MonthBars data={t.months} />
        <table className="mt-3"><thead><tr><th>Bulan</th><th className="num">Pohon</th><th className="num">Stok (t CO₂)</th><th className="num">Serapan (kg CO₂)</th></tr></thead>
          <tbody>{t.months.map((m: any) => <tr key={m.period}><td>{fmtMonth(m.period)}</td><td className="num">{num(m.count)}</td><td className="num">{num(m.stock / 1000, 2)}</td><td className="num font-semibold">{num(m.absorbed, 0)}</td></tr>)}</tbody></table>
      </section>

      {/* ================= 3. pohon per jenis & pengesahan ================= */}
      <section className="sheet">
        {pageHead("Bagian 3", "Pohon per jenis & pengesahan")}
        <H>Stok karbon per jenis pohon</H>
        <table><thead><tr><th>Jenis</th><th className="num">Jumlah</th><th className="num">Stok (kg CO₂)</th><th className="num">Serapan/hari (kg)</th><th className="num">Porsi stok</th></tr></thead>
          <tbody>
            {(t.species ?? []).map((s: any) => <tr key={s.name}><td>{s.name} {s.scientific && s.scientific !== "-" ? <i className="text-[var(--muted-foreground)]">({s.scientific})</i> : null}</td><td className="num">{num(s.count)}</td><td className="num font-semibold">{num(s.stock, 0)}</td><td className="num">{num(s.daily, 2)}</td><td className="num">{pct(t.stock ? s.stock / t.stock : 0, 1)}</td></tr>)}
          </tbody></table>
        <H>Biopori</H>
        <table><tbody>
          <tr><td className="w-64 text-[var(--muted-foreground)]">Jumlah lubang biopori</td><td className="num">{num(a.biopori?.count ?? 0)}</td></tr>
          <tr><td className="text-[var(--muted-foreground)]">Kapasitas tampung air</td><td className="num">{num(a.biopori?.liters ?? 0, 0)} L</td></tr>
        </tbody></table>
        <H>Pengesahan</H>
        <div className="grid grid-cols-3 gap-4 text-center text-[9pt]">
          {[["Disusun oleh,", "Operator sekolah"], ["Disahkan oleh,", "Admin"], ["Mengetahui,", "Kepala sekolah"]].map(([x, y]) => (
            <div key={y} className="rounded-xl border border-[oklch(0.9_0.01_150)] p-3">
              <div className="text-[var(--muted-foreground)]">{x}<br />{y}</div>
              <div className="h-20" />
              <div className="border-t border-dashed border-[#999] pt-1.5">Nama & tanda tangan</div>
            </div>
          ))}
        </div>
        <p className="mt-5 text-[8pt] text-[var(--muted-foreground)]">Dokumen dihasilkan otomatis dari data sistem Sekolah Lestari pada {generated} WIB untuk periode {range}. Rapor resmi berstempel QR keaslian diterbitkan lewat menu Laporan.</p>
      </section>
    </div>
  )
}
