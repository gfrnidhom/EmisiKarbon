// Kosongkan database lalu isi ulang data pilot: `bun run seed`
// PostgreSQL bila DATABASE_URL di-set (lihat .env), selain itu SQLite.
import { rmSync } from "fs"
import { DIALECT, close, resetSchema } from "./db"

console.log(`[reset] dialek: ${DIALECT}`)
await resetSchema()
rmSync(new URL("../data/uploads", import.meta.url).pathname, { recursive: true, force: true })
await import("./seed")
await close()
