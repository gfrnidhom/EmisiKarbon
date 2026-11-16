import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** URL resmi memakai UUID: bila halaman dibuka dengan id angka lama, ganti alamat ke UUID tanpa menambah riwayat. */
export function canonicalUuidPath(prefix: string, param: string | undefined, uuid: string | undefined) {
  if (!uuid || !param || param === uuid) return null
  return `${prefix}/${uuid}${location.search}${location.hash}`
}
