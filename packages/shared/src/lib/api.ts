import { get, set } from "idb-keyval"

const TOKEN_KEY = "jh.token"
const REFRESH_KEY = "jh.refresh"

export const tokens = {
  get access() { try { return localStorage.getItem(TOKEN_KEY) } catch { return null } },
  get refresh() { try { return localStorage.getItem(REFRESH_KEY) } catch { return null } },
  set(a: string, r: string) { try { localStorage.setItem(TOKEN_KEY, a); localStorage.setItem(REFRESH_KEY, r) } catch { /* noop */ } },
  clear() { try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(REFRESH_KEY) } catch { /* noop */ } },
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

let refreshing: Promise<boolean> | null = null
async function tryRefresh() {
  const r = tokens.refresh
  if (!r) return false
  refreshing ??= fetch("/api/auth/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh: r }) })
    .then(async (res) => {
      if (!res.ok) return false
      const j = await res.json()
      tokens.set(j.access, j.refresh)
      return true
    })
    .catch(() => false)
    .finally(() => { setTimeout(() => (refreshing = null), 0) })
  return refreshing
}

export async function api<T = any>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.json !== undefined) { headers.set("Content-Type", "application/json"); init.body = JSON.stringify(init.json) }
  const t = tokens.access
  if (t) headers.set("Authorization", `Bearer ${t}`)
  let res = await fetch(`/api${path}`, { ...init, headers })
  if (res.status === 401 && (await tryRefresh())) {
    headers.set("Authorization", `Bearer ${tokens.access}`)
    res = await fetch(`/api${path}`, { ...init, headers })
  }
  if (res.status === 401) {
    tokens.clear()
    if (!location.pathname.startsWith("/login")) location.href = "/login"
  }
  const ct = res.headers.get("content-type") ?? ""
  const body = ct.includes("json") ? await res.json() : await res.text()
  if (!res.ok) throw new ApiError(res.status, (body as any)?.error ?? `Galat ${res.status}`)
  return body as T
}

export const fileUrl = (id: number) => `/api/files/${id}?token=${encodeURIComponent(tokens.access ?? "")}`

// ---------------- antrian offline (NFR-02) ----------------
export interface QueuedReq { id: string; path: string; method: string; body: unknown; label: string; createdAt: string; error?: string }
const QKEY = "jh.offline-queue"
const listeners = new Set<(n: number) => void>()
export async function queueList(): Promise<QueuedReq[]> { return ((await get(QKEY)) as QueuedReq[] | undefined) ?? [] }
async function queueSave(list: QueuedReq[]) { await set(QKEY, list); listeners.forEach((l) => l(list.length)) }
export function onQueueChange(fn: (n: number) => void) { listeners.add(fn); queueList().then((l) => fn(l.length)); return () => { listeners.delete(fn) } }

/** Kirim ke server; bila offline, simpan di antrian dengan Idempotency-Key agar tidak tercatat ganda. */
export async function sendOrQueue(path: string, body: unknown, label: string, method = "POST") {
  const id = crypto.randomUUID()
  if (navigator.onLine) {
    try {
      return { queued: false, data: await api(path, { method, json: body, headers: { "Idempotency-Key": id } }) }
    } catch (e) {
      if (!(e instanceof TypeError)) throw e // galat server tetap dilempar
    }
  }
  const list = await queueList()
  list.push({ id, path, method, body, label, createdAt: new Date().toISOString() })
  await queueSave(list)
  return { queued: true, data: null }
}
export async function flushQueue() {
  const list = await queueList()
  if (!list.length || !navigator.onLine) return { sent: 0, failed: 0 }
  const keep: QueuedReq[] = []
  let sent = 0
  for (const item of list) {
    try {
      await api(item.path, { method: item.method, json: item.body, headers: { "Idempotency-Key": item.id } })
      sent++
    } catch (e) {
      if (e instanceof TypeError) keep.push(item)
      // konflik: versi server menang, salinan lokal disimpan dengan pesan galat
      else keep.push({ ...item, error: (e as Error).message })
    }
  }
  await queueSave(keep)
  return { sent, failed: keep.length }
}
export async function dropQueued(id: string) { await queueSave((await queueList()).filter((x) => x.id !== id)) }

/** Kompres foto ≤ 500 KB (TREE-03) */
export async function compressImage(file: File, maxBytes = 500 * 1024): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") return file
  const img = await createImageBitmap(file)
  let scale = Math.min(1, 1600 / Math.max(img.width, img.height))
  let quality = 0.82
  for (let i = 0; i < 6; i++) {
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale)
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height)
    const blob: Blob = await new Promise((r) => canvas.toBlob((b) => r(b!), "image/jpeg", quality))
    if (blob.size <= maxBytes || i === 5) return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg", lastModified: file.lastModified })
    quality -= 0.12; scale *= 0.85
  }
  return file
}
export async function uploadEvidence(orgId: number, file: File, extra: { lat?: number; lng?: number } = {}) {
  const f = await compressImage(file)
  const fd = new FormData()
  fd.append("file", f)
  fd.append("taken_at", new Date(file.lastModified || Date.now()).toISOString())
  if (extra.lat) fd.append("lat", String(extra.lat))
  if (extra.lng) fd.append("lng", String(extra.lng))
  return api<{ id: number; sha256: string; flags: string[] }>(`/orgs/${orgId}/evidence`, { method: "POST", body: fd })
}
