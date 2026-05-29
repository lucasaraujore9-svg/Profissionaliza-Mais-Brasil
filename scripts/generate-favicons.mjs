// Gera todos os ícones do sistema mãe a partir de public/images/logo.png.
//
// A marca "P" (capelo + P + avião) é extraída do logo horizontal — que tem
// transparência real — e centralizada num canvas quadrado TRANSPARENTE.
// Os ícones "any"/favicon ficam com fundo transparente (fica bom em abas
// claras e escuras). Os ícones "maskable" recebem o verde da marca, pois o
// formato maskable não admite transparência (o SO recorta em círculo/squircle).
//
// Uso:  node scripts/generate-favicons.mjs
import sharp from "sharp"
import { writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const LOGO = join(ROOT, "public/images/logo.png")
const ICONS_DIR = join(ROOT, "public/icons")
const APP_DIR = join(ROOT, "src/app")

const BRAND_GREEN = "#055918"
// Recorte da região esquerda do logo (marca P + capelo).
const LEFT_CROP_RATIO = 0.3

async function extractMark() {
  const meta = await sharp(LOGO).metadata()
  const cropW = Math.round(meta.width * LEFT_CROP_RATIO)
  const region = await sharp(LOGO)
    .extract({ left: 0, top: 0, width: cropW, height: meta.height })
    .png()
    .toBuffer()
  // Apara o transparente em volta da marca → bbox justa.
  const { data } = await sharp(region)
    .trim({ threshold: 10 })
    .toBuffer({ resolveWithObject: true })
  return data
}

// Centraliza a marca num canvas quadrado com a "ocupação" desejada.
async function squareMark(markBuf, side, { occupancy = 0.84, background } = {}) {
  const target = Math.round(side * occupancy)
  const fitted = await sharp(markBuf)
    .resize(target, target, {
      fit: "inside",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toBuffer({ resolveWithObject: true })

  const canvas = sharp({
    create: {
      width: side,
      height: side,
      channels: 4,
      background: background ?? { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
  return canvas
    .composite([{ input: fitted.data, gravity: "center" }])
    .png()
    .toBuffer()
}

// ICO mínimo com PNGs embutidos (16/32/48) — suportado por todos os
// navegadores modernos e por buscadores.
function buildIco(pngs) {
  const count = pngs.length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(count, 4)

  const entries = Buffer.alloc(16 * count)
  let offset = 6 + 16 * count
  pngs.forEach((p, i) => {
    const e = 16 * i
    entries.writeUInt8(p.size >= 256 ? 0 : p.size, e + 0) // width
    entries.writeUInt8(p.size >= 256 ? 0 : p.size, e + 1) // height
    entries.writeUInt8(0, e + 2) // palette
    entries.writeUInt8(0, e + 3) // reserved
    entries.writeUInt16LE(1, e + 4) // color planes
    entries.writeUInt16LE(32, e + 6) // bits per pixel
    entries.writeUInt32LE(p.buf.length, e + 8) // bytes in resource
    entries.writeUInt32LE(offset, e + 12) // offset
    offset += p.buf.length
  })

  return Buffer.concat([header, entries, ...pngs.map((p) => p.buf)])
}

async function main() {
  const mark = await extractMark()

  // Ícones "any" / favicons — fundo transparente.
  const transparentSizes = [
    [16, "favicon-16.png"],
    [32, "favicon-32.png"],
    [180, "apple-touch-icon.png"],
    [192, "icon-192.png"],
    [256, "icon-256.png"],
    [384, "icon-384.png"],
    [512, "icon-512.png"],
  ]
  for (const [size, name] of transparentSizes) {
    // favicons pequenos ganham um pouco mais de ocupação para legibilidade.
    const occupancy = size <= 32 ? 0.92 : 0.84
    const png = await squareMark(mark, size, { occupancy })
    await writeFile(join(ICONS_DIR, name), png)
    console.log(`✓ icons/${name} (${size}px, transparente)`)
  }

  // Ícones maskable — verde da marca + safe zone (ocupação menor).
  for (const size of [192, 512]) {
    const png = await squareMark(mark, size, {
      occupancy: 0.62,
      background: BRAND_GREEN,
    })
    const name = `icon-maskable-${size}.png`
    await writeFile(join(ICONS_DIR, name), png)
    console.log(`✓ icons/${name} (${size}px, maskable verde)`)
  }

  // favicon.ico transparente (16/32/48 embutidos).
  const icoPngs = await Promise.all(
    [16, 32, 48].map(async (size) => ({
      size,
      buf: await squareMark(mark, size, { occupancy: size <= 32 ? 0.92 : 0.88 }),
    })),
  )
  await writeFile(join(APP_DIR, "favicon.ico"), buildIco(icoPngs))
  console.log("✓ src/app/favicon.ico (16/32/48 transparente)")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
