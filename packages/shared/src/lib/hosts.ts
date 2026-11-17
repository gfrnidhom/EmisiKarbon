import type { NavigateFunction } from "react-router-dom"
import { api } from "./api"
import type { Me } from "./auth"
import { CLIENT_CONFIG, type AppKind } from "./config"

export type { AppKind }
export const APP: AppKind = typeof __APP__ !== "undefined" ? __APP__ : "web"

/** Alamat lengkap aplikasi lain. Urutan: VITE_URL_* → port Vite (pengembangan) → awalan subdomain pada host sekarang. */
export function appUrl(kind: AppKind, path = "/") {
  const fixed = CLIENT_CONFIG.APP_URL[kind]
  if (fixed) return fixed.replace(/\/$/, "") + path
  const { protocol, hostname, port } = window.location
  if (CLIENT_CONFIG.IS_DEV) return `${protocol}//${hostname}:${CLIENT_CONFIG.DEV_PORT[kind]}${path}`
  const base = hostname.replace(/^(admin|petugas)\./, "")
  return `${protocol}//${CLIENT_CONFIG.SUBDOMAIN_PREFIX[kind]}${base}${port ? `:${port}` : ""}${path}`
}

const STAFF = ["admin", "operator", "kepsek"]
/** Boleh memakai aplikasi ini? (akun dua peran boleh membuka admin & petugas) */
export function canUse(me: Me, kind: AppKind) {
  if (kind === "web") return true
  if (kind === "admin") return me.roles.some((r) => STAFF.includes(r.role))
  return me.roles.some((r) => r.role === "petugas")
}
/** Aplikasi utama untuk akun ini. */
export function appFor(me: Me): AppKind {
  if (me.roles.some((r) => STAFF.includes(r.role))) return "admin"
  if (me.roles.some((r) => r.role === "petugas")) return "petugas"
  return "web"
}
export const HOME: Record<AppKind, string> = { web: "/footprint", admin: "/app", petugas: "/" }

/** Pindah ke aplikasi lain tanpa login ulang (kode sekali pakai 60 detik). */
export async function handoff(kind: AppKind, path = HOME[kind]) {
  try {
    const { code } = await api<{ code: string }>("/auth/handoff", { method: "POST" })
    window.location.href = appUrl(kind, `/auth/handoff?code=${encodeURIComponent(code)}&next=${encodeURIComponent(path)}`)
  } catch {
    window.location.href = appUrl(kind, `/login?next=${encodeURIComponent(path)}`)
  }
}

/** Setelah login: tetap di aplikasi ini bila boleh, selain itu pindah ke aplikasi yang sesuai peran. */
export function goHome(me: Me, nav: NavigateFunction, next?: string | null) {
  if (APP !== "web" && canUse(me, APP)) return nav(next || HOME[APP], { replace: true })
  const target = appFor(me)
  if (target === APP) return nav(next || HOME[APP], { replace: true })
  return handoff(target)
}
