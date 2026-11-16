import { useEffect, useState, type ReactNode } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, Footprints, Leaf, Lock, LogIn, Mail, ShieldCheck, Sparkles, UserPlus, UserRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Brand, LangToggle, ThemeToggle } from "@/components/app-shell"
import { Spinner } from "@/components/common"
import { initialsOf } from "@/components/profile-dialog"
import { api } from "@/lib/api"
import { ROLE_LABEL, useAuth, type Role } from "@/lib/auth"
import { goHome } from "@/lib/hosts"
import { tl } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { HeroArt } from "./landing"
import { DEMO, DEMO_PASSWORD, PasswordField, Strength, TextField } from "@/components/auth-fields"

const SLIDES: [string, string, string, string][] = [
  ["Sekolah bergerak, bumi bernapas.", "Schools move, the planet breathes.", "Bergabung dengan gerakan sekolah yang mengenali dan mengurangi jejak karbonnya setiap hari.", "Join schools that understand and reduce their carbon footprint every day."],
  ["Setiap angka bisa ditelusuri.", "Every number is traceable.", "Data aktivitas, faktor emisi, dan buktinya terbuka — diverifikasi lalu dikunci.", "Activity data, emission factors and evidence are open — verified, then locked."],
  ["Mulai dari rumahmu.", "Start at home.", "Masyarakat umum bisa menghitung jejak karbon pribadi dan mengambil komitmen aksi.", "Anyone can calculate a personal footprint and commit to actions."],
]

type Mode = "login" | "register" | "invite"

/** Panel kampanye kiri: ilustrasi beranimasi + pesan yang berganti otomatis. */
function CampaignPanel() {
  const [i, setI] = useState(0)
  useEffect(() => { const id = setInterval(() => setI((x) => (x + 1) % SLIDES.length), 5000); return () => clearInterval(id) }, [])
  const s = SLIDES[i]
  return (
    <aside className="relative m-3 hidden min-h-0 overflow-hidden rounded-[2.25rem] bg-gradient-to-b from-primary/10 via-card to-primary/15 ring-1 ring-border lg:flex lg:flex-col">
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-50 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
      <Link to="/" className="relative z-10 m-6 flex w-fit items-center gap-3 rounded-full bg-card/80 py-1.5 pr-4 pl-1.5 shadow-sm ring-1 ring-border backdrop-blur">
        <img src="/favicon.svg" className="size-9 rounded-full" alt="" />
        <span className="leading-tight"><span className="block text-sm font-semibold">Sekolah Lestari</span><span className="block text-[0.6875rem] text-muted-foreground">{tl("Gerakan jejak karbon sekolah", "School carbon footprint movement")}</span></span>
      </Link>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-10"><div className="aspect-square h-full max-h-[27.5rem] max-w-full"><HeroArt framed={false} /></div></div>
      <div className="relative z-10 m-5 mt-0 rounded-3xl bg-primary-deep p-6 text-white">
        <div className="pointer-events-none absolute inset-0 rounded-3xl opacity-60" style={{ backgroundImage: "repeating-radial-gradient(circle at 100% 120%, transparent 0 16px, rgb(255 255 255 / 0.05) 16px 18px)" }} />
        <div key={i} className="animate-fade-up relative min-h-[5.5rem]">
          <div className="text-2xl leading-tight font-semibold">{tl(s[0], s[1])}</div>
          <p className="mt-2 text-sm leading-relaxed text-white/75">{tl(s[2], s[3])}</p>
        </div>
        <div className="relative mt-4 flex items-center gap-2">
          {SLIDES.map((_, j) => <button key={j} onClick={() => setI(j)} aria-label={`${j + 1}`} className={cn("h-1.5 rounded-full transition-all duration-500", j === i ? "w-8 bg-white" : "w-3 bg-white/35 hover:bg-white/60")} />)}
          <Leaf className="ml-auto size-5 text-emerald-300" />
        </div>
      </div>
    </aside>
  )
}

export default function Login({ mode: initial = "login" }: { mode?: "login" | "register" }) {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const { login, me } = useAuth()
  const invite = params.get("invite") ?? params.get("undangan")
  const [mode, setMode] = useState<Mode>(invite ? "invite" : initial)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [inviteInfo, setInviteInfo] = useState<{ role: string; org?: string } | null>(null)

  useEffect(() => { if (me) goHome(me, nav, params.get("next")) }, [me]) // eslint-disable-line
  useEffect(() => { setMode(invite ? "invite" : initial); setErr(null) }, [initial, invite])
  useEffect(() => {
    if (invite) api(`/auth/invite/accept`, { method: "POST", json: { token: invite } })
      .then((r) => { setEmail(r.email); setInviteInfo({ role: r.role, org: r.org }) })
      .catch((e) => setErr(e.message))
  }, [invite])

  const done = (r: any) => {
    login(r.access, r.refresh, r.user)
    toast.success(tl(`Selamat datang, ${r.user.name}`, `Welcome, ${r.user.name}`))
    goHome(r.user, nav, params.get("next"))
  }
  const submit = async (e?: React.FormEvent, override?: { email: string; password: string }) => {
    e?.preventDefault()
    setErr(null)
    if (mode !== "login" && !override && password !== confirm) return setErr(tl("Konfirmasi kata sandi tidak sama", "Passwords don't match"))
    setBusy(override?.email ?? "form")
    try {
      if (override || mode === "login") done(await api("/auth/login", { method: "POST", json: override ?? { email, password } }))
      else if (mode === "register") done(await api("/auth/register", { method: "POST", json: { name, email, password } }))
      else done(await api("/auth/invite/complete", { method: "POST", json: { token: invite, name, password } }))
    } catch (x) { setErr((x as Error).message) } finally { setBusy(null) }
  }
  const switchTo = (m: "login" | "register") => { nav(m === "login" ? "/login" : "/register", { replace: true }); setErr(null); setPassword(""); setConfirm("") }

  const title = mode === "login" ? tl("Selamat datang kembali", "Welcome back") : mode === "register" ? tl("Gabung gerakan", "Join the movement") : tl("Aktifkan akunmu", "Activate your account")
  const sub = mode === "login" ? tl("Masuk dengan email dan kata sandimu.", "Sign in with your email and password.")
    : mode === "register" ? tl("Akun gratis untuk masyarakat umum — hitung dan kurangi jejak karbon pribadimu.", "A free account for the public — calculate and reduce your personal footprint.")
      : inviteInfo ? tl(`Kamu diundang sebagai ${ROLE_LABEL[inviteInfo.role as Role] ?? inviteInfo.role}${inviteInfo.org ? ` · ${inviteInfo.org}` : ""}.`, `You're invited as ${ROLE_LABEL[inviteInfo.role as Role] ?? inviteInfo.role}${inviteInfo.org ? ` · ${inviteInfo.org}` : ""}.`) : tl("Memeriksa undangan…", "Checking invitation…")

  return (
    <div className="grid h-svh overflow-hidden bg-background lg:grid-cols-[1.05fr_1fr]">
      <CampaignPanel />

      <main className="flex min-h-0 flex-col">
        <div className="flex shrink-0 items-center justify-between px-4 py-3 sm:px-6 sm:py-4 [@media(max-height:760px)]:py-2.5">
          <Link to="/" className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-card p-2.5 text-sm text-muted-foreground shadow-sm ring-1 ring-border transition-colors hover:text-foreground sm:px-4 sm:py-2" aria-label={tl("Beranda", "Home")}><ArrowLeft className="size-4" /><span className="hidden sm:inline">{tl("Beranda", "Home")}</span></Link>
          <Brand className="lg:hidden" />
          <div className="flex items-center gap-1.5"><LangToggle className="bg-card shadow-sm ring-1 ring-border" /><ThemeToggle /></div>
        </div>

        <div className="flex min-h-0 flex-1 overflow-y-auto px-4 pb-4 [scrollbar-width:none]">
          <div className="m-auto w-full max-w-[27.5rem]">
            {/* tab dengan indikator bergeser */}
            {mode !== "invite" && (
              <div role="tablist" className="relative mb-6 inline-grid w-full grid-cols-2 rounded-xl bg-muted/80 p-1 [@media(max-height:700px)]:mb-4">
                <span aria-hidden className="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-lg bg-card shadow-[0_1px_2px_rgb(0_0_0/0.06),0_2px_8px_-2px_rgb(0_0_0/0.08)] ring-1 ring-black/[0.04] transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)] dark:ring-white/10" style={{ transform: mode === "register" ? "translateX(100%)" : "none" }} />
                {(["login", "register"] as const).map((m) => (
                  <button key={m} role="tab" aria-selected={mode === m} onClick={() => switchTo(m)} className={cn("relative z-10 flex h-9 items-center justify-center gap-2 rounded-lg text-[0.8125rem] font-medium transition-colors duration-200", mode === m ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
                    {m === "login" ? <LogIn className={cn("size-4", mode === m && "text-primary")} /> : <UserPlus className={cn("size-4", mode === m && "text-primary")} />}
                    {m === "login" ? tl("Masuk", "Sign in") : tl("Daftar", "Register")}
                  </button>
                ))}
              </div>
            )}

            <div key={mode} className="animate-fade-up">
              <span className="relative mb-4 flex size-12 items-center justify-center rounded-2xl [@media(max-height:820px)]:hidden bg-primary text-primary-foreground shadow-lg shadow-primary/25">
                <span className="anim-pulse-ring absolute inset-0 rounded-2xl bg-primary" />
                {mode === "register" ? <Footprints className="relative size-6" /> : mode === "invite" ? <Sparkles className="relative size-6" /> : <ShieldCheck className="relative size-6" />}
              </span>
              <h1 className="text-3xl leading-tight font-semibold tracking-tight">{title}</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">{sub}</p>

              <form className="mt-5 space-y-3.5 [@media(max-height:760px)]:mt-4 [@media(max-height:760px)]:space-y-2.5" onSubmit={submit}>
                {mode !== "login" && <TextField icon={UserRound} label={tl("Nama lengkap", "Full name")} required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder={tl("Nama kamu", "Your name")} autoFocus />}
                <TextField icon={Mail} label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="nama@email.com" readOnly={mode === "invite"} autoFocus={mode === "login"} className={mode === "invite" ? "text-muted-foreground" : ""} />
                <PasswordField label={tl("Kata sandi", "Password")} value={password} onChange={setPassword} autoComplete={mode === "login" ? "current-password" : "new-password"}
                  extra={mode === "login" ? (
                    <Popover>
                      <PopoverTrigger render={<button type="button" className="text-sm font-medium text-primary hover:underline" />}>{tl("Lupa kata sandi?", "Forgot password?")}</PopoverTrigger>
                      <PopoverContent align="end" className="w-72 text-sm">
                        <p className="font-semibold">{tl("Atur ulang kata sandi", "Reset your password")}</p>
                        <p className="text-muted-foreground">{tl("Staf sekolah: minta admin lembaga mengirim undangan baru. Pengguna umum: hubungi admin program Sekolah Lestari.", "School staff: ask your institution admin to send a new invitation. Public users: contact the Sekolah Lestari program admin.")}</p>
                      </PopoverContent>
                    </Popover>
                  ) : undefined} />
                {mode !== "login" && (
                  <>
                    {password && <Strength pw={password} />}
                    <PasswordField label={tl("Ulangi kata sandi", "Confirm password")} value={confirm} onChange={setConfirm} autoComplete="new-password" />
                  </>
                )}
                {err && <div role="alert" className="animate-fade-up rounded-2xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">{err}</div>}
                <Button type="submit" size="lg" className="group mt-1 h-12 w-full text-[0.9375rem] shadow-lg shadow-primary/20" disabled={!!busy || (mode === "invite" && !inviteInfo)}>
                  {busy === "form" ? <Spinner /> : null}{mode === "login" ? tl("Masuk", "Sign in") : mode === "register" ? tl("Buat akun", "Create account") : tl("Aktifkan & masuk", "Activate & sign in")}
                  {busy !== "form" && <ArrowRight className="transition-transform group-hover:translate-x-1" />}
                </Button>
              </form>

              {mode === "register" && (
                <div className="mt-4 hidden gap-3 rounded-2xl bg-primary/8 px-4 py-3 text-xs leading-relaxed sm:flex [@media(max-height:700px)]:hidden text-muted-foreground">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>{tl("Akun daftar mandiri membuka kalkulator jejak karbon pribadi. Admin, operator, kepala sekolah, dan petugas monitoring masuk lewat undangan.", "Self-registered accounts open the personal footprint calculator. School staff, verifiers and agencies join via an admin invitation.")}</span>
                </div>
              )}
              {mode === "login" && (
                <>
                  <p className="mt-4 text-center text-sm text-muted-foreground">{tl("Belum punya akun?", "No account yet?")} <button onClick={() => switchTo("register")} className="font-semibold text-primary hover:underline">{tl("Daftar gratis", "Register free")}</button></p>

                  <div className="mt-5 [@media(max-height:640px)]:hidden">
                    <div className="mb-3 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />{tl("atau coba akun demo", "or try a demo account")} · <code className="rounded bg-muted px-1.5 py-0.5">{DEMO_PASSWORD}</code><span className="h-px flex-1 bg-border" /></div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {DEMO.map((d) => (
                        <button key={d.email} disabled={!!busy} onClick={() => { setEmail(d.email); setPassword(DEMO_PASSWORD); submit(undefined, { email: d.email, password: DEMO_PASSWORD }) }}
                          className="group flex items-center gap-2 rounded-xl bg-card p-2 text-left ring-1 ring-border transition-all hover:-translate-y-0.5 hover:shadow-md hover:ring-primary/40 disabled:opacity-60">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-deep text-[0.6875rem] font-semibold text-white">{busy === d.email ? <Spinner /> : initialsOf(d.name)}</span>
                          <span className="min-w-0"><span className="block truncate text-xs font-semibold">{ROLE_LABEL[d.role]}</span><span className="block truncate text-[0.6875rem] text-muted-foreground">{d.who}</span></span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
