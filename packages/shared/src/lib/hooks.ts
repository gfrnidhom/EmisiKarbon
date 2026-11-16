import { useQuery } from "@tanstack/react-query"
import { api } from "./api"
import { useAuth } from "./auth"

export function useOrg() {
  const { orgId } = useAuth()
  const q = useQuery({ queryKey: ["org", orgId], queryFn: () => api<any>(`/orgs/${orgId}`), enabled: !!orgId })
  const roles: string[] = q.data?.myRoles ?? []
  return { orgId: orgId!, org: q.data, roles, can: (...r: string[]) => roles.some((x) => r.includes(x)), ...q }
}
export function useGeo() {
  return () => new Promise<{ lat: number; lng: number; accuracy: number } | null>((resolve) => {
    if (!navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(null), { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 })
  })
}
