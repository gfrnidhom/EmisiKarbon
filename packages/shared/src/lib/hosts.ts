import type { NavigateFunction } from "react-router-dom"
import { api } from "./api"
import type { Me } from "./auth"

/** Tiga aplikasi dalam monorepo, masing-masing di domainnya sendiri:
 *  web     → domain utama (beranda, publik, pengguna umum)
 *  admin   → admin.<domain> (Admin, Operator, Kepala Sekolah)
 *  petugas → petugas.<domain> (aplikasi ponsel Petugas Monitoring, dibungkus APK) */
export type AppKind = "web" | "admin" | "petugas"
export const APP: AppKind = typeof __APP__ !== "undefined" ? __APP__ : "web"

const DEV_PORT: Record<AppKind, number> = { web: 5173, admin: 5174, petugas: 5175 }
const PREFIX: Record<AppKind, string> = { web: "", admin: "admin.", petugas: "petugas." }
const ENV_URL: Record<AppKind, string | undefined> = {
  web: import.meta.env.VITE_URL_WEB, admin: import.meta.env.VITE_URL_ADMIN, petugas: import.meta.env.VITE_URL_PETUGAS,
}

/** Alamat lengkap aplikasi lain. Urutan: VITE_URL_* → port Vite (pengembangan) → awalan subdomain pada host sekarang. */
export function appUrl(kind: AppKind, path = "/") {
  const fixed = ENV_URL[kind]
  if (fixed) return fixed.replace(/\/$/, "") + path
  const { protocol, hostname, port } = window.location
  if (import.meta.env.DEV) return `${protocol}//${hostname}:${DEV_PORT[kind]}${path}`
  const base = hostname.replace(/^(admin|petugas)\./, "")
  return `${protocol}//${PREFIX[kind]}${base}${port ? `:${port}` : ""}${path}`
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
