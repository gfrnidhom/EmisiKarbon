import { Hono } from "hono"
import { q } from "../db"
import { audit, bad, issueTokens, loadUser, requireAuth, accessibleOrgIds, randomToken, addDays, todayWIB } from "../lib"

export const auth = new Hono()

// AUTH-01 (revisi): masuk dengan email + kata sandi. 5 kali gagal → jeda 15 menit.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const fails = new Map<string, { n: number; until: number }>()
const normEmail = (e: unknown) => String(e ?? "").trim().toLowerCase()
function checkPassword(pw: string) {
  if (pw.length < 8) throw bad("Kata sandi minimal 8 karakter")
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) throw bad("Kata sandi harus memuat huruf dan angka")
}
async function finishLogin(c: any, userId: number) {
  ;(await q.run("UPDATE users SET last_login_at = datetime('now') WHERE id = ?", userId))
  const tokens = await issueTokens(userId)
  ;(await audit(c, "login", "user", userId))
  return c.json({ ...tokens, user: (await me(userId)) })
}

auth.post("/login", async (c) => {
  const { email, password } = await c.req.json<{ email: string; password: string }>()
  const e = normEmail(email)
  if (!EMAIL_RE.test(e) || !password) throw bad("Email dan kata sandi wajib diisi")
  const f = fails.get(e)
  if (f && f.until > Date.now()) throw bad(`Terlalu banyak percobaan. Coba lagi ${Math.ceil((f.until - Date.now()) / 60000)} menit lagi.`, 409)
  const u = (await q.get("SELECT id, password_hash FROM users WHERE email = ? AND active = 1", e))
  const ok = !!u?.password_hash && (await Bun.password.verify(String(password), u.password_hash))
  if (!ok) {
    const n = (f && f.until <= Date.now() && f.until !== 0 ? 0 : f?.n ?? 0) + 1
    fails.set(e, { n, until: n >= 5 ? Date.now() + 15 * 60 * 1000 : 0 })
    if (u && !u.password_hash) throw bad("Akun ini belum memiliki kata sandi. Hubungi admin lembaga.", 400)
    throw bad(n >= 5 ? "5 kali gagal — akun dijeda 15 menit" : "Email atau kata sandi salah", 400)
  }
  fails.delete(e)
  return finishLogin(c, u!.id)
})

// Pendaftaran mandiri hanya untuk pengguna umum (peran "user") — akses kalkulator jejak karbon pribadi.
// Akun sekolah (operator, kepala sekolah, petugas monitoring) & admin dibuat lewat undangan.
auth.post("/register", async (c) => {
  const { name, email, password } = await c.req.json<{ name: string; email: string; password: string }>()
  const e = normEmail(email)
  const n = String(name ?? "").trim().replace(/\s+/g, " ")
  if (n.length < 2 || n.length > 80) throw bad("Nama 2–80 karakter")
  if (!EMAIL_RE.test(e)) throw bad("Format email tidak valid")
  checkPassword(String(password ?? ""))
  if ((await q.get("SELECT 1 FROM users WHERE email = ?", e))) throw bad("Email sudah terdaftar. Silakan masuk.", 409)
  const hash = await Bun.password.hash(String(password))
  const r = (await q.run("INSERT INTO users(email, name, password_hash) VALUES (?,?,?)", e, n, hash))
  const id = Number(r.lastInsertRowid)
  ;(await q.run("INSERT INTO role_assignments(user_id, role, org_id) VALUES (?, 'user', NULL)", id))
  ;(await audit(c, "register", "user", id, null, { email: e, role: "user" }))
  return finishLogin(c, id)
})

// Undangan staf: penerima menetapkan nama & kata sandi sendiri (AUTH-03)
auth.post("/invite/complete", async (c) => {
  const { token, name, password } = await c.req.json<{ token: string; name: string; password: string }>()
  const inv = (await q.get("SELECT * FROM invitations WHERE token = ? AND accepted_at IS NULL AND expires_at >= ?", token, todayWIB()))
  if (!inv) throw bad("Undangan tidak valid atau kedaluwarsa (7 hari)", 404)
  checkPassword(String(password ?? ""))
  const n = String(name ?? "").trim() || inv.email.split("@")[0]
  const hash = await Bun.password.hash(String(password))
  let user = (await q.get("SELECT id FROM users WHERE email = ?", inv.email))
  if (user) (await q.run("UPDATE users SET password_hash = ?, name = COALESCE(NULLIF(name,''), ?) WHERE id = ?", hash, n, user.id))
  else user = { id: Number((await q.run("INSERT INTO users(email, name, password_hash) VALUES (?,?,?)", inv.email, n, hash)).lastInsertRowid) }
  ;(await q.run("INSERT INTO role_assignments(user_id, role, org_id) VALUES (?,?,?)", user.id, inv.role, inv.org_id))
  ;(await q.run("UPDATE invitations SET accepted_at = datetime('now') WHERE id = ?", inv.id))
  return finishLogin(c, user.id)
})

// Ganti kata sandi sendiri
auth.post("/password", requireAuth, async (c) => {
  const id = c.get("user").id
  const { current, next } = await c.req.json<{ current: string; next: string }>()
  const u = (await q.get("SELECT password_hash FROM users WHERE id = ?", id))
  if (u?.password_hash && !(await Bun.password.verify(String(current ?? ""), u.password_hash))) throw bad("Kata sandi saat ini salah", 400)
  checkPassword(String(next ?? ""))
  ;(await q.run("UPDATE users SET password_hash = ? WHERE id = ?", await Bun.password.hash(String(next)), id))
  ;(await audit(c, "change_password", "user", id))
  return c.json({ ok: true })
})

// Login OTP dinonaktifkan (diganti email + kata sandi)
auth.post("/otp/request", (c) => c.json({ error: "Login dengan kode OTP sudah tidak dipakai. Masuk dengan email dan kata sandi." }, 410))
auth.post("/otp/verify", (c) => c.json({ error: "Login dengan kode OTP sudah tidak dipakai. Masuk dengan email dan kata sandi." }, 410))

auth.post("/refresh", async (c) => {
  const { refresh } = await c.req.json<{ refresh: string }>()
  const r = (await q.get("SELECT * FROM refresh_tokens WHERE token = ?", refresh))
  if (!r || r.expires_at < Date.now() / 1000) throw bad("Sesi berakhir", 403)
  ;(await q.run("DELETE FROM refresh_tokens WHERE token = ?", refresh))
  return c.json(await issueTokens(r.user_id))
})

// Pindah domain tanpa login ulang (domain utama ⇄ admin. ⇄ petugas.): token tiap domain terpisah,
// jadi domain asal meminta kode sekali pakai (60 detik) lalu domain tujuan menukarnya dengan token baru.
const handoffs = new Map<string, { userId: number; exp: number }>()
auth.post("/handoff", requireAuth, async (c) => {
  const now = Date.now()
  for (const [k, v] of handoffs) if (v.exp < now) handoffs.delete(k)
  const code = randomToken(24)
  handoffs.set(code, { userId: c.get("user").id, exp: now + 60_000 })
  return c.json({ code })
})
auth.post("/handoff/exchange", async (c) => {
  const { code } = await c.req.json<{ code: string }>()
  const h = handoffs.get(String(code))
  handoffs.delete(String(code))
  if (!h || h.exp < Date.now()) throw bad("Tautan masuk sudah kedaluwarsa. Silakan masuk lagi.", 400)
  const tokens = await issueTokens(h.userId)
  return c.json({ ...tokens, user: (await me(h.userId)) })
})

auth.post("/invite/accept", async (c) => {
  const { token } = await c.req.json<{ token: string }>()
  const inv = (await q.get("SELECT i.*, o.name AS org_name FROM invitations i LEFT JOIN organizations o ON o.id = i.org_id WHERE token = ?", token))
  if (!inv || inv.expires_at < todayWIB()) throw bad("Undangan tidak valid atau kedaluwarsa (7 hari)", 404)
  return c.json({ email: inv.email, role: inv.role, org: inv.org_name })
})

auth.get("/me", requireAuth, async (c) => c.json((await me(c.get("user").id))))

// Ubah profil sendiri: nama & nomor HP. Email = identitas login OTP, diubah lewat admin.
auth.patch("/me", requireAuth, async (c) => {
  const id = c.get("user").id
  const b = await c.req.json<{ name?: string; phone?: string | null }>()
  const before = (await q.get("SELECT name, phone FROM users WHERE id = ?", id))
  const name = (b.name ?? before?.name ?? "").trim().replace(/\s+/g, " ")
  if (name.length < 2 || name.length > 80) throw bad("Nama 2–80 karakter")
  const phone = b.phone === undefined ? before?.phone ?? null : (b.phone ?? "").replace(/[^\d+]/g, "") || null
  if (phone && !/^\+?\d{9,15}$/.test(phone)) throw bad("Nomor HP tidak valid (9–15 digit)")
  ;(await q.run("UPDATE users SET name = ?, phone = ? WHERE id = ?", name, phone, id))
  ;(await audit(c, "update_profile", "user", id, before, { name, phone }))
  return c.json((await me(id)))
})

export async function me(id: number) {
  const u = (await loadUser(id))!
  const orgIds = (await accessibleOrgIds(u))
  const orgs = orgIds.length ? (await q.all(`SELECT id, name, short, kecamatan, jenjang FROM organizations WHERE id IN (${orgIds.join(",")}) ORDER BY id`)) : []
  const extra = (await q.get("SELECT phone, created_at FROM users WHERE id = ?", id))
  return { ...u, phone: extra?.phone ?? null, created_at: extra?.created_at ?? null, orgs }
}

export const newInvite = async (email: string, role: string, orgId: number | null, by: number) => {
  const token = randomToken(16)
  ;(await q.run("INSERT INTO invitations(email, role, org_id, token, invited_by, expires_at) VALUES (?,?,?,?,?,?)", email.toLowerCase(), role, orgId, token, by, addDays(todayWIB(), 7)))
  return token
}
