import sharp from "sharp"
const svg = await Bun.file(new URL("../public/favicon.svg", import.meta.url)).arrayBuffer()
const out = (n: string) => new URL(`../public/${n}`, import.meta.url).pathname
await sharp(Buffer.from(svg), { density: 600 }).resize(192, 192).png().toFile(out("pwa-192.png"))
await sharp(Buffer.from(svg), { density: 600 }).resize(512, 512).png().toFile(out("pwa-512.png"))
await sharp(Buffer.from(svg), { density: 600 }).resize(180, 180).png().toFile(out("apple-touch-icon.png"))
// maskable: padding 12% dengan latar penuh
const inner = await sharp(Buffer.from(svg), { density: 600 }).resize(400, 400).png().toBuffer()
await sharp({ create: { width: 512, height: 512, channels: 4, background: "#0f8a5f" } }).composite([{ input: inner, gravity: "center" }]).png().toFile(out("pwa-512-maskable.png"))
console.log("icons ok")
