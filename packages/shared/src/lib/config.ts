/**
 * Konfigurasi terpusat frontend (web, admin, petugas).
 * Semua pembacaan variabel lingkungan Vite (import.meta.env) dikumpulkan di file ini.
 */

export type AppKind = "web" | "admin" | "petugas"

const metaEnv = import.meta.env

export const CLIENT_CONFIG = {
  /** Mode pengembangan Vite */
  IS_DEV: Boolean(metaEnv.DEV),

  /** Port server pengembangan Vite per aplikasi */
  DEV_PORT: {
    web: 5173,
    admin: 5174,
    petugas: 5175,
  } satisfies Record<AppKind, number>,

  /** Awalan subdomain produksi per aplikasi */
  SUBDOMAIN_PREFIX: {
    web: "",
    admin: "admin.",
    petugas: "petugas.",
  } satisfies Record<AppKind, string>,

  /** Override alamat penuh aplikasi bila tidak mengikuti pola subdomain */
  APP_URL: {
    web: metaEnv.VITE_URL_WEB as string | undefined,
    admin: metaEnv.VITE_URL_ADMIN as string | undefined,
    petugas: metaEnv.VITE_URL_PETUGAS as string | undefined,
  } satisfies Record<AppKind, string | undefined>,
} as const
