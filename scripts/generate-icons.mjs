/**
 * Genera íconos PNG desde el SVG usando sharp (opcional).
 * Ejecutar: node scripts/generate-icons.mjs
 * Requiere: npm install -D sharp
 *
 * Si preferís, podés usar cualquier herramienta online para convertir
 * public/icons/icon.svg a icon-192x192.png e icon-512x512.png
 * y colocarlos en public/icons/
 */
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const svgPath   = join(__dirname, '../public/icons/icon.svg')

try {
  const { default: sharp } = await import('sharp')
  const svg = readFileSync(svgPath)
  for (const size of [192, 512]) {
    await sharp(svg)
      .resize(size, size)
      .png()
      .toFile(join(__dirname, `../public/icons/icon-${size}x${size}.png`))
    console.log(`✓ icon-${size}x${size}.png`)
  }
} catch {
  console.warn('⚠  sharp no instalado. Convertí el SVG manualmente o ejecutá: npm install -D sharp && node scripts/generate-icons.mjs')
}
