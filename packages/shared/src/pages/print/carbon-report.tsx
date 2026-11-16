import { useEffect, useMemo, useState, type ReactNode } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SimpleSelect, PageSkeleton, ErrorState } from "@/components/common"
import { api } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { useOrg } from "@/lib/hooks"
import { fmtDate, fmtMonth, groupByScope, num, pct, signedPct, SOURCES, sourceScope, todayWIB } from "@/lib/format"
import { tl } from "@/lib/i18n"

const STRONG = ["aktual", "terukur", "terverifikasi", "terkunci"]
const LABEL_TEXT: Record<string, string> = { aktual: "Aktual", terukur: "Terukur", terverifikasi: "Disahkan", terkunci: "Terkunci", input: "Input operator", estimasi: "Estimasi", interpolasi: "Interpolasi", proyeksi: "Proyeksi", "rata-rata": "Rata-rata", "rata-rata lama": "Rata-rata lama", kosong: "Kosong" }
const FACTOR_CODES = ["EL_JAMALI", "LPG_BI", "SOLAR_BI", "B40_FOSIL", "PAPER_RIM", "TR_MOTOR", "TR_SEDAN", "TR_ANGKOT", "TR_BUS_SDG", "WW_ORG_HARI", "REF_LEAK", "WS_KOMPOS", "WS_MAKANAN_TPA", "WS_KERTAS_TPA", "WS_DAUR_ULANG"]
const t2 = (kg: number) => num(kg / 1000, 2)
const SCOPE_COLOR = { 1: "var(--scope1)", 2: "var(--scope2)", 3: "var(--scope3)" } as const

type Row = { month: string; total: number; baseline: number; scope: Record<number, number>; sources: Record<string, number>; labels: Record<string, number>; srcLabels: Record<string, Record<string, number>>; activeDays: number; days: number; perPersonActiveDay: number; partial: boolean }

function agg(rows: Row[], pop: number) {
  const r = { total: 0, baseline: 0, scope: { 1: 0, 2: 0, 3: 0 } as Record<number, number>, sources: {} as Record<string, number>, labels: {} as Record<string, number>, srcLabels: {} as Record<string, Record<string, number>>, activeDays: 0, days: 0 }
  for (const m of rows) {
    r.total += m.total; r.baseline += m.baseline; r.activeDays += m.activeDays; r.days += m.days
    for (const s of [1, 2, 3]) r.scope[s] += m.scope[s] ?? 0
    for (const [k, v] of Object.entries(m.sources)) r.sources[k] = (r.sources[k] ?? 0) + v
    for (const [k, v] of Object.entries(m.labels)) r.labels[k] = (r.labels[k] ?? 0) + v
    for (const [k, o] of Object.entries(m.srcLabels ?? {})) for (const [l, v] of Object.entries(o)) { (r.srcLabels[k] ??= {})[l] = (r.srcLabels[k][l] ?? 0) + v }
  }
  const strong = STRONG.reduce((s, l) => s + (r.labels[l] ?? 0), 0)
  return { ...r, strongShare: r.total ? strong / r.total : 0, projShare: r.total ? (r.labels.proyeksi ?? 0) / r.total : 0, delta: r.baseline ? r.total / r.baseline - 1 : null, intensity: r.activeDays ? r.total / r.activeDays / Math.max(pop, 1) : 0, perActiveDay: r.activeDays ? r.total / r.activeDays : 0 }
}

function Sheet({ title, no, children, org, period }: { title: string; no: string; children: ReactNode; org: string; period: string }) {
  return (
    <section className="sheet">
      <header className="mb-6 flex items-end justify-between border-b-2 border-[oklch(0.48_0.115_156)] pb-2.5">
        <div className="flex items-center gap-2.5"><img src="/favicon.svg" className="size-7 rounded-md" alt="" /><div className="leading-tight"><div className="text-[10pt] font-semibold">Sekolah Lestari · Rapor Karbon</div><div className="text-[8pt] text-[var(--muted-foreground)]">{org} · {period}</div></div></div>
        <div className="text-right"><div className="text-[8pt] font-semibold tracking-wide text-[var(--primary)] uppercase">{no}</div><div className="text-[11pt] font-semibold">{title}</div></div>
      </header>
      {children}
    </section>
  )
}
const H = ({ children }: { children: ReactNode }) => <h3 className="mt-6 mb-2.5 text-[11.5pt] font-semibold text-[var(--primary-deep)] first:mt-0">{children}</h3>
const Kpi = ({ label, value, sub, strong }: { label: string; value: ReactNode; sub?: ReactNode; strong?: boolean }) => (
  <div className={strong ? "rounded-xl bg-[var(--primary-deep)] p-3.5 text-white" : "rounded-xl bg-[var(--muted)] p-3.5"}>
    <div className={strong ? "text-[8pt] text-white/75" : "text-[8pt] text-[var(--muted-foreground)]"}>{label}</div>
    <div className="mt-1 text-[17pt] leading-tight font-semibold tabular-nums">{value}</div>
    {sub && <div className={strong ? "mt-0.5 text-[8pt] text-white/80" : "mt-0.5 text-[8pt] text-[var(--muted-foreground)]"}>{sub}</div>}
  </div>
)

/** Grafik batang bertumpuk per bulan (scope) + garis ekspektasi baseline — SVG, ramah cetak. */
function MonthlyChart({ rows }: { rows: Row[] }) {
  const W = 680, Hh = 230, L = 44, B = 26, T = 10
  const max = Math.max(...rows.map((r) => Math.max(r.total, r.baseline)), 1) * 1.08
  const bw = (W - L - 8) / rows.length
  const y = (v: number) => T + (Hh - T - B) * (1 - v / max)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => max * f)
  const pts = rows.map((r, i) => `${L + i * bw + bw / 2},${y(r.baseline)}`).join(" ")
  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} className="w-full">
      {ticks.map((v) => <g key={v}><line x1={L} x2={W} y1={y(v)} y2={y(v)} stroke="oklch(0.9 0.01 150)" strokeDasharray="2 4" /><text x={L - 6} y={y(v) + 3} fontSize="8" textAnchor="end" fill="#777">{num(v / 1000, 1)}t</text></g>)}
      {rows.map((r, i) => {
        let acc = 0
        const x = L + i * bw + bw * 0.18, w = bw * 0.64
        return (
          <g key={r.month}>
            {[1, 2, 3].map((s) => { const v = r.scope[s] ?? 0; const y1 = y(acc + v), y0 = y(acc); acc += v; return <rect key={s} x={x} y={y1} width={w} height={Math.max(y0 - y1, 0)} fill={SCOPE_COLOR[s as 1]} opacity={r.partial ? 0.55 : 1} rx={s === 3 ? 3 : 0} /> })}
            <text x={x + w / 2} y={Hh - 10} fontSize="8" textAnchor="middle" fill="#555">{fmtDate(`${r.month}-01`, { month: "short" }).replace(".", "")}</text>
          </g>
        )
      })}
      {rows.some((r) => r.baseline > 0) && <polyline points={pts} fill="none" stroke="#333" strokeWidth="1.4" strokeDasharray="4 3" />}
    </svg>
  )
}

/** Dokumen A4 Rapor Karbon. `embedded`: disisipkan tersembunyi di halaman dasbor dan hanya muncul saat dicetak. */
export default function CarbonReportPrint({ embedded, period: periodProp, range }: { embedded?: boolean; period?: string; range?: { start: string; end: string } } = {}) {
  const { orgId, me } = useAuth()
  const { org } = useOrg()
  const [params, setParams] = useSearchParams()
  const thisYear = todayWIB().slice(0, 4)
  const periode = periodProp ?? params.get("periode") ?? `tahun-${thisYear}`
  // dengan `range`: dokumen mengikuti filter periode di halaman (dikelompokkan per bulan)
  const monthly = useQuery({ queryKey: range ? ["monthly-doc", orgId, range.start, range.end] : ["monthly", orgId, "24"], enabled: !!orgId,
    queryFn: () => api<any>(range ? `/orgs/${orgId}/monthly?start=${range.start}&end=${range.end}&group=month` : `/orgs/${orgId}/monthly?months=24`) })
  const meth = useQuery({ queryKey: ["methodology"], queryFn: () => api<any>("/public/methodology") })
  const dash = useQuery({ queryKey: ["dashboard", orgId], enabled: !!orgId, queryFn: () => api<any>(`/orgs/${orgId}/dashboard`) })
  const [docId, setDocId] = useState("")

  const all: Row[] = monthly.data?.months ?? []
  const years = [...new Set(all.map((r) => r.month.slice(0, 4)))].sort().reverse()
  const rows = useMemo(() => {
    if (range) return all
    if (periode.startsWith("tahun-")) return all.filter((r) => r.month.startsWith(periode.slice(6)))
    return all.slice(-Number(periode))
  }, [all, periode, range])
  const pop = monthly.data?.population ?? 0
  const S = useMemo(() => agg(rows, pop), [rows, pop])
  const prevRows = useMemo(() => { const i = all.findIndex((r) => r.month === rows[0]?.month); return i >= rows.length ? all.slice(i - rows.length, i) : [] }, [all, rows])
  const P = useMemo(() => (prevRows.length ? agg(prevRows, pop) : null), [prevRows, pop])

  useEffect(() => {
    if (!rows.length) return
    const txt = JSON.stringify({ orgId, periode, total: Math.round(S.total), m: rows.map((r) => [r.month, Math.round(r.total)]) })
    crypto.subtle?.digest("SHA-256", new TextEncoder().encode(txt)).then((b) => setDocId([...new Uint8Array(b)].slice(0, 6).map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase())).catch(() => {})
  }, [rows, S.total, orgId, periode])
  useEffect(() => { if (embedded) return; document.title = `Rapor Karbon – ${org?.name ?? ""} – ${periodLabel()}`; return () => { document.title = "Sekolah Lestari — Dashboard Emisi Karbon" } }) // eslint-disable-line

  function periodLabel() {
    if (!rows.length) return ""
    if (range) return range.start === range.end ? fmtDate(range.start) : `${fmtDate(range.start)} – ${fmtDate(range.end)}`
    if (periode.startsWith("tahun-")) return `Tahun ${periode.slice(6)} (${fmtMonth(rows[0].month)} – ${fmtMonth(rows[rows.length - 1].month)})`
    return `${rows.length} bulan (${fmtMonth(rows[0].month)} – ${fmtMonth(rows[rows.length - 1].month)})`
  }

  if (monthly.isLoading) return embedded ? null : <div className="p-8"><PageSkeleton /></div>
  if (monthly.error) return embedded ? null : <ErrorState error={monthly.error} />

  const orgName = org?.name ?? dash.data?.org?.name ?? ""
  const period = periodLabel()
  // urutan baku Scope 1 → 2 → 3 (sama dengan dasbor & rapor)
  const srcRows = groupByScope(Object.entries(S.sources).filter(([, v]) => v > 0), ([k]) => k, org).flatMap((g) => g.items)
  const top = [...srcRows].sort((a, b) => b[1] - a[1])[0]
  const hi = [...rows].filter((r) => !r.partial).sort((a, b) => b.total - a.total)[0]
  const lo = [...rows].filter((r) => !r.partial).sort((a, b) => a.total - b.total)[0]
  const byYear = Object.entries(rows.reduce((m, r) => { (m[r.month.slice(0, 4)] ??= []).push(r); return m }, {} as Record<string, Row[]>)).map(([y, rs]) => ({ y, ...agg(rs, pop), n: rs.length }))
  const byQ = Object.entries(rows.reduce((m, r) => { const q = `${r.month.slice(0, 4)} · T${Math.ceil(Number(r.month.slice(5)) / 3)}`; (m[q] ??= []).push(r); return m }, {} as Record<string, Row[]>)).map(([q, rs]) => ({ q, ...agg(rs, pop), n: rs.length, partial: rs.some((r) => r.partial) }))
  const matrixCols: { key: string; label: string; rows: Row[] }[] = rows.length <= 12 ? rows.map((r) => ({ key: r.month, label: fmtDate(`${r.month}-01`, { month: "short" }).replace(".", ""), rows: [r] })) : byQ.map((q) => ({ key: q.q, label: q.q.replace(" · ", " "), rows: rows.filter((r) => `${r.month.slice(0, 4)} · T${Math.ceil(Number(r.month.slice(5)) / 3)}` === q.q) }))
  const factors: any[] = (meth.data?.factors ?? []).filter((f: any) => FACTOR_CODES.includes(f.code))
  const dominant = (k: string) => Object.entries(S.srcLabels[k] ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0]
  const generated = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "long", timeStyle: "short" })
  const sheet = { org: orgName, period }

  return (
    <div className={embedded ? "report-doc print-embed" : "report-doc min-h-svh bg-[var(--background)] pb-10"}>
      {/* ---------- toolbar (tidak ikut dicetak) ---------- */}
      {!embedded && <div className="no-print sticky top-0 z-20 mb-6 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[210mm] flex-wrap items-center gap-3 px-4 py-3">
          <Button variant="outline" render={<Link to="/app/carbon" />}><ArrowLeft /> {tl("Kembali", "Back")}</Button>
          <div className="mr-auto text-sm"><b>{tl("Rapor Karbon — dokumen A4", "Carbon Report — A4 document")}</b><div className="text-xs text-[var(--muted-foreground)]">{tl("Pilih periode, lalu Cetak → Simpan sebagai PDF", "Pick a period, then Print → Save as PDF")}</div></div>
          <SimpleSelect className="w-56" value={periode} onChange={(v) => setParams({ periode: v }, { replace: true })}
            options={[...years.map((y) => ({ value: `tahun-${y}`, label: `${tl("Tahun", "Year")} ${y}` })), { value: "12", label: tl("12 bulan terakhir", "Last 12 months") }, { value: "24", label: tl("24 bulan terakhir", "Last 24 months") }]} />
          <Button onClick={() => window.print()}><Printer /> {tl("Cetak / Unduh PDF", "Print / Download PDF")}</Button>
        </div>
      </div>}

      {!rows.length ? <div className="sheet text-center text-sm">{tl("Belum ada data untuk periode ini.", "No data for this period.")}</div> : <>

      {/* ================= 1. sampul & ringkasan eksekutif ================= */}
      <section className="sheet">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3"><img src="/favicon.svg" className="size-12 rounded-xl" alt="" /><div className="leading-tight"><div className="text-[13pt] font-semibold">Sekolah Lestari</div><div className="text-[9pt] text-[var(--muted-foreground)]">Dashboard Emisi Karbon</div></div></div>
          <div className="text-right text-[8.5pt] text-[var(--muted-foreground)]">ID dokumen<br /><b className="font-mono text-[10pt] text-[var(--foreground)]">{docId || "—"}</b></div>
        </div>
        <div className="mt-12 rounded-2xl bg-[var(--primary-deep)] px-8 py-10 text-white">
          <div className="text-[9pt] tracking-[0.2em] text-white/70 uppercase">Laporan Emisi Gas Rumah Kaca</div>
          <h1 className="mt-2 text-[34pt] leading-none font-semibold">Rapor Karbon</h1>
          <div className="mt-4 text-[15pt] font-medium">{orgName}</div>
          <div className="mt-1 text-[10pt] text-white/80">{[org?.npsn && `NPSN ${org.npsn}`, org?.kecamatan && `Kec. ${org.kecamatan}`, org?.jenjang].filter(Boolean).join(" · ")}</div>
          <div className="mt-8 grid grid-cols-3 gap-4 text-[9pt]">
            <div><div className="text-white/65">Periode</div><div className="mt-0.5 font-semibold">{period}</div></div>
            <div><div className="text-white/65">Baseline</div><div className="mt-0.5 font-semibold">{monthly.data?.baseline?.version ?? "—"} {monthly.data?.baseline?.status ? `(${monthly.data.baseline.status})` : ""}</div></div>
            <div><div className="text-white/65">Faktor emisi</div><div className="mt-0.5 font-semibold">IPCC 2006 · GWP AR5</div></div>
          </div>
        </div>

        <H>Ringkasan eksekutif</H>
        <div className="grid grid-cols-3 gap-3">
          <Kpi strong label="Total emisi periode" value={<>{t2(S.total)} <span className="text-[10pt] font-normal">t CO₂e</span></>} sub={P ? `${signedPct(P.total ? S.total / P.total - 1 : null)} vs periode sebelumnya` : `${rows.length} bulan · ${S.activeDays} hari aktif`} />
          <Kpi label="Dibanding ekspektasi baseline" value={signedPct(S.delta)} sub={S.baseline ? `Ekspektasi ${t2(S.baseline)} t CO₂e` : "Belum ada baseline"} />
          <Kpi label="Intensitas per orang per hari aktif" value={<>{num(S.intensity, 3)} <span className="text-[10pt] font-normal">kg</span></>} sub={monthly.data?.baseline ? `Baseline ${num(monthly.data.baseline.perPersonActiveDay, 3)} kg · ${num(pop)} warga` : `${num(pop)} warga`} />
          <Kpi label="Rata-rata per hari aktif" value={<>{num(S.perActiveDay, 0)} <span className="text-[10pt] font-normal">kg CO₂e</span></>} />
          <Kpi label="Porsi data kuat" value={pct(S.strongShare)} sub={`Proyeksi ${pct(S.projShare)} · Aktual, Terukur, Terverifikasi`} />
          <Kpi label="Stok karbon pohon (saat ini)" value={<>{num((dash.data?.trees?.stock ?? 0) / 1000, 2)} <span className="text-[10pt] font-normal">t CO₂</span></>} sub={`${dash.data?.trees?.count ?? 0} pohon · dilaporkan terpisah`} />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 text-[9pt]">
          {([1, 2, 3] as const).map((s) => (
            <div key={s} className="rounded-xl border border-[oklch(0.9_0.01_150)] p-3">
              <div className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: SCOPE_COLOR[s] }} /><b>Scope {s}</b><span className="ml-auto tabular-nums">{pct(S.total ? S.scope[s] / S.total : 0, 1)}</span></div>
              <div className="mt-1 text-[13pt] font-semibold tabular-nums">{t2(S.scope[s])} t</div>
              <div className="text-[8pt] text-[var(--muted-foreground)]">{s === 1 ? "Bahan bakar & refrigeran" : s === 2 ? "Listrik PLN" : "Mobilitas, sampah, air limbah, kertas"}</div>
            </div>
          ))}
        </div>
        <H>Temuan utama</H>
        <ul className="list-disc space-y-1.5 pl-5 text-[10pt] leading-relaxed">
          {top && <li>Sumber terbesar adalah <b>{SOURCES[top[0]]?.label}</b> dengan {t2(top[1])} t CO₂e ({pct(S.total ? top[1] / S.total : 0, 1)} dari total).</li>}
          {S.delta !== null && <li>Total emisi <b>{S.delta <= 0 ? "lebih rendah" : "lebih tinggi"} {pct(Math.abs(S.delta), 1)}</b> dibanding ekspektasi baseline yang sudah disesuaikan jumlah warga dan kalender akademik.</li>}
          {hi && lo && hi.month !== lo.month && <li>Bulan tertinggi <b>{fmtMonth(hi.month)}</b> ({t2(hi.total)} t), terendah <b>{fmtMonth(lo.month)}</b> ({t2(lo.total)} t) — dipengaruhi jumlah hari aktif dan libur sekolah.</li>}
          <li>{pct(S.strongShare)} angka berasal dari data kuat (aktual/terukur/terverifikasi); {pct(S.projShare)} masih proyeksi yang akan diganti data aktual saat diinput.</li>
          {rows.some((r) => r.partial) && <li>Bulan {fmtMonth(rows.find((r) => r.partial)!.month)} masih berjalan; angkanya sampai {fmtDate(todayWIB())}.</li>}
        </ul>
      </section>

      {/* ================= 2. tren, tahunan & triwulan ================= */}
      <Sheet {...sheet} no="Bagian 2" title="Tren & ringkasan periode">
        <H>Emisi bulanan per scope</H>
        <MonthlyChart rows={rows} />
        <div className="mt-1 flex flex-wrap gap-4 text-[8pt] text-[var(--muted-foreground)]">
          {([1, 2, 3] as const).map((s) => <span key={s} className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: SCOPE_COLOR[s] }} />Scope {s}</span>)}
          <span className="flex items-center gap-1.5"><span className="h-0 w-5 border-t-[1.5px] border-dashed border-[#333]" />Ekspektasi baseline</span>
          <span>Batang pudar = bulan berjalan</span>
        </div>

        <H>Ringkasan tahunan</H>
        <table><thead><tr><th>Tahun</th><th className="num">Bulan</th><th className="num">Hari aktif</th><th className="num">Scope 1</th><th className="num">Scope 2</th><th className="num">Scope 3</th><th className="num">Total (t)</th><th className="num">Ekspektasi (t)</th><th className="num">Δ baseline</th><th className="num">kg/orang/hari</th></tr></thead>
          <tbody>{byYear.map((y) => <tr key={y.y}><td className="font-medium">{y.y}</td><td className="num">{y.n}</td><td className="num">{y.activeDays}</td><td className="num">{t2(y.scope[1])}</td><td className="num">{t2(y.scope[2])}</td><td className="num">{t2(y.scope[3])}</td><td className="num font-semibold">{t2(y.total)}</td><td className="num">{y.baseline ? t2(y.baseline) : "—"}</td><td className="num">{signedPct(y.delta)}</td><td className="num">{num(y.intensity, 3)}</td></tr>)}</tbody></table>

        <H>Ringkasan triwulan</H>
        <table><thead><tr><th>Triwulan</th><th className="num">Hari aktif</th><th className="num">Total (t)</th><th className="num">Ekspektasi (t)</th><th className="num">Δ baseline</th><th className="num">Data kuat</th><th className="num">kg/orang/hari</th></tr></thead>
          <tbody>{byQ.map((q) => <tr key={q.q}><td className="font-medium">{q.q}{q.partial ? " *" : ""}</td><td className="num">{q.activeDays}</td><td className="num font-semibold">{t2(q.total)}</td><td className="num">{q.baseline ? t2(q.baseline) : "—"}</td><td className="num">{signedPct(q.delta)}</td><td className="num">{pct(q.strongShare)}</td><td className="num">{num(q.intensity, 3)}</td></tr>)}</tbody></table>
        {byQ.some((q) => q.partial) && <p className="mt-1.5 text-[8pt] text-[var(--muted-foreground)]">* triwulan berjalan</p>}
      </Sheet>

      {/* ================= 3. bulanan ================= */}
      <Sheet {...sheet} no="Bagian 3" title="Ringkasan bulanan">
        <table><thead><tr><th>Bulan</th><th className="num">Aktif/hari</th><th className="num">Scope 1</th><th className="num">Scope 2</th><th className="num">Scope 3</th><th className="num">Total (t)</th><th className="num">Ekspektasi</th><th className="num">Δ</th><th className="num">kg/org/hari</th><th className="num">Data kuat</th></tr></thead>
          <tbody>
            {rows.map((r) => { const a = agg([r], pop); return (
              <tr key={r.month}><td className="font-medium">{fmtMonth(r.month)}{r.partial ? " *" : ""}</td><td className="num">{r.activeDays}/{r.days}</td><td className="num">{t2(r.scope[1] ?? 0)}</td><td className="num">{t2(r.scope[2] ?? 0)}</td><td className="num">{t2(r.scope[3] ?? 0)}</td><td className="num font-semibold">{t2(r.total)}</td><td className="num">{r.baseline ? t2(r.baseline) : "—"}</td><td className="num" style={{ color: a.delta === null ? undefined : a.delta <= 0 ? "oklch(0.45 0.12 156)" : "oklch(0.55 0.15 60)" }}>{signedPct(a.delta)}</td><td className="num">{num(r.perPersonActiveDay, 3)}</td><td className="num">{pct(a.strongShare)}</td></tr>
            ) })}
            <tr className="font-semibold"><td>Total periode</td><td className="num">{S.activeDays}/{S.days}</td><td className="num">{t2(S.scope[1])}</td><td className="num">{t2(S.scope[2])}</td><td className="num">{t2(S.scope[3])}</td><td className="num">{t2(S.total)}</td><td className="num">{S.baseline ? t2(S.baseline) : "—"}</td><td className="num">{signedPct(S.delta)}</td><td className="num">{num(S.intensity, 3)}</td><td className="num">{pct(S.strongShare)}</td></tr>
          </tbody></table>
        <p className="mt-2 text-[8pt] text-[var(--muted-foreground)]">Satuan t CO₂e. Ekspektasi = profil harian baseline (hari aktif/libur) × rasio jumlah warga, mengikuti kalender akademik. {rows.some((r) => r.partial) && "* bulan berjalan."}</p>
      </Sheet>

      {/* ================= 4. per sumber ================= */}
      <Sheet {...sheet} no="Bagian 4" title="Rincian per sumber">
        <H>Total per sumber</H>
        <table><thead><tr><th>Sumber</th><th>Scope</th><th className="num">Total (t CO₂e)</th><th className="num">Porsi</th><th className="num">Rata-rata/bulan (kg)</th><th>Kualitas data dominan</th></tr></thead>
          <tbody>{srcRows.map(([k, v]) => <tr key={k}><td><span className="mr-2 inline-block size-2.5 rounded-full align-middle" style={{ background: SOURCES[k]?.color }} />{SOURCES[k]?.label ?? k}</td><td>{sourceScope(k, org)}</td><td className="num font-semibold">{t2(v)}</td><td className="num">{pct(S.total ? v / S.total : 0, 1)}</td><td className="num">{num(v / Math.max(rows.length, 1), 0)}</td><td>{LABEL_TEXT[dominant(k) ?? ""] ?? "—"}</td></tr>)}</tbody></table>
        <div className="mt-3 flex h-3 overflow-hidden rounded-full">{srcRows.map(([k, v]) => <span key={k} style={{ width: `${S.total ? (v / S.total) * 100 : 0}%`, background: SOURCES[k]?.color }} />)}</div>

        <H>Matriks sumber × {rows.length <= 12 ? "bulan" : "triwulan"} (kg CO₂e)</H>
        <table style={{ fontSize: "7.5pt" }}><thead><tr><th>Sumber</th>{matrixCols.map((c) => <th key={c.key} className="num">{c.label}</th>)}</tr></thead>
          <tbody>
            {srcRows.map(([k]) => <tr key={k}><td className="whitespace-nowrap">{SOURCES[k]?.label ?? k}</td>{matrixCols.map((c) => <td key={c.key} className="num">{num(c.rows.reduce((s, r) => s + (r.sources[k] ?? 0), 0), 0)}</td>)}</tr>)}
            <tr className="font-semibold"><td>Total</td>{matrixCols.map((c) => <td key={c.key} className="num">{num(c.rows.reduce((s, r) => s + r.total, 0), 0)}</td>)}</tr>
          </tbody></table>
      </Sheet>

      {/* ================= 5. kualitas, metodologi, pengesahan ================= */}
      <Sheet {...sheet} no="Bagian 5" title="Kualitas data, metodologi & pengesahan">
        <H>Kualitas data periode</H>
        <table><thead><tr><th>Label</th><th className="num">kg CO₂e</th><th className="num">Porsi</th><th>Arti</th></tr></thead>
          <tbody>{Object.entries(S.labels).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([l, v]) => <tr key={l}><td className="font-medium">{LABEL_TEXT[l] ?? l}</td><td className="num">{num(v, 0)}</td><td className="num">{pct(S.total ? v / S.total : 0, 1)}</td><td className="text-[8.5pt] text-[var(--muted-foreground)]">{({ aktual: "Dari pengukuran/penimbangan langsung", terverifikasi: "Input yang sudah diverifikasi", input: "Input operator, belum diverifikasi", estimasi: "Dihitung dari asumsi/faktor default", proyeksi: "Data belum diinput — memakai data aktual terakhir atau baseline", "rata-rata": "Rata-rata sesi penimbangan terakhir", interpolasi: "Mengisi bulan kosong ≤ 2 bulan", terukur: "Hasil ukur lapangan" } as Record<string, string>)[l] ?? ""}</td></tr>)}</tbody></table>

        <H>Metodologi singkat</H>
        <ul className="list-disc space-y-1 pl-5 text-[9pt] leading-relaxed">
          <li>Emisi dihitung harian = data aktivitas × faktor emisi, mengikuti kalender akademik (hari aktif, libur, ujian, kehadiran).</li>
          <li>Tagihan bulanan (listrik, LPG, kertas, genset) dibagi ke hari aktif; bulan yang belum diinput memakai data aktual terakhir, baru kemudian profil baseline.</li>
          <li>Mobilitas dari survei (km kendaraan × faktor moda ÷ penumpang, diskalakan ke seluruh warga); sampah dari rata-rata sesi timbang terbaru; air limbah dari jumlah warga hadir.</li>
          <li>Serapan pohon dan emisi terhindar dilaporkan terpisah di Rapor Jasa Lingkungan — tidak mengurangi angka rapor ini dan bukan kredit karbon (Perpres 110/2025).</li>
        </ul>

        <H>Faktor emisi yang dipakai</H>
        <table style={{ fontSize: "8pt" }}><thead><tr><th>Faktor</th><th className="num">Nilai</th><th>Satuan</th><th>Sumber</th></tr></thead>
          <tbody>{factors.map((f) => <tr key={f.code}><td>{f.name}</td><td className="num">{num(f.value, f.value >= 100 ? 1 : f.value >= 1 ? 3 : 4)}</td><td>{f.unit}</td><td className="text-[var(--muted-foreground)]">{f.source}</td></tr>)}</tbody></table>

        <H>Pengesahan</H>
        <div className="grid grid-cols-3 gap-4 text-center text-[9pt]">
          {["Disusun oleh,\nOperator sekolah", "Disahkan oleh,\nAdmin", "Mengetahui,\nKepala sekolah"].map((s) => (
            <div key={s} className="rounded-xl border border-[oklch(0.9_0.01_150)] p-3">
              <div className="whitespace-pre-line text-[var(--muted-foreground)]">{s}</div>
              <div className="h-20" />
              <div className="border-t border-dashed border-[#999] pt-1.5">Nama & tanda tangan</div>
            </div>
          ))}
        </div>
        <p className="mt-5 text-[8pt] leading-relaxed text-[var(--muted-foreground)]">
          Dokumen kerja dibuat {generated} WIB oleh {me?.name}. ID dokumen {docId}. Rapor resmi yang sudah diverifikasi dan terkunci (dengan QR keaslian) diterbitkan melalui menu Laporan.
        </p>
      </Sheet>
      </>}
    </div>
  )
}
