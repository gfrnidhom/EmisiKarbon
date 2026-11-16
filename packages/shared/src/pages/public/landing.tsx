import { useEffect, useRef, useState, type ReactNode } from "react"
import { Link } from "react-router-dom"
import {
  ArrowRight, BadgeCheck, Bike, Building2, CalendarClock, Check, ChevronDown, ClipboardCheck, Eye, FileCheck2, Footprints, GraduationCap, Heart, Leaf,
  Lightbulb, Menu, Recycle, ShieldCheck, Sprout, Trees, UserRound, Users, Utensils, X, type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Brand, LangToggle, ThemeToggle } from "@/components/app-shell"
import { tl } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/* ============================== header ============================== */
const NAV = [
  { href: "#about", id: "Tentang", en: "About" },
  { href: "#movement", id: "Gerakan", en: "Movement" },
  { href: "#how-it-works", id: "Cara kerja", en: "How it works" },
  { href: "#faq", id: "FAQ", en: "FAQ" },
]

export function PublicHeader() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [progress, setProgress] = useState(0)
  const [active, setActive] = useState<string>("")
  const onLanding = location.pathname === "/" || location.pathname === "/home"
  useEffect(() => {
    const h = () => {
      setScrolled(window.scrollY > 8)
      const max = document.documentElement.scrollHeight - window.innerHeight
      setProgress(max > 0 ? Math.min(window.scrollY / max, 1) : 0)
      if (onLanding) {
        let cur = ""
        for (const n of NAV) { const el = document.querySelector(n.href); if (el && el.getBoundingClientRect().top <= 120) cur = n.href }
        setActive(cur)
      }
    }
    h(); window.addEventListener("scroll", h, { passive: true }); window.addEventListener("resize", h)
    return () => { window.removeEventListener("scroll", h); window.removeEventListener("resize", h) }
  }, [onLanding])
  useEffect(() => { document.body.style.overflow = open ? "hidden" : ""; return () => { document.body.style.overflow = "" } }, [open])
  const link = (href: string) => (onLanding ? href : `/${href}`)
  return (
    <header className={cn("sticky top-0 z-50 w-full transition-all duration-300", scrolled || open ? "border-b border-border/70 bg-background/85 shadow-[0_1px_0_0_rgb(0_0_0/0.02),0_8px_24px_-12px_rgb(0_0_0/0.12)] backdrop-blur-xl" : "border-b border-transparent bg-transparent")}>
      <div className={cn("mx-auto flex max-w-6xl items-center gap-6 px-4 transition-all duration-300 sm:px-6", scrolled ? "h-16" : "h-20")}>
        <Brand />
        <nav className="hidden h-full items-center gap-1 lg:ml-6 lg:flex">
          {NAV.map((n) => (
            <a key={n.href} href={link(n.href)} className={cn("relative flex h-full items-center px-3.5 text-[0.9375rem] font-medium transition-colors", active === n.href ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {tl(n.id, n.en)}
              <span className={cn("absolute inset-x-3.5 bottom-0 h-0.5 rounded-full bg-primary transition-transform duration-300", active === n.href ? "scale-x-100" : "scale-x-0")} />
            </a>
          ))}
          <Link to="/methodology" className={cn("flex h-full items-center px-3.5 text-[0.9375rem] font-medium transition-colors", location.pathname === "/methodology" ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>{tl("Metodologi", "Methodology")}</Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <LangToggle className="hidden sm:inline-flex" />
          <ThemeToggle />
          <span className="mx-1 hidden h-6 w-px bg-border sm:block" />
          <Link to="/login" className="hidden px-2 text-[0.9375rem] font-medium text-muted-foreground transition-colors hover:text-foreground sm:block">{tl("Masuk", "Sign in")}</Link>
          <Button className="hidden h-10 px-5 sm:inline-flex" render={<Link to="/register" />}>{tl("Gabung", "Join")} <ArrowRight /></Button>
          <Button size="icon" variant="ghost" className="lg:hidden" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</Button>
        </div>
      </div>
      {/* progres baca */}
      {onLanding && <span className="absolute bottom-[-1px] left-0 h-0.5 bg-primary transition-[width] duration-150" style={{ width: `${progress * 100}%` }} />}
      {/* menu HP */}
      {open && (
        <div className="animate-fade-up border-t border-border/70 bg-background px-4 pt-3 pb-6 lg:hidden">
          <nav className="mx-auto max-w-6xl">
            {NAV.map((n) => <a key={n.href} href={link(n.href)} onClick={() => setOpen(false)} className="flex items-center justify-between border-b border-border/60 py-4 text-lg font-medium">{tl(n.id, n.en)}<ArrowRight className="size-4 text-muted-foreground" /></a>)}
            <Link to="/methodology" onClick={() => setOpen(false)} className="flex items-center justify-between border-b border-border/60 py-4 text-lg font-medium">{tl("Metodologi", "Methodology")}<ArrowRight className="size-4 text-muted-foreground" /></Link>
            <div className="mt-5 flex items-center justify-between"><LangToggle /></div>
            <div className="mt-4 grid grid-cols-2 gap-2"><Button variant="outline" size="lg" render={<Link to="/login" />}>{tl("Masuk", "Sign in")}</Button><Button size="lg" render={<Link to="/register" />}>{tl("Gabung", "Join")}</Button></div>
          </nav>
        </div>
      )}
    </header>
  )
}

/* ============================== animasi ============================== */
/** Muncul halus saat elemen masuk layar. */
function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [inView, setIn] = useState(false)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setIn(true); io.disconnect() } }, { threshold: 0.15 })
    io.observe(el); return () => io.disconnect()
  }, [])
  return <div ref={ref} className={cn("reveal", inView && "in", className)} style={{ transitionDelay: `${delay}ms` }}>{children}</div>
}
function SectionTitle({ eyebrow, title, text, center }: { eyebrow: string; title: ReactNode; text?: string; center?: boolean }) {
  return (
    <Reveal className={cn("max-w-2xl", center && "mx-auto text-center")}>
      <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold tracking-wide text-primary uppercase"><Leaf className="size-3.5" />{eyebrow}</span>
      <h2 className="mt-4 text-3xl font-semibold tracking-tight text-balance sm:text-[2.5rem] sm:leading-[1.1]">{title}</h2>
      {text && <p className="mt-4 text-[1.0625rem] leading-relaxed text-pretty text-muted-foreground">{text}</p>}
    </Reveal>
  )
}

/** Visual modern: bola bumi bergradasi, cincin orbit berputar, dan kartu kaca aksi yang melayang. */
export function HeroArt({ framed = true }: { framed?: boolean } = {}) {
  const chips: { icon: LucideIcon; id: string; en: string; pos: string; delay: string }[] = [
    { icon: Lightbulb, id: "Hemat energi", en: "Save energy", pos: "top-[10%] left-[2%]", delay: "0s" },
    { icon: Recycle, id: "Pilah sampah", en: "Sort waste", pos: "top-[16%] right-[0%]", delay: "-2s" },
    { icon: Trees, id: "Tanam pohon", en: "Plant trees", pos: "bottom-[16%] left-[0%]", delay: "-4s" },
    { icon: Footprints, id: "Jalan kaki", en: "Walk more", pos: "bottom-[10%] right-[4%]", delay: "-1s" },
  ]
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[32.5rem] select-none">
      {framed && <div className="absolute inset-[6%] rounded-full bg-gradient-to-b from-primary/10 to-transparent" />}
      {/* cahaya */}
      <div className="anim-glow absolute inset-[18%] rounded-full bg-primary/35 blur-3xl" />
      {/* cincin orbit */}
      <svg viewBox="0 0 400 400" className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <radialGradient id="orb" cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="color-mix(in srgb, var(--primary) 35%, white)" />
            <stop offset="45%" stopColor="var(--primary)" />
            <stop offset="100%" stopColor="var(--primary-deep)" />
          </radialGradient>
          <radialGradient id="shine" cx="30%" cy="25%" r="35%"><stop offset="0%" stopColor="white" stopOpacity=".55" /><stop offset="100%" stopColor="white" stopOpacity="0" /></radialGradient>
          <clipPath id="orb-clip"><circle cx="200" cy="200" r="92" /></clipPath>
        </defs>
        <g className="anim-spin-slow" style={{ transformOrigin: "200px 200px" }}>
          <circle cx="200" cy="200" r="182" fill="none" stroke="var(--primary)" strokeOpacity=".18" strokeDasharray="2 10" strokeWidth="2" strokeLinecap="round" />
          <circle cx="382" cy="200" r="6" fill="var(--primary)" />
        </g>
        <g className="anim-spin-rev" style={{ transformOrigin: "200px 200px" }}>
          <circle cx="200" cy="200" r="148" fill="none" stroke="var(--primary)" strokeOpacity=".28" strokeWidth="1.5" />
          <circle cx="200" cy="52" r="9" fill="oklch(0.85 0.14 85)" />
          <circle cx="95" cy="305" r="5" fill="var(--primary-deep)" />
        </g>
        <g className="anim-spin-mid" style={{ transformOrigin: "200px 200px" }}>
          <ellipse cx="200" cy="200" rx="128" ry="46" fill="none" stroke="var(--primary)" strokeOpacity=".35" strokeWidth="1.5" transform="rotate(-24 200 200)" />
        </g>
        {/* bola bumi */}
        <circle cx="200" cy="200" r="92" fill="url(#orb)" />
        <g clipPath="url(#orb-clip)" fill="none" stroke="white" strokeOpacity=".22" strokeWidth="1.2">
          <g className="anim-spin-slow" style={{ transformOrigin: "200px 200px" }}>
            {[-60, -30, 0, 30, 60].map((d) => <ellipse key={d} cx="200" cy="200" rx={Math.abs(Math.cos((d * Math.PI) / 180)) * 92 || 1} ry="92" />)}
          </g>
          {[-55, -25, 5, 35, 65].map((y) => <ellipse key={y} cx="200" cy={200 + y} rx={Math.sqrt(Math.max(92 * 92 - y * y, 0))} ry="10" />)}
        </g>
        <circle cx="200" cy="200" r="92" fill="url(#shine)" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center"><span className="anim-float flex size-[16%] items-center justify-center rounded-full bg-white/15 ring-1 ring-white/40 backdrop-blur-sm"><Leaf className="size-1/2 text-white drop-shadow" strokeWidth={2} /></span></div>
      {/* kartu kaca melayang */}
      {chips.map((c) => (
        <div key={c.id} className={cn("anim-float absolute flex items-center gap-2.5 rounded-2xl bg-card/75 py-2.5 pr-4 pl-2.5 shadow-xl shadow-primary/10 ring-1 ring-white/60 backdrop-blur-md dark:ring-white/10", c.pos)} style={{ animationDelay: c.delay }}>
          <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-deep text-white"><c.icon className="size-[1.125rem]" /></span>
          <span className="text-sm font-semibold whitespace-nowrap">{tl(c.id, c.en)}</span>
        </div>
      ))}
    </div>
  )
}

/* ============================== konten ============================== */
const TAGS = ["#HematEnergi", "#PilahSampah", "#TanamPohon", "#JalanKakiKeSekolah", "#BekalTanpaPlastik", "#MatikanLampu", "#KomposDiSekolah", "#SekolahLestari", "#BersepedaItuKeren", "#AirBijak"]
const ACTIONS: { icon: LucideIcon; tag: string; id: string; en: string; tid: string; ten: string; color: string }[] = [
  { icon: Lightbulb, tag: "#HematEnergi", id: "Hemat energi", en: "Save energy", tid: "Matikan lampu & AC saat kelas kosong, pakai lampu LED, cabut charger yang tidak dipakai.", ten: "Switch off lights & AC in empty classrooms, use LED bulbs, unplug idle chargers.", color: "oklch(0.76 0.13 78)" },
  { icon: Bike, tag: "#JalanKakiKeSekolah", id: "Berangkat hijau", en: "Green commute", tid: "Jalan kaki, bersepeda, atau berbagi kendaraan ke sekolah — sehat dan rendah emisi.", ten: "Walk, cycle or share rides to school — healthy and low-emission.", color: "oklch(0.55 0.12 155)" },
  { icon: Recycle, tag: "#PilahSampah", id: "Pilah & kompos", en: "Sort & compost", tid: "Pisahkan organik, kertas, dan plastik. Sisa makanan jadi kompos untuk kebun sekolah.", ten: "Separate organics, paper and plastic. Food scraps become compost for the school garden.", color: "oklch(0.62 0.09 112)" },
  { icon: Trees, tag: "#TanamPohon", id: "Tanam & rawat pohon", en: "Plant & care for trees", tid: "Setiap pohon ber-QR dipantau pertumbuhannya oleh siswa — belajar sambil merawat.", ten: "Every QR-tagged tree is monitored by students — learning by caring.", color: "oklch(0.48 0.115 156)" },
  { icon: Utensils, tag: "#BekalTanpaPlastik", id: "Bekal bijak", en: "Smart lunchbox", tid: "Bawa wadah & botol sendiri, pilih lauk lokal, habiskan makanan.", ten: "Bring your own box & bottle, choose local food, finish your meal.", color: "oklch(0.62 0.15 40)" },
  { icon: GraduationCap, tag: "#SekolahLestari", id: "Belajar iklim", en: "Climate learning", tid: "Data emisi sekolah jadi bahan ajar: matematika, IPA, hingga proyek P5.", ten: "School emissions data becomes learning material: maths, science, project work.", color: "oklch(0.55 0.1 230)" },
]
const STEPS: { icon: LucideIcon; id: string; en: string; tid: string; ten: string }[] = [
  { icon: ClipboardCheck, id: "Survei awal sekali", en: "One-time baseline", tid: "Sekolah mencatat kondisi awal: listrik, transportasi, sampah, dan pohon.", ten: "The school records its starting point: power, transport, waste and trees." },
  { icon: BadgeCheck, id: "Disahkan", en: "Approved", tid: "Operator meng-ACC data petugas dan Admin mengesahkan Survei Awal agar angka bisa dipercaya.", ten: "The operator approves officers' data and the Admin signs off the Baseline Survey so the numbers can be trusted." },
  { icon: CalendarClock, id: "Dipantau tiap hari", en: "Tracked daily", tid: "Emisi dihitung otomatis mengikuti kalender sekolah — tanpa input harian.", ten: "Emissions are calculated automatically with the school calendar — no daily input." },
  { icon: FileCheck2, id: "Rapor & aksi", en: "Report & act", tid: "Rapor Karbon dan Jasa Lingkungan jadi dasar aksi pengurangan bersama.", ten: "Carbon and Eco Services reports guide shared reduction actions." },
]
const PLEDGES: [string, string][] = [
  ["Saya mematikan lampu saat keluar ruangan", "I switch off lights when leaving a room"],
  ["Saya membawa botol minum sendiri", "I bring my own water bottle"],
  ["Saya memilah sampah organik & anorganik", "I sort organic & inorganic waste"],
  ["Saya berjalan kaki/bersepeda untuk jarak dekat", "I walk or cycle for short trips"],
  ["Saya ikut merawat pohon di sekolah", "I help care for trees at school"],
  ["Saya menghabiskan makanan saya", "I finish my food"],
]
const ROLES = [
  { id: "Siswa & guru", en: "Students & teachers", icon: GraduationCap, tid: "Mengisi survei perjalanan lewat tautan atau QR — tanpa akun, tanpa login. Lalu ikut aksi harian sekolah.", ten: "Fill in the travel survey via a link or QR — no account, no login. Then join the school's daily actions." },
  { id: "Petugas monitoring", en: "Monitoring officer", icon: Sprout, tid: "Mengisi data bulanan, mengukur pohon, dan menimbang sampah dari HP. Datanya di-ACC operator.", ten: "Enters monthly data, measures trees and weighs waste from a phone. The operator approves it." },
  { id: "Operator sekolah", en: "School operator", icon: UserRound, tid: "Mengelola Survei Awal dan meng-ACC data petugas — sisanya dihitung otomatis.", ten: "Runs the Baseline Survey and approves the officers' data — the rest is automatic." },
  { id: "Kepala sekolah", en: "Principal", icon: Building2, tid: "Melihat dasbor dan rapor sekolah kapan saja, tanpa perlu mengisi data.", ten: "Views the school dashboard and reports any time, without entering data." },
  { id: "Masyarakat", en: "The public", icon: Users, tid: "Daftar gratis untuk menghitung jejak karbon pribadi dan ikut gerakan dari rumah.", ten: "Register free to calculate a personal footprint and join the movement from home." },
]
const FAQ: [string, string, string, string][] = [
  ["Apa itu Gerakan Sekolah Lestari?", "What is the Sekolah Lestari movement?", "Gerakan bersama sekolah, siswa, guru, dan masyarakat untuk mengenali, menghitung, dan mengurangi jejak karbon — dimulai dari lingkungan sekolah.", "A shared movement of schools, students, teachers and the public to understand, measure and reduce carbon footprints — starting at school."],
  ["Bagaimana sekolah bisa bergabung?", "How can a school join?", "Sekolah didaftarkan oleh Admin. Operator sekolah lalu menerima undangan untuk mengisi survei awal.", "Schools are enrolled by the program coordinator. The school operator then receives an invitation to fill in the baseline."],
  ["Saya bukan dari sekolah, bisakah ikut?", "I'm not from a school — can I join?", "Bisa. Daftar sebagai pengguna umum untuk menghitung jejak karbon pribadi dan mengambil komitmen aksi.", "Yes. Register as a public user to calculate your personal footprint and commit to actions."],
  ["Apakah ini kredit karbon?", "Is this a carbon credit?", "Bukan. Sekolah Lestari adalah alat edukasi dan pelaporan internal (Perpres 110/2025), bukan perdagangan karbon.", "No. Sekolah Lestari is a learning and internal reporting tool (Presidential Reg. 110/2025), not carbon trading."],
]

/* ============================== halaman ============================== */
export default function Landing() {
  const [role, setRole] = useState(0)
  const [faq, setFaq] = useState<number | null>(0)
  const [pledge, setPledge] = useState<Record<number, boolean>>({})
  const picked = Object.values(pledge).filter(Boolean).length
  const R = ROLES[role]

  return (
    <div className="min-h-svh overflow-x-clip bg-background">
      <PublicHeader />

      {/* ---------- hero kampanye ---------- */}
      <section className="relative px-4 pt-10 pb-16 sm:pt-16 sm:pb-24">
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_at_top,black,transparent_65%)]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1.05fr_1fr]">
          <div className="animate-fade-up">
            <span className="inline-flex items-center gap-2 rounded-full bg-card px-3 py-1.5 text-xs font-medium shadow-sm ring-1 ring-border">
              <span className="relative flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground"><span className="anim-pulse-ring absolute inset-0 rounded-full bg-primary" /><Sprout className="relative size-3" /></span>
              {tl("Gerakan Sekolah Lestari", "The Sekolah Lestari Movement")}
            </span>
            <h1 className="mt-6 text-[2.75rem] leading-[1.04] font-semibold tracking-tight text-balance sm:text-6xl lg:text-[4.25rem]">
              {tl("Sekolah bergerak,", "Schools move,")}{" "}
              <span className="relative text-primary sm:whitespace-nowrap">{tl("bumi bernapas.", "the planet breathes.")}
                <svg className="absolute -bottom-2 left-0 w-full text-primary/30" viewBox="0 0 300 12" preserveAspectRatio="none" aria-hidden><path d="M2 9 C 80 2, 220 2, 298 8" stroke="currentColor" strokeWidth="5" fill="none" strokeLinecap="round" /></svg>
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground">
              {tl("Sekolah Lestari mengajak sekolah, siswa, guru, dan keluarga untuk mengenali jejak karbon, lalu bersama-sama menguranginya lewat aksi kecil yang konsisten — dimulai dari ruang kelas.",
                "Sekolah Lestari invites schools, students, teachers and families to understand their carbon footprint and reduce it together through small, consistent actions — starting in the classroom.")}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" className="h-13 px-7 text-base shadow-lg shadow-primary/20" render={<Link to="/register" />}><Heart /> {tl("Gabung gerakan", "Join the movement")}</Button>
              <Button size="lg" variant="outline" className="h-13 px-7 text-base" render={<a href="#about" />}>{tl("Kenali kami", "Get to know us")}</Button>
            </div>
          </div>
          <div className="animate-fade-up" style={{ animationDelay: "150ms" }}><HeroArt /></div>
        </div>
      </section>

      {/* ---------- tagar bergerak ---------- */}
      <div className="relative overflow-hidden border-y border-primary/15 bg-primary py-4 text-primary-foreground">
        <div className="animate-marquee flex w-max gap-10 whitespace-nowrap">
          {[...TAGS, ...TAGS].map((t, i) => <span key={i} className="flex items-center gap-10 text-lg font-semibold tracking-tight">{t}<Leaf className="size-4 opacity-60" /></span>)}
        </div>
      </div>

      {/* ---------- tentang ---------- */}
      <section id="about" className="scroll-mt-28 px-4 py-20 sm:py-28">
        <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <SectionTitle eyebrow={tl("Tentang kami", "About us")} title={tl("Mengubah sekolah menjadi pusat aksi iklim.", "Turning schools into hubs of climate action.")}
              text={tl("Sekolah Lestari adalah platform dan gerakan yang membantu sekolah memahami dari mana emisinya berasal — listrik, perjalanan, sampah — dan merayakan setiap upaya hijau, dari menanam pohon hingga memilah sampah.", "Sekolah Lestari is a platform and movement that helps schools understand where their emissions come from — power, travel, waste — and celebrate every green effort, from planting trees to sorting waste.")} />
            <Reveal delay={150} className="mt-8 grid gap-3 sm:grid-cols-3">
              {[[Eye, tl("Terbuka", "Transparent"), tl("Setiap angka bisa ditelusuri", "Every number is traceable")], [ShieldCheck, tl("Terpercaya", "Trusted"), tl("Diverifikasi & dikunci", "Verified & locked")], [Heart, tl("Bersama", "Together"), tl("Melibatkan seluruh warga", "Involves everyone")]].map(([I, a, b]: any) => (
                <div key={a} className="rounded-2xl bg-card p-4"><I className="size-5 text-primary" /><div className="mt-2 font-semibold">{a}</div><div className="text-xs text-muted-foreground">{b}</div></div>
              ))}
            </Reveal>
          </div>
          <div className="grid gap-4">
            <Reveal delay={100}>
              <div className="relative overflow-hidden rounded-[2rem] bg-primary-deep p-8 text-white">
                <div className="pointer-events-none absolute inset-0 opacity-60" style={{ backgroundImage: "repeating-radial-gradient(circle at 100% 0%, transparent 0 18px, rgb(255 255 255 / 0.05) 18px 20px)" }} />
                <div className="relative"><div className="text-xs tracking-[0.2em] text-white/70 uppercase">{tl("Visi", "Vision")}</div>
                  <p className="mt-3 text-2xl leading-snug font-semibold">{tl("Setiap sekolah di Indonesia mengenal jejak karbonnya dan menjadi teladan gaya hidup rendah emisi.", "Every school in Indonesia knows its carbon footprint and models a low-emission way of life.")}</p></div>
              </div>
            </Reveal>
            <Reveal delay={220}>
              <div className="rounded-[2rem] bg-card p-8">
                <div className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">{tl("Misi", "Mission")}</div>
                <ul className="mt-4 space-y-3">
                  {[["Membuat pengukuran emisi sekolah mudah dan bisa dipercaya", "Make school emissions measurement easy and trustworthy"], ["Menjadikan data iklim sebagai bahan belajar yang hidup", "Turn climate data into living learning material"], ["Menggerakkan aksi nyata di sekolah dan di rumah", "Drive real action at school and at home"]].map(([a, b]) => (
                    <li key={a} className="flex items-start gap-3"><span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="size-3.5" /></span><span className="text-[0.9375rem]">{tl(a, b)}</span></li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ---------- gerakan ---------- */}
      <section id="movement" className="scroll-mt-28 bg-card/50 px-4 py-20 sm:py-28">
        <div className="mx-auto max-w-6xl">
          <SectionTitle center eyebrow={tl("Gerakan", "The movement")} title={tl("Enam aksi kecil, dampak besar.", "Six small actions, big impact.")} text={tl("Pilih satu aksi hari ini. Lakukan bersama teman sekelas, keluarga, dan tetangga.", "Pick one action today. Do it with classmates, family and neighbours.")} />
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {ACTIONS.map((a, i) => (
              <Reveal key={a.tag} delay={i * 90}>
                <div className="group h-full rounded-[1.75rem] bg-card p-7 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-primary/10">
                  <div className="flex items-start justify-between">
                    <span className="flex size-14 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6" style={{ background: `color-mix(in srgb, ${a.color} 16%, transparent)`, color: a.color }}><a.icon className="size-7" strokeWidth={1.8} /></span>
                    <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">{a.tag}</span>
                  </div>
                  <h3 className="mt-6 text-xl font-semibold">{tl(a.id, a.en)}</h3>
                  <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted-foreground">{tl(a.tid, a.ten)}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- cara kerja ---------- */}
      <section id="how-it-works" className="scroll-mt-28 px-4 py-20 sm:py-28">
        <div className="mx-auto max-w-6xl">
          <SectionTitle eyebrow={tl("Cara kerja", "How it works")} title={tl("Dari survei awal ke aksi bersama.", "From baseline to shared action.")} />
          <div className="relative mt-14 grid gap-6 md:grid-cols-4">
            <div className="absolute top-8 right-[12%] left-[12%] hidden h-0.5 bg-gradient-to-r from-primary/10 via-primary/50 to-primary/10 md:block" />
            {STEPS.map((s, i) => (
              <Reveal key={s.id} delay={i * 120} className="relative text-center">
                <span className="relative mx-auto flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 ring-8 ring-background"><s.icon className="size-7" /></span>
                <div className="mt-5 text-xs font-semibold text-primary">0{i + 1}</div>
                <h3 className="mt-1 text-lg font-semibold">{tl(s.id, s.en)}</h3>
                <p className="mx-auto mt-2 max-w-60 text-sm leading-relaxed text-muted-foreground">{tl(s.tid, s.ten)}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- ikrar ---------- */}
      <section className="px-4 pb-20 sm:pb-28">
        <Reveal className="mx-auto grid max-w-6xl gap-8 overflow-hidden rounded-[2.25rem] bg-card p-6 sm:p-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <div>
            <SectionTitle eyebrow={tl("Ikrar hijau", "Green pledge")} title={tl("Mulai dari dirimu sendiri.", "Start with yourself.")} text={tl("Centang ikrar yang ingin kamu lakukan minggu ini. Lalu daftar untuk mencatat dan menghitung jejakmu.", "Tick the pledges you want to keep this week. Then sign up to track and calculate your footprint.")} />
            <div className="mt-8 flex items-center gap-4">
              <div className="relative flex size-20 items-center justify-center">
                <svg viewBox="0 0 80 80" className="absolute inset-0 -rotate-90"><circle cx="40" cy="40" r="34" fill="none" stroke="var(--muted)" strokeWidth="8" /><circle cx="40" cy="40" r="34" fill="none" stroke="var(--primary)" strokeWidth="8" strokeLinecap="round" strokeDasharray={213.6} strokeDashoffset={213.6 * (1 - picked / PLEDGES.length)} className="transition-all duration-500" /></svg>
                <Sprout className={cn("size-8 text-primary transition-transform duration-500", picked > 0 && "scale-125")} />
              </div>
              <div><div className="text-2xl font-semibold">{picked}/{PLEDGES.length}</div><div className="text-sm text-muted-foreground">{picked === PLEDGES.length ? tl("Luar biasa! Kamu siap bergabung 🌱", "Amazing! You're ready to join 🌱") : tl("ikrar dipilih", "pledges chosen")}</div></div>
            </div>
            <Button size="lg" className="mt-6 h-12 px-6" render={<Link to="/register" />}>{tl("Gabung & mulai catat", "Join & start tracking")} <ArrowRight /></Button>
          </div>
          <div className="grid gap-2.5">
            {PLEDGES.map(([a, b], i) => (
              <button key={a} onClick={() => setPledge({ ...pledge, [i]: !pledge[i] })} className={cn("flex items-center gap-3 rounded-2xl p-4 text-left transition-all", pledge[i] ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "bg-muted/60 hover:bg-muted")}>
                <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full", pledge[i] ? "anim-pop bg-white text-primary" : "bg-card ring-1 ring-border")}>{pledge[i] && <Check className="size-4" />}</span>
                <span className="text-[0.9375rem] font-medium">{tl(a, b)}</span>
              </button>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ---------- untuk siapa ---------- */}
      <section className="px-4 pb-20 sm:pb-28">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <div>
            <SectionTitle eyebrow={tl("Untuk semua", "For everyone")} title={tl("Setiap orang punya peran.", "Everyone has a role.")} />
            <Reveal delay={120} className="mt-8 flex flex-wrap gap-2">
              {ROLES.map((x, i) => (
                <button key={x.id} onClick={() => setRole(i)} className={cn("inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition-all", i === role ? "bg-primary text-primary-foreground shadow-md" : "bg-card hover:bg-muted")}><x.icon className="size-4" />{tl(x.id, x.en)}</button>
              ))}
            </Reveal>
          </div>
          <div key={role} className="animate-fade-up rounded-[2rem] bg-gradient-to-br from-primary to-primary-deep p-8 text-white dark:from-primary/55">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-white/15"><R.icon className="size-6" /></span>
            <h3 className="mt-6 text-2xl font-semibold">{tl(R.id, R.en)}</h3>
            <p className="mt-3 text-[1.0625rem] leading-relaxed text-white/85">{tl(R.tid, R.ten)}</p>
            <Link to={role === 3 ? "/register" : "/login"} className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-primary-deep transition-transform hover:translate-x-0.5">{role === 3 ? tl("Daftar gratis", "Register free") : tl("Masuk", "Sign in")} <ArrowRight className="size-4" /></Link>
          </div>
        </div>
      </section>

      {/* ---------- FAQ ---------- */}
      <section id="faq" className="scroll-mt-28 px-4 pb-20 sm:pb-28">
        <div className="mx-auto max-w-3xl">
          <SectionTitle center eyebrow="FAQ" title={tl("Pertanyaan yang sering muncul", "Frequently asked questions")} />
          <div className="mt-10 space-y-3">
            {FAQ.map(([qi, qe, ai, ae], i) => (
              <Reveal key={qi} delay={i * 70}>
                <div className={cn("overflow-hidden rounded-3xl bg-card transition-shadow", faq === i && "shadow-lg ring-1 ring-primary/20")}>
                  <button onClick={() => setFaq(faq === i ? null : i)} className="flex w-full items-center gap-4 px-6 py-5 text-left">
                    <span className="flex-1 text-[1.0625rem] font-medium">{tl(qi, qe)}</span>
                    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full transition-all", faq === i ? "rotate-180 bg-primary text-primary-foreground" : "bg-muted")}><ChevronDown className="size-4" /></span>
                  </button>
                  <div className={cn("grid transition-all duration-300", faq === i ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}><div className="overflow-hidden"><p className="px-6 pb-6 leading-relaxed text-muted-foreground">{tl(ai, ae)}</p></div></div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- ajakan ---------- */}
      <section className="px-4 pb-16">
        <Reveal className="relative mx-auto max-w-6xl overflow-hidden rounded-[2.5rem] bg-primary-deep px-6 py-14 text-center text-white sm:px-12 sm:py-20">
          <div className="pointer-events-none absolute inset-0 opacity-70" style={{ backgroundImage: "repeating-radial-gradient(circle at 50% 130%, transparent 0 22px, rgb(255 255 255 / 0.05) 22px 24px)" }} />
          {[12, 30, 70, 88].map((x, i) => <span key={x} className="anim-leaf pointer-events-none absolute top-0 text-emerald-300/60" style={{ left: `${x}%`, animationDelay: `${i * 2}s`, ["--dx" as any]: `${i % 2 ? -40 : 40}px` }}><Leaf className="size-5" /></span>)}
          <div className="relative">
            <Footprints className="mx-auto size-10 text-emerald-300" />
            <h2 className="mx-auto mt-5 max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-5xl">{tl("Satu langkah kecil, satu sekolah lestari.", "One small step, one sustainable school.")}</h2>
            <p className="mx-auto mt-4 max-w-xl text-white/75">{tl("Ajak sekolahmu bergabung, atau mulai dari rumah dengan menghitung jejak karbon pribadimu.", "Invite your school to join, or start at home by calculating your personal footprint.")}</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link to="/register" className="inline-flex h-13 items-center gap-2 rounded-full bg-white px-7 text-base font-semibold text-primary-deep transition-transform hover:scale-[1.02]">{tl("Gabung gerakan", "Join the movement")} <ArrowRight className="size-4" /></Link>
              <Link to="/login" className="inline-flex h-13 items-center gap-2 rounded-full px-7 text-base font-medium text-white ring-1 ring-white/30 transition-colors hover:bg-white/10">{tl("Masuk untuk sekolah", "School sign in")}</Link>
            </div>
          </div>
        </Reveal>
      </section>

      <footer className="px-4 pb-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 border-t pt-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <Brand />
          <span>{tl("Gerakan Sekolah Lestari · Bukan kredit karbon", "The Sekolah Lestari movement · Not a carbon credit")}</span>
          <span>© 2026 Sekolah Lestari</span>
        </div>
      </footer>
    </div>
  )
}
