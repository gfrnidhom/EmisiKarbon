import { ArrowRight, Leaf, Mail, Recycle, ScanLine, Trees, UserRound } from "lucide-react"
import { Spinner } from "@/components/common"
import { DEMO, DEMO_PASSWORD, PasswordField, Strength, TextField, useSignIn } from "@/components/auth-fields"
import { appUrl } from "@/lib/hosts"
import { tl } from "@/lib/i18n"

/** Login petugas.<domain> — gaya aplikasi ponsel (juga layar pertama APK). Tanpa daftar: akun dibuat Operator sekolah. */
export default function PetugasLogin() {
  const f = useSignIn()
  const demo = DEMO.find((d) => d.role === "petugas")
  return (
    <div className="fapp flex min-h-svh flex-col md:grid md:h-svh md:min-h-0 md:grid-cols-[1.1fr_1fr] md:p-3">
      <div className="flex w-full flex-1 flex-col md:contents">
        {/* ilustrasi atas */}
        <div className="relative flex min-h-[19rem] flex-1 flex-col overflow-hidden bg-gradient-to-br from-[var(--f-mint)] via-[var(--f-teal)] to-[var(--f-lime)] px-6 pt-[max(env(safe-area-inset-top),1.25rem)] pb-14 md:min-h-0 md:rounded-[2.25rem] md:p-12">
          <div className="flex items-center gap-2 self-start rounded-full bg-[var(--f-card)]/85 py-1 pr-3.5 pl-1 shadow-sm backdrop-blur">
            <span className="flex size-8 items-center justify-center rounded-full bg-[var(--f-tint)] text-white"><Leaf className="size-4" /></span>
            <span className="text-sm font-medium">{tl("Sekolah Lestari Petugas", "Sekolah Lestari Officer")}</span>
          </div>
          <h1 className="relative z-10 mt-7 max-w-[15rem] text-[2rem] leading-[1.12] font-normal tracking-tight md:mt-16 md:max-w-md md:text-[3.25rem] md:leading-[1.08]">{tl("Catat data lapangan dengan mudah", "Field data, made easy")}</h1>
          {/* desktop: daftar kemampuan */}
          <ul className="relative z-10 mt-8 hidden max-w-sm flex-wrap gap-2 md:flex">
            {[["Input data bulanan", "Monthly input"], ["Timbang sampah & survei", "Waste & surveys"], ["Ukur pohon lewat scan QR", "QR tree measuring"], ["Tetap jalan saat offline", "Works offline"]].map(([id, en]) => (
              <li key={id} className="rounded-full bg-[var(--f-card)]/80 px-3.5 py-1.5 text-sm backdrop-blur">{tl(id, en)}</li>
            ))}
          </ul>
          <p className="relative z-10 mt-auto hidden max-w-xs text-sm text-[var(--f-muted)] md:block">{tl("Aplikasi untuk Petugas Monitoring sekolah — juga tersedia sebagai aplikasi Android.", "For school Monitoring Officers — also available as an Android app.")}</p>
          {/* komposisi ikon dekoratif */}
          <span className="absolute -right-10 bottom-4 size-48 md:-right-16 md:bottom-10 md:size-[26rem] rounded-full bg-white/35 dark:bg-white/5" />
          <span className="absolute right-24 -bottom-8 size-24 md:right-[22rem] md:-bottom-16 md:size-56 rounded-full bg-white/30 dark:bg-white/5" />
          <span className="absolute right-6 bottom-16 flex size-20 rotate-6 items-center justify-center rounded-[1.5rem] md:right-20 md:bottom-36 md:size-44 md:rounded-[2.75rem] bg-[var(--f-card)] text-emerald-600 shadow-[var(--f-shadow)]"><Trees className="size-10 md:size-20" strokeWidth={1.6} /></span>
          <span className="absolute right-28 bottom-24 flex size-12 -rotate-12 items-center justify-center rounded-2xl md:right-72 md:bottom-72 md:size-24 md:rounded-[1.75rem] bg-[var(--f-card)] text-lime-600 shadow-[var(--f-shadow)]"><Recycle className="size-6 md:size-11" strokeWidth={1.8} /></span>
          <span className="absolute right-[5.5rem] bottom-8 flex size-11 rotate-12 items-center justify-center rounded-2xl md:right-64 md:bottom-24 md:size-20 md:rounded-[1.5rem] bg-[var(--f-ink)] text-[var(--f-ink-fg)] shadow-[var(--f-shadow)]"><ScanLine className="size-5 md:size-9" /></span>
        </div>

        {/* lembar formulir */}
        <div className="relative -mt-8 rounded-t-[2rem] bg-[var(--f-card)] px-5 pt-6 pb-[max(env(safe-area-inset-bottom),1.5rem)] shadow-[0_-12px_30px_-16px_rgba(16,64,42,0.25)] md:mt-0 md:flex md:items-center md:justify-center md:overflow-y-auto md:rounded-none md:bg-transparent md:px-10 md:shadow-none">
          <div className="w-full md:max-w-[26rem]">
          <span className="mx-auto mb-5 block h-1.5 w-10 rounded-full bg-[var(--f-line)] md:hidden" />
          <h2 className="text-xl font-medium md:text-3xl">{f.invite ? tl("Aktifkan akun petugas", "Activate officer account") : tl("Masuk", "Sign in")}</h2>
          <p className="mt-1 text-sm text-[var(--f-muted)]">
            {f.invite ? (f.inviteInfo ? tl(`Diundang${f.inviteInfo.org ? ` oleh ${f.inviteInfo.org}` : ""}. Buat kata sandi Anda.`, `Invited${f.inviteInfo.org ? ` by ${f.inviteInfo.org}` : ""}. Set your password.`) : tl("Memeriksa undangan…", "Checking invitation…"))
              : tl("Gunakan akun dari Operator sekolah Anda.", "Use the account from your school Operator.")}
          </p>
          <form className="mt-5 space-y-3" onSubmit={f.submit}>
            {f.invite && <TextField icon={UserRound} label={tl("Nama lengkap", "Full name")} required value={f.name} onChange={(e) => f.setName(e.target.value)} autoComplete="name" />}
            <TextField icon={Mail} label="Email" type="email" inputMode="email" required value={f.email} onChange={(e) => f.setEmail(e.target.value)} autoComplete="email" placeholder="nama@email.com" readOnly={!!f.invite} />
            <PasswordField label={tl("Kata sandi", "Password")} value={f.password} onChange={f.setPassword} autoComplete={f.invite ? "new-password" : "current-password"} />
            {f.invite && <>{f.password && <Strength pw={f.password} />}<PasswordField label={tl("Ulangi kata sandi", "Confirm password")} value={f.confirm} onChange={f.setConfirm} autoComplete="new-password" /></>}
            {f.err && <div role="alert" className="rounded-2xl bg-rose-500/10 px-4 py-3 text-sm text-rose-600 dark:text-rose-300">{f.err}</div>}
            <button type="submit" disabled={!!f.busy || (!!f.invite && !f.inviteInfo)} className="mt-2 flex h-13 w-full items-center justify-center gap-2 rounded-full bg-[var(--f-ink)] text-[0.9375rem] font-medium text-[var(--f-ink-fg)] transition-transform active:scale-[0.98] disabled:opacity-60">
              {f.busy === "form" ? <Spinner /> : null}{f.invite ? tl("Aktifkan & masuk", "Activate & sign in") : tl("Masuk", "Sign in")}<ArrowRight className="size-4" />
            </button>
          </form>
          {!f.invite && demo && (
            <button disabled={!!f.busy} onClick={() => f.submit(undefined, { email: demo.email, password: DEMO_PASSWORD })} className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--f-soft)] text-sm font-medium text-[var(--f-tint)] disabled:opacity-60">
              {f.busy === demo.email ? <Spinner /> : null}{tl("Coba akun demo petugas", "Try the demo officer account")}
            </button>
          )}
          <p className="mt-5 text-center text-xs leading-relaxed text-[var(--f-muted)]">
            {tl("Belum punya akun? Minta Operator sekolah mengirim undangan.", "No account? Ask your school Operator for an invitation.")}<br />
            <a href={appUrl("web", "/")} className="font-medium text-[var(--f-tint)]">{tl("Ke situs Sekolah Lestari", "Go to Sekolah Lestari site")}</a>
          </p>
          </div>
        </div>
      </div>
    </div>
  )
}
