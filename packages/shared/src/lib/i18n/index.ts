// i18n ringan: teks sumber berbahasa Indonesia menjadi kunci; kamus EN di en.ts (NFR-12).
// Ganti bahasa = simpan preferensi + muat ulang, agar konstanta modul ikut diterjemahkan.
import { EN } from "./en"

export type Lang = "id" | "en"
function initial(): Lang {
  try {
    const s = localStorage.getItem("jh.lang")
    if (s === "id" || s === "en") return s
  } catch { /* noop */ }
  return typeof navigator !== "undefined" && !navigator.language?.toLowerCase().startsWith("id") ? "en" : "id"
}
export const lang: Lang = initial()
if (typeof document !== "undefined") document.documentElement.lang = lang
export const locale = lang === "en" ? "en-GB" : "id-ID"

export function setLang(l: Lang) {
  try { localStorage.setItem("jh.lang", l) } catch { /* noop */ }
  location.reload()
}
const fill = (s: string, vars?: Record<string, string | number>) => (vars ? s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`)) : s)
/** Terjemahkan teks Indonesia ke bahasa aktif. */
export function t(s: string, vars?: Record<string, string | number>) {
  return fill(lang === "en" ? EN[s] ?? EN[s.trim()] ?? s : s, vars)
}
/** Teks dalam bahasa lain (untuk subjudul dwibahasa di navigasi). */
export function tOther(s: string) {
  return lang === "en" ? s : EN[s] ?? s
}
/** Pilih langsung: tl("Indonesia", "English") */
export const tl = (id: string, en: string) => (lang === "en" ? en : id)

/** Terjemahan pola teks yang dibentuk server (judul tugas pemantauan, detail). */
const PATTERNS: [RegExp, string][] = [
  [/^Input (.+) (\d{4}-\d{2})$/, "Enter $1 $2"],
  [/^Ukur ulang (\d+) pohon$/, "Remeasure $1 trees"],
  [/^Penimbangan sampah 5 hari$/, "5-day waste weighing"],
  [/^Survei mobilitas semester ini$/, "Mobility survey this semester"],
  [/^Perbaiki Survei Awal sesuai catatan Admin$/, "Fix the Baseline Survey per Admin notes"],
  [/^Perbaiki (.+) (\d{4}-\d{2})$/, "Fix $1 $2"],
  [/^Bulan itu tetap Proyeksi sampai diinput$/, "That month stays Projected until entered"],
  [/^Sesi terakhir (.+)$/, "Last session $1"],
  [/^Belum ada sesi$/, "No sessions yet"],
  [/^(\d+) pohon > 12 bulan: proyeksi berhenti$/, "$1 trees > 12 months: projection stopped"],
]
export function tServer(s?: string | null) {
  if (!s || lang === "id") return s ?? ""
  if (EN[s]) return EN[s]
  for (const [re, rep] of PATTERNS) if (re.test(s)) return s.replace(re, (...m) => rep.replace(/\$(\d)/g, (_, i) => t(m[Number(i)])))
  return s
}
