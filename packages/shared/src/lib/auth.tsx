import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { api, tokens } from "./api"
import { t } from "./i18n"

export type Role = "admin" | "operator" | "kepsek" | "petugas" | "user"
export interface Me {
  id: number; email: string; name: string; phone?: string | null; created_at?: string | null
  roles: { role: Role; org_id: number | null }[]
  orgs: { id: number; name: string; short: string; kecamatan: string; jenjang: string }[]
}
interface Ctx {
  me: Me | null; loading: boolean; orgId: number | null; setOrgId: (id: number) => void
  login: (access: string, refresh: string, me: Me) => void; logout: () => void
  has: (...r: Role[]) => boolean; hasInOrg: (...r: Role[]) => boolean; reload: () => Promise<void>
}
const AuthCtx = createContext<Ctx>(null!)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(!!tokens.access)
  const [orgId, setOrgIdState] = useState<number | null>(() => { try { return Number(localStorage.getItem("jh.org")) || null } catch { return null } })
  const setOrgId = (id: number) => { setOrgIdState(id); try { localStorage.setItem("jh.org", String(id)) } catch { /* noop */ } }
  const reload = useCallback(async () => {
    if (!tokens.access) { setLoading(false); return }
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const m = await api<Me>("/auth/me")
        setMe(m)
        if (!m.orgs.find((o) => o.id === orgId) && m.orgs[0]) setOrgId(m.orgs[0].id)
        break
      } catch (e: any) {
        // hanya 401/403 berarti sesi tidak valid; galat sementara (429/5xx/offline) dicoba ulang
        if (e?.status === 401 || e?.status === 403 || attempt === 3) { if (e?.status === 401 || e?.status === 403) setMe(null); break }
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)))
      }
    }
    setLoading(false)
  }, [orgId])
  useEffect(() => { reload() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const value = useMemo<Ctx>(() => ({
    me, loading, orgId, setOrgId,
    login: (a, r, m) => { tokens.set(a, r); setMe(m); if (m.orgs[0] && !m.orgs.find((o) => o.id === orgId)) setOrgId(m.orgs[0].id) },
    logout: () => { tokens.clear(); setMe(null); location.href = "/login" },
    has: (...r) => !!me?.roles.some((x) => r.includes(x.role)),
    hasInOrg: (...r) => !!me?.roles.some((x) => r.includes(x.role) && (x.org_id === orgId || x.org_id === null)),
    reload,
  }), [me, loading, orgId, reload])
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}
export const useAuth = () => useContext(AuthCtx)

export const ROLE_LABEL: Record<Role, string> = {
  admin: t("Admin"), operator: t("Operator"), kepsek: t("Kepala Sekolah"), petugas: t("Petugas Monitoring"), user: t("Pengguna umum"),
}
/** Pengguna umum (daftar mandiri) hanya punya kalkulator jejak karbon pribadi. */
export const isUserOnly = (me: Me | null) => !!me && me.roles.length > 0 && me.roles.every((r) => r.role === "user")
/** Petugas Monitoring murni (tanpa peran operator/kepsek/admin) memakai aplikasi lapangan bergaya ponsel. */
export const isPetugasOnly = (me: Me | null) => !!me && me.roles.some((r) => r.role === "petugas") && me.roles.every((r) => r.role === "petugas" || r.role === "user")
export function homeFor(me: Me) {
  return isUserOnly(me) ? "/footprint" : isPetugasOnly(me) ? "/" : "/app"
}
