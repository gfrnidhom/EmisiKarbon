import { createHmac, createHash, randomBytes, randomInt } from "crypto"
import type { Context, MiddlewareHandler } from "hono"
import { HTTPException } from "hono/http-exception"
import { sign, verify } from "hono/jwt"
import { q, json } from "./db"
import { CONFIG } from "./config"

export const SECRET = CONFIG.JWT_SECRET
export const QR_SECRET = CONFIG.QR_SECRET
export const DEV_SHOW_OTP = CONFIG.DEV_SHOW_OTP

/** admin · operator (input & ACC data petugas) · kepsek (lihat saja) · petugas (petugas monitoring) · user (pengguna umum) */
export type Role = "admin" | "operator" | "kepsek" | "petugas" | "user"
export interface Assignment { role: Role; org_id: number | null; region_id: number | null }
export interface AuthUser { id: number; email: string; name: string; roles: Assignment[] }

// ---------------- waktu (disimpan UTC, ditampilkan WIB) ----------------
export const WIB_OFFSET_MS = 7 * 3600 * 1000
export const todayWIB = () => new Date(Date.now() + WIB_OFFSET_MS).toISOString().slice(0, 10)
export const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00Z")
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
export const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000)
export const monthOf = (iso: string) => iso.slice(0, 7)
export const daysInMonth = (ym: string) => {
  const [y, m] = ym.split("-").map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}
export function addWorkingDays(iso: string, n: number) {
  let d = iso
  let left = n
  while (left > 0) {
    d = addDays(d, 1)
    const dow = new Date(d + "T00:00:00Z").getUTCDay()
    if (dow !== 0 && dow !== 6) left--
  }
  return d
}
export const sha256 = (data: string | Uint8Array | ArrayBuffer) =>
  createHash("sha256").update(data instanceof ArrayBuffer ? new Uint8Array(data) : data).digest("hex")

// ---------------- QR ber-HMAC (TREE-01, NFR-07) ----------------
export const qrSign = (code: string) => createHmac("sha256", CONFIG.QR_SECRET).update(code).digest("base64url").slice(0, 12)
export const qrVerify = (code: string, sig: string) => !!sig && qrSign(code) === sig

// ---------------- OTP & token (AUTH-01) ----------------
export const hashOtp = (email: string, code: string) => sha256(`${email}:${code}:${CONFIG.JWT_SECRET}`)
export const newOtp = () => String(randomInt(0, 1_000_000)).padStart(6, "0")
export const randomToken = (n = 24) => randomBytes(n).toString("base64url")

export async function issueTokens(userId: number) {
  const now = Math.floor(Date.now() / 1000)
  const access = await sign({ sub: userId, iat: now, exp: now + 60 * 60 * 8 }, CONFIG.JWT_SECRET, "HS256")
  const refresh = randomToken(32)
  ;(await q.run("INSERT INTO refresh_tokens(token, user_id, expires_at) VALUES (?, ?, ?)", refresh, userId, now + 60 * 60 * 24 * 30))
  return { access, refresh }
}

export async function loadUser(id: number): Promise<AuthUser | undefined> {
  const u = (await q.get("SELECT id, email, name FROM users WHERE id = ? AND active = 1", id))
  if (!u) return
  const roles = (await q.all<Assignment>(
    "SELECT role, org_id, region_id FROM role_assignments WHERE user_id = ? AND (valid_to IS NULL OR valid_to >= date('now'))",
    id,
  ))
  return { id: u.id, email: u.email, name: u.name, roles }
}

declare module "hono" {
  interface ContextVariableMap { user: AuthUser }
}

export const requireAuth: MiddlewareHandler = async (c, next) => {
  const qt = c.req.query("token")
  const h = c.req.header("Authorization") ?? (qt ? `Bearer ${qt}` : undefined)
  if (!h?.startsWith("Bearer ")) throw new HTTPException(401, { message: "Belum masuk" })
  try {
    const p = await verify(h.slice(7), CONFIG.JWT_SECRET, "HS256")
    const u = (await loadUser(Number(p.sub)))
    if (!u) throw new Error()
    c.set("user", u)
  } catch {
    throw new HTTPException(401, { message: "Sesi berakhir, silakan masuk lagi" })
  }
  await next()
}

export const hasRole = (u: AuthUser, ...roles: Role[]) => u.roles.some((r) => roles.includes(r.role))
export const requireRole = (...roles: Role[]): MiddlewareHandler => async (c, next) => {
  if (!hasRole(c.get("user"), ...roles)) throw new HTTPException(403, { message: "Tidak punya akses" })
  await next()
}

/** Daftar org yang boleh diakses (AUTH-02 lingkup tenant). */
export async function accessibleOrgIds(u: AuthUser): Promise<number[]> {
  const ids = new Set<number>()
  for (const r of u.roles) {
    if (r.role === "admin") {
      (await q.all<{ id: number }>("SELECT id FROM organizations")).forEach((o) => ids.add(o.id))
    } else if (r.org_id) ids.add(r.org_id)
  }
  return [...ids]
}
export async function assertOrg(c: Context, orgId: number) {
  const u = c.get("user")
  if (!(await accessibleOrgIds(u)).includes(orgId)) throw new HTTPException(403, { message: "Akses lintas lembaga ditolak" })
}
/** Peran user di org tertentu */
export async function rolesInOrg(u: AuthUser, orgId: number): Promise<Role[]> {
  const out = new Set<Role>()
  for (const r of u.roles) {
    if (r.org_id === orgId) out.add(r.role)
    if (r.org_id === null && r.role === "admin") out.add(r.role)
  }
  return [...out]
}
export async function assertOrgRole(c: Context, orgId: number, ...roles: Role[]) {
  (await assertOrg(c, orgId))
  const mine = (await rolesInOrg(c.get("user"), orgId))
  if (!mine.some((r) => roles.includes(r))) throw new HTTPException(403, { message: `Hanya ${roles.join("/")} yang dapat melakukan aksi ini` })
}

// ---------------- audit (ADM-04) ----------------
export async function audit(c: Context | null, action: string, objectType: string, objectId: unknown, before?: unknown, after?: unknown) {
  const actor = c?.get("user")?.id ?? null
  const ip = c?.req.header("x-forwarded-for") ?? (c as any)?.env?.ip ?? "local"
  ;(await q.run(
    "INSERT INTO audit_log(actor_id, action, object_type, object_id, before, after, ip) VALUES (?,?,?,?,?,?,?)",
    actor, action, objectType, String(objectId ?? ""), before === undefined ? null : JSON.stringify(before),
    after === undefined ? null : JSON.stringify(after), String(ip),
  ))
}

export async function notify(userIds: number[], title: string, body: string, link?: string) {
  for (const id of new Set(userIds)) (await q.run("INSERT INTO notifications(user_id, title, body, link) VALUES (?,?,?,?)", id, title, body, link ?? null))
}
export const orgUsers = async (orgId: number, ...roles: Role[]) =>
  (await q.all<{ user_id: number }>(
    `SELECT DISTINCT user_id FROM role_assignments WHERE org_id = ? AND role IN (${roles.map(() => "?").join(",")})`,
    orgId, ...roles,
  )).map((r) => r.user_id)
/** Penyetuju per jenis objek: data bulanan → operator lembaga; baseline & rapor → admin. */
export async function orgApprovers(orgId: number, objectType: string): Promise<number[]> {
  const rows = objectType === "activity" || objectType === "measurement"
    ? await q.all<{ user_id: number }>("SELECT DISTINCT r.user_id FROM role_assignments r JOIN users u ON u.id = r.user_id WHERE u.active = 1 AND r.role = 'operator' AND r.org_id = ?", orgId)
    : await q.all<{ user_id: number }>("SELECT DISTINCT r.user_id FROM role_assignments r JOIN users u ON u.id = r.user_id WHERE u.active = 1 AND r.role = 'admin'")
  return rows.map((r) => r.user_id)
}

// ---------------- state machine status data (§5.2, §8.2) ----------------
export type Status = "proyeksi" | "draf" | "menunggu_kepsek" | "diajukan" | "perlu_perbaikan" | "terverifikasi" | "terkunci"
const TRANSITIONS: Record<string, Status[]> = {
  // "terverifikasi" ditampilkan sebagai "Disahkan" (ACC operator/admin)
  draf: ["diajukan", "terverifikasi"],
  menunggu_kepsek: ["diajukan", "draf"],
  diajukan: ["terverifikasi", "perlu_perbaikan", "terkunci", "draf"],
  perlu_perbaikan: ["diajukan", "terverifikasi"],
  terverifikasi: ["terkunci"],
  terkunci: [],
}
export function assertTransition(from: string, to: Status) {
  if (!TRANSITIONS[from]?.includes(to))
    throw new HTTPException(409, { message: `Transisi status ${from} → ${to} tidak diizinkan` })
}

export const parseJsonCols = <T extends Record<string, any>>(row: T, cols: string[]) => {
  const out: any = { ...row }
  for (const k of cols) if (k in out) out[k] = json(out[k], k === "meta" || k === "checklist" || k === "classes" ? {} : [])
  return out as T
}
export const bad = (msg: string, status: 400 | 403 | 404 | 409 | 422 = 400) => new HTTPException(status, { message: msg })

/** Parameter URL → id internal. Menerima UUID (bentuk resmi di URL) maupun id angka lama. */
export async function rowId(table: string, raw: string | undefined): Promise<number> {
  const v = String(raw ?? "")
  if (/^\d+$/.test(v)) return Number(v)
  if (!/^[0-9a-f-]{36}$/i.test(v)) return -1
  const r = await q.get<{ id: number }>(`SELECT id FROM ${table} WHERE uuid = ?`, v.toLowerCase())
  return r?.id ?? -1
}
