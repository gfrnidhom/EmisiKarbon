import { useState } from "react"
import { Link, NavLink, Outlet, useLocation } from "react-router-dom"
import { useTheme } from "next-themes"
import { BookOpenCheck, Calculator, ChevronDown, Home, LogOut, Moon, Sun, UserPen } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Brand, LangToggle } from "./app-shell"
import { ErrorBoundary } from "./error-boundary"
import { ProfileDialog, UserAvatar } from "./profile-dialog"
import { useAuth } from "@/lib/auth"
import { tl } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const NAV = [
  { to: "/footprint", id: "Ringkasan", en: "Overview", icon: Home, end: true },
  { to: "/footprint/calculate", id: "Hitung", en: "Calculate", icon: Calculator },
]

/** Tampilan aplikasi untuk masyarakat umum — ringan, tanpa sidebar admin. */
export function ConsumerShell() {
  const { me, logout } = useAuth()
  const loc = useLocation()
  const { resolvedTheme, setTheme } = useTheme()
  const [profile, setProfile] = useState(false)
  if (!me) return null
  return (
    <div className="min-h-svh bg-background">
      <header className="no-print sticky top-0 z-30 bg-background/80 px-3 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-[77.5rem] items-center gap-3">
          <Brand />
          <nav className="mx-auto hidden items-center gap-1 rounded-full bg-card p-1.5 shadow-sm ring-1 ring-border md:flex">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cn("inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[0.9375rem] font-medium transition-colors", isActive ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground")}>
                <n.icon className="size-[1.125rem]" />{tl(n.id, n.en)}
              </NavLink>
            ))}
            <Link to="/methodology" className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[0.9375rem] font-medium text-muted-foreground transition-colors hover:text-foreground"><BookOpenCheck className="size-[1.125rem]" />{tl("Metodologi", "Methodology")}</Link>
          </nav>
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <LangToggle className="hidden h-12 items-center rounded-full bg-card px-1.5 shadow-sm ring-1 ring-border sm:inline-flex" />
            <div className="flex h-12 items-center gap-1 rounded-full bg-card px-1.5 shadow-sm ring-1 ring-border">
              <button onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} aria-label={tl("Ganti tema", "Toggle theme")} className="flex size-9 items-center justify-center rounded-full hover:bg-muted">{resolvedTheme === "dark" ? <Sun className="size-[1.125rem]" /> : <Moon className="size-[1.125rem]" />}</button>
              <span className="h-5 w-px bg-border" />
              <DropdownMenu>
                <DropdownMenuTrigger render={<button className="group flex items-center gap-1.5 rounded-full p-0.5 pr-1.5 hover:bg-muted" aria-label={tl("Akun", "Account")} />}>
                  <UserAvatar name={me.name} className="size-9 text-xs ring-0" />
                  <ChevronDown className="size-4 text-muted-foreground transition-transform group-aria-expanded:rotate-180" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={10} className="w-72 rounded-2xl p-2">
                  <div className="mb-1 flex items-center gap-3 rounded-xl bg-primary/8 p-3">
                    <UserAvatar name={me.name} className="size-11 text-sm" />
                    <div className="min-w-0"><div className="truncate font-semibold">{me.name}</div><div className="truncate text-xs text-muted-foreground">{me.email}</div></div>
                  </div>
                  <DropdownMenuItem onClick={() => setProfile(true)} className="gap-3 rounded-xl px-2.5 py-2"><UserPen className="size-4" />{tl("Ubah profil", "Edit profile")}</DropdownMenuItem>
                  <DropdownMenuItem render={<Link to="/methodology" />} className="gap-3 rounded-xl px-2.5 py-2"><BookOpenCheck className="size-4" />{tl("Metodologi & faktor", "Methodology & factors")}</DropdownMenuItem>
                  <DropdownMenuSeparator className="my-1.5" />
                  <DropdownMenuItem variant="destructive" onClick={logout} className="gap-3 rounded-xl px-2.5 py-2"><LogOut className="size-4" />{tl("Keluar", "Sign out")}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>
      <main className="relative mx-auto w-full max-w-[77.5rem] px-4 pt-4 pb-28 sm:px-6 md:pb-12">
        <ErrorBoundary resetKey={loc.pathname}><Outlet /></ErrorBoundary>
      </main>
      <nav className="no-print fixed inset-x-3 bottom-3 z-30 grid grid-cols-2 gap-1 rounded-full bg-card/95 p-1.5 shadow-xl ring-1 ring-border backdrop-blur md:hidden">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cn("flex items-center justify-center gap-2 rounded-full py-2.5 text-sm font-medium", isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
            <n.icon className="size-4" />{tl(n.id, n.en)}
          </NavLink>
        ))}
      </nav>
      <ProfileDialog open={profile} onOpenChange={setProfile} />
    </div>
  )
}
