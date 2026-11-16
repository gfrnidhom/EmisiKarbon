import { ArrowLeft, ArrowRight, BarChart3, Building2, ClipboardCheck, FileCheck2, KeyRound, Mail, ShieldCheck, UserRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { LangToggle, ThemeToggle } from "@/components/app-shell"
import { Spinner } from "@/components/common"
import { DEMO, DEMO_PASSWORD, PasswordField, Strength, TextField, useSignIn } from "@/components/auth-fields"
import { initialsOf } from "@/components/profile-dialog"
import { ROLE_LABEL, type Role } from "@/lib/auth"
import { appUrl } from "@/lib/hosts"
import { tl } from "@/lib/i18n"

const FEATURES = [
  { icon: ClipboardCheck, id: "Setujui data petugas & Survei Awal", en: "Approve officer data & baselines" },
  { icon: BarChart3, id: "Pantau emisi harian tiap sekolah", en: "Monitor daily emissions per school" },
  { icon: FileCheck2, id: "Terbitkan rapor karbon ber-QR", en: "Issue QR-verified carbon reports" },
  { icon: Building2, id: "Kelola lembaga, pengguna & faktor emisi", en: "Manage schools, users & factors" },
]

/** Mini grafik dekoratif untuk panel kiri. */
function ChartArt() {
  const bars = [38, 52, 44, 66, 58, 74, 61, 82, 70, 90]
  return (
    <div className="rounded-3xl bg-white/8 p-5 ring-1 ring-white/10 backdrop-blur">
      <div className="flex items-center justify-between text-xs text-white/70"><span>{tl("Emisi harian · kg CO₂e", "Daily emissions · kg CO₂e")}</span><span className="rounded-full bg-emerald-400/20 px-2 py-0.5 font-medium text-emerald-200">−12%</span></div>
      <div className="mt-4 flex h-28 items-end gap-2">
        {bars.map((h, i) => <span key={i} className="flex-1 rounded-t-md bg-gradient-to-t from-emerald-400/40 to-emerald-300" style={{ height: `${h}%`, opacity: 0.45 + i * 0.055 }} />)}
      </div>
    </div>
  )
}

/** Login admin.<domain>: Admin, Operator & Kepala Sekolah. Tanpa daftar — akun dibuat lewat undangan. */
export default function AdminLogin() {
  const f = useSignIn()
  const demos = DEMO.filter((d) => (["admin", "operator", "kepsek"] as Role[]).includes(d.role))
  return (
    <div className="grid h-svh overflow-hidden bg-background lg:grid-cols-[1fr_1.05fr]">
      {/* panel kiri */}
      <aside className="relative m-3 hidden flex-col justify-between overflow-hidden rounded-[2.25rem] bg-[var(--primary-deep)] p-10 text-white lg:flex">
        <span className="pointer-events-none absolute -top-24 -right-24 size-80 rounded-full bg-white/6" />
        <span className="pointer-events-none absolute -bottom-32 -left-20 size-96 rounded-full bg-emerald-300/8" />
        <div className="relative flex items-center gap-3">
          <img src="/favicon.svg" className="size-11 rounded-xl ring-2 ring-white/20" alt="" />
          <div className="leading-tight"><div className="font-semibold">Sekolah Lestari</div><div className="text-xs text-white/65">{tl("Portal Admin & Sekolah", "Admin & School Portal")}</div></div>
        </div>
        <div className="relative space-y-7">
          <h2 className="max-w-md text-[2.25rem] leading-[1.15] font-medium tracking-tight">{tl("Satu dasbor untuk seluruh jejak karbon sekolah.", "One dashboard for every school's footprint.")}</h2>
          <ChartArt />
          <ul className="grid grid-cols-2 gap-3">
            {FEATURES.map((x) => <li key={x.id} className="flex items-start gap-2.5 rounded-2xl bg-white/6 p-3 text-sm leading-snug text-white/85"><x.icon className="mt-0.5 size-4 shrink-0 text-emerald-300" />{tl(x.id, x.en)}</li>)}
          </ul>
        </div>
        <p className="relative text-xs text-white/50">{tl("Akses terbatas untuk staf terdaftar. Aktivitas tercatat di log audit.", "Restricted to registered staff. Activity is audit-logged.")}</p>
      </aside>

      {/* formulir */}
      <main className="flex min-h-0 flex-col">
        <div className="flex shrink-0 items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
          <a href={appUrl("web", "/")} className="inline-flex items-center gap-1.5 rounded-full bg-card p-2.5 text-sm text-muted-foreground shadow-sm ring-1 ring-border hover:text-foreground sm:px-4 sm:py-2"><ArrowLeft className="size-4" /><span className="hidden sm:inline">{tl("Situs utama", "Main site")}</span></a>
          <div className="flex items-center gap-1.5"><LangToggle className="bg-card shadow-sm ring-1 ring-border" /><ThemeToggle /></div>
        </div>
        <div className="flex min-h-0 flex-1 overflow-y-auto px-4 pb-6 [scrollbar-width:none]">
          <div className="m-auto w-full max-w-[26rem]">
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary/10 px-3 text-xs font-semibold text-primary"><ShieldCheck className="size-3.5" />{tl("Portal Admin", "Admin Portal")}</span>
            <h1 className="mt-4 text-3xl leading-tight font-semibold tracking-tight">{f.invite ? tl("Aktifkan akun staf", "Activate staff account") : tl("Masuk ke dasbor", "Sign in to the dashboard")}</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {f.invite
                ? (f.inviteInfo ? tl(`Diundang sebagai ${ROLE_LABEL[f.inviteInfo.role as Role] ?? f.inviteInfo.role}${f.inviteInfo.org ? ` · ${f.inviteInfo.org}` : ""}. Buat kata sandi Anda.`, `Invited as ${ROLE_LABEL[f.inviteInfo.role as Role] ?? f.inviteInfo.role}${f.inviteInfo.org ? ` · ${f.inviteInfo.org}` : ""}. Set your password.`) : tl("Memeriksa undangan…", "Checking invitation…"))
                : tl("Khusus Admin, Operator & Kepala Sekolah.", "For Admins, Operators & Principals only.")}
            </p>

            <form className="mt-6 space-y-3.5" onSubmit={f.submit}>
              {f.invite && <TextField icon={UserRound} label={tl("Nama lengkap", "Full name")} required value={f.name} onChange={(e) => f.setName(e.target.value)} autoComplete="name" autoFocus />}
              <TextField icon={Mail} label={tl("Email kerja", "Work email")} type="email" required value={f.email} onChange={(e) => f.setEmail(e.target.value)} autoComplete="email" placeholder="nama@sekolah.sch.id" readOnly={!!f.invite} autoFocus={!f.invite} />
              <PasswordField label={tl("Kata sandi", "Password")} value={f.password} onChange={f.setPassword} autoComplete={f.invite ? "new-password" : "current-password"}
                extra={!f.invite ? (
                  <Popover>
                    <PopoverTrigger render={<button type="button" className="text-sm font-medium text-primary hover:underline" />}>{tl("Lupa kata sandi?", "Forgot password?")}</PopoverTrigger>
                    <PopoverContent align="end" className="w-72 text-sm"><p className="font-semibold">{tl("Atur ulang kata sandi", "Reset your password")}</p><p className="text-muted-foreground">{tl("Minta Admin atau Operator sekolah mengirim undangan baru ke email Anda.", "Ask your Admin or school Operator to send you a new invitation.")}</p></PopoverContent>
                  </Popover>
                ) : undefined} />
              {f.invite && <>{f.password && <Strength pw={f.password} />}<PasswordField label={tl("Ulangi kata sandi", "Confirm password")} value={f.confirm} onChange={f.setConfirm} autoComplete="new-password" /></>}
              {f.err && <div role="alert" className="rounded-2xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">{f.err}</div>}
              <Button type="submit" size="lg" className="group mt-1 h-12 w-full text-[0.9375rem]" disabled={!!f.busy || (!!f.invite && !f.inviteInfo)}>
                {f.busy === "form" ? <Spinner /> : <KeyRound />}{f.invite ? tl("Aktifkan & masuk", "Activate & sign in") : tl("Masuk", "Sign in")}
                {f.busy !== "form" && <ArrowRight className="transition-transform group-hover:translate-x-1" />}
              </Button>
            </form>

            <div className="mt-5 flex gap-3 rounded-2xl bg-muted/70 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>{tl("Tidak ada pendaftaran mandiri. Akun staf dibuat lewat undangan Admin. Pengguna umum masuk lewat ", "No self-registration. Staff accounts are created by Admin invitation. Public users sign in on the ")}<a href={appUrl("web", "/login")} className="font-medium text-primary hover:underline">{tl("situs utama", "main site")}</a>.</span>
            </div>

            {!f.invite && (
              <div className="mt-6">
                <div className="mb-3 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />{tl("akun demo", "demo accounts")} · <code className="rounded bg-muted px-1.5 py-0.5">{DEMO_PASSWORD}</code><span className="h-px flex-1 bg-border" /></div>
                <div className="grid grid-cols-2 gap-2">
                  {demos.map((d) => (
                    <button key={d.email} disabled={!!f.busy} onClick={() => { f.setEmail(d.email); f.setPassword(DEMO_PASSWORD); f.submit(undefined, { email: d.email, password: DEMO_PASSWORD }) }}
                      className="flex items-center gap-2 rounded-xl bg-card p-2 text-left ring-1 ring-border transition-all hover:-translate-y-0.5 hover:shadow-md hover:ring-primary/40 disabled:opacity-60">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-deep text-[0.6875rem] font-semibold text-white">{f.busy === d.email ? <Spinner /> : initialsOf(d.name)}</span>
                      <span className="min-w-0"><span className="block truncate text-xs font-semibold">{ROLE_LABEL[d.role]}</span><span className="block truncate text-[0.6875rem] text-muted-foreground">{d.who}</span></span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
