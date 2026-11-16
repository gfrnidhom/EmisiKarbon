import { useQuery } from "@tanstack/react-query"
import { SourceLabel } from "@/components/source-label"
import { Download, FlaskConical } from "lucide-react"
import * as XLSX from "xlsx"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { PageHeader, PageSkeleton, QualityBadge } from "@/components/common"
import { PublicHeader } from "./landing"
import { api } from "@/lib/api"
import { num } from "@/lib/format"
import { t, tl } from "@/lib/i18n"

const FORMULAS = [
  { t: t("Rumus inti"), f: "E(CO₂e) = DA × (FE_CO₂ + 28·FE_CH₄ + 265·FE_N₂O)", d: t("GWP IPCC AR5 sesuai praktik KLHK.") },
  { t: t("Alokasi harian listrik"), f: "E_aktif = (E_bulan − n_libur × E_dasar) ÷ n_aktif ;  E_libur = E_dasar", d: t("E_dasar = beban dasar harian dari baseline (kulkas, pompa, lampu keamanan). n dari kalender akademik.") },
  { t: t("Sampah rata-rata harian"), f: "E(hari) = k_hari × (N_sekarang ÷ N_baseline) × Σ W̄(j,p) × FE(j,p)", d: tl("W̄ dari sesi penimbangan (SNI 19-3964-1994: 8 hari sekolah); rata-rata bergulir 2 sesi terakhir. Faktor TPA IPCC 2006 Vol.5 (MCF 0,6, metode komitmen); kompos IPCC Tabel 4.1.", "W̄ from weighing sessions (SNI 19-3964-1994: 8 school days); rolling average of the last 2 sessions. Landfill factors IPCC 2006 Vol.5 (MCF 0.6, commitment method); compost IPCC Table 4.1.") },
  { t: tl("Klasifikasi scope (GHG Protocol)", "Scope classification (GHG Protocol)"), f: "Scope 1 = sumber milik sekolah ; Scope 2 = listrik dibeli ; Scope 3 = rantai nilai", d: tl("Scope 1: LPG, genset, refrigeran AC, sampah yang dikompos/dibakar di sekolah, tangki septik sekolah. Scope 2: listrik PLN (location-based). Scope 3: perjalanan warga (kat. 7), sampah ke TPA (kat. 5), kertas (kat. 1), air limbah yang dialirkan ke luar sekolah.", "Scope 1: LPG, generator, AC refrigerant, waste composted/burned on site, the school's septic tank. Scope 2: grid electricity (location-based). Scope 3: commuting (cat. 7), waste to landfill (cat. 5), paper (cat. 1), wastewater sent off site.") },
  { t: tl("Genset biosolar B40", "B40 biodiesel generator"), f: "E = L × (FE_CO₂ solar × 60% + FE_CH₄/N₂O)", d: tl("CO₂ dari porsi biodiesel (40%) adalah biogenik: dilaporkan terpisah, tidak masuk total. CH₄ & N₂O tetap dihitung untuk seluruh volume (IPCC 2006 Vol.2, Kepmen ESDM 341.K/2024).", "CO₂ from the 40% biodiesel share is biogenic: reported separately, not in the total. CH₄ & N₂O count for the full volume (IPCC 2006 Vol.2).") },
  { t: tl("Air limbah", "Wastewater"), f: "E(hari) = N_hadir × BOD 40 g × B₀ 0,6 × MCF × 33% × GWP_CH₄", d: tl("IPCC 2006 Vol.5 Bab 6. MCF tangki septik 0,5; saluran/drainase 0,1; IPAL aerobik 0. 33% = porsi waktu sehari di sekolah.", "IPCC 2006 Vol.5 Ch.6. MCF septic tank 0.5; open drain 0.1; aerobic plant 0. 33% = share of the day spent at school.") },
  { t: t("Mobilitas km kendaraan"), f: "E(hari) = Σ (2·d·f_antar·FE_moda ÷ o) × (h ÷ h_sekolah) × (N ÷ N_responden)", d: t("f_antar 2 bila pengantar bolak-balik; o = orang per kendaraan; angkot dibagi penumpang rata-rata 8.") },
  { t: t("Refrigeran"), f: "E = Σ isi ulang(kg) × GWP   atau   Σ muatan × laju bocor × GWP", d: t("Metode isi ulang diutamakan; laju bocor default IPCC 2019 Refinement Vol.3 Tabel 7.9.") },
  { t: t("Pohon"), f: "Stok CO₂ = C × 44/12 ;  D(t) = D_ukur + r × (t − t_ukur)/365 ;  r = (D₂ − D₁) ÷ ((t₂ − t₁)/365)", d: tl("Urutan pilihan (SNI 7724:2011 — utamakan persamaan lokal): (1) persamaan lokal jenis, mis. Mahoni C = 0,044 × D^2,541 (Perhutani); Jati AGB = 0,054 × D^2,579 (Siregar 2011); Sengon 0,0272 × D^2,831 (Sugiharto 2002); Akasia 0,070 × D^2,58 (Krisnawati dkk. 2015); bila tinggi diukur dan tersedia, a_h × (D²H)^b_h. (2) Model umum + berat jenis ρ: Chave 2014 AGB = 0,0673 × (ρD²H)^0,976 bila ada tinggi; tanpa tinggi Ketterings 2001 0,11 × ρ × D^2,62 atau Chave 2005 hutan lembap. Biomassa total = AGB × (1 + rasio akar 0,24, IPCC); karbon = × 0,47; CO₂ = × 44/12. Palem & bambu tidak dihitung. Pohon < 5 cm tidak dihitung; di luar rentang DBH valid ditandai ekstrapolasi. Proyeksi berhenti bila > 12 bulan tanpa ukur ulang.", "Order of choice (SNI 7724:2011 — prefer local equations): (1) species-specific local equations, e.g. mahogany C = 0.044 × D^2.541; teak AGB = 0.054 × D^2.579 (Siregar 2011); sengon 0.0272 × D^2.831 (Sugiharto 2002); acacia 0.070 × D^2.58 (Krisnawati et al. 2015); with height, a_h × (D²H)^b_h when available. (2) Generic + wood density ρ: Chave 2014 0.0673 × (ρD²H)^0.976 with height; without height Ketterings 2001 0.11 × ρ × D^2.62 or Chave 2005 moist. Total biomass = AGB × (1 + root ratio 0.24, IPCC); carbon × 0.47; CO₂ × 44/12. Palms & bamboo excluded. Trees < 5 cm excluded; outside the valid DBH range flagged as extrapolated. Projection stops after 12 months without remeasurement.") },
  { t: t("Emisi terhindar"), f: "Kompos = kg × (FE_TPA − FE_kompos) ;  Kertas = kg × 2,24 ;  PLTS = kWh × FE grid", d: t("Dilaporkan terpisah — tidak mengurangi Rapor Karbon. LED & jalan kaki tidak dihitung ganda.") },
]

export default function Methodology() {
  const { data, isLoading } = useQuery({ queryKey: ["methodology"], queryFn: () => api<any>("/public/methodology") })
  const download = () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.factors), "Faktor_Emisi")
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.species), "Jenis_Pohon")
    XLSX.writeFile(wb, "sekolah-lestari-faktor-emisi.xlsx")
  }
  return (
    <div className="min-h-svh">
      <PublicHeader />
      <div className="mx-auto max-w-6xl px-4 py-8">
        <PageHeader icon={FlaskConical} title={t("Metodologi")} description={t("Rumus, faktor emisi aktif, sumber, dan versi. Setiap angka di dasbor dapat ditelusuri ke sini.")}
          actions={data && <Button variant="outline" onClick={download}><Download /> {t("Unduh tabel (.xlsx)")}</Button>} />
        <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
          <Card>
            <CardHeader><CardTitle>{t("Rumus")}</CardTitle><CardDescription>{t("PRD §7 — spesifikasi perhitungan")}</CardDescription></CardHeader>
            <CardContent>
              <Accordion defaultValue={["0"]}>
                {FORMULAS.map((f, i) => (
                  <AccordionItem key={f.t} value={String(i)}>
                    <AccordionTrigger>{f.t}</AccordionTrigger>
                    <AccordionContent>
                      <code className="block rounded-lg bg-muted px-3 py-2 font-mono text-xs leading-relaxed">{f.f}</code>
                      <p className="mt-2 text-sm text-muted-foreground">{f.d}</p>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>{t("Faktor emisi aktif")}</CardTitle><CardDescription>{t("Pustaka berversi — faktor aktif hanya bisa digantikan versi baru")}</CardDescription></CardHeader>
            <CardContent className="px-0">
              {isLoading ? <div className="px-6"><PageSkeleton /></div> : (
                <div className="max-h-[40rem] overflow-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead className="pl-6">{t("Uraian")}</TableHead><TableHead className="text-right">{t("Nilai")}</TableHead><TableHead>{t("Sumber")}</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {data.factors.map((f: any) => (
                        <TableRow key={f.code}>
                          <TableCell className="max-w-56 whitespace-normal pl-6 text-sm">{f.name}{f.non_national ? <QualityBadge label={t("non-nasional")} className="ml-1" /> : null}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{num(f.value, f.value < 1 ? 4 : 3)}<div className="text-[0.625rem] text-muted-foreground">{f.unit}</div></TableCell>
                          <TableCell className="max-w-48 whitespace-normal text-xs text-muted-foreground"><SourceLabel source={f.source} url={f.url} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
