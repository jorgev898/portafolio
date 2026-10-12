import * as THREE from 'three'
import { CHAPTERS, COMIC, CONTACT, type Chapter, type Panel } from '../content/sections'

export const INK = '#17130e'
export const PAPER = '#f2e8d5'
export const RED = '#d7262e'
export const BLUE = '#1f4fbf'
export const YELLOW = '#f6cf3c'
const CYAN = '#19b8d6'
const MAGENTA = '#e2367d'

const DISPLAY = 'Bangers, Impact, sans-serif'
const TEXT = '"Comic Neue", "Comic Sans MS", sans-serif'

/** Resolución base de una página (proporción 1 : 1,5). */
export const PAGE_PX = { w: 800, h: 1200 }

type Ctx = CanvasRenderingContext2D

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return { c, ctx: c.getContext('2d')! }
}

/** PRNG determinista para que el papel salga igual en cada carga. */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function paper(ctx: Ctx, w: number, h: number, seed = 1) {
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, w, h)
  const r = rng(seed)
  ctx.fillStyle = 'rgba(80, 60, 30, 0.05)'
  for (let i = 0; i < 1600; i++) ctx.fillRect(r() * w, r() * h, 1.5, 1.5)
}

/** Tramado de puntos (Ben-Day). `density(u, v)` devuelve 0..1 para cada celda. */
function halftone(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  density: (u: number, v: number) => number,
  step = 14,
) {
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  ctx.fillStyle = color
  for (let row = 0, py = y; py < y + h + step; row++, py += step * 0.866) {
    const shift = row % 2 ? step / 2 : 0
    for (let px = x - step + shift; px < x + w + step; px += step) {
      const d = density((px - x) / w, (py - y) / h)
      if (d <= 0.02) continue
      ctx.beginPath()
      ctx.arc(px, py, (step / 2) * Math.min(1, d), 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()
}

/** Texto con desfase de color tipo impresión mal registrada. */
function offsetText(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  size: number,
  fill = INK,
  opts: { stroke?: string; align?: CanvasTextAlign; offset?: number } = {},
) {
  const { stroke, align = 'left', offset = Math.max(2, size * 0.04) } = opts
  ctx.save()
  ctx.font = `${size}px ${DISPLAY}`
  ctx.textAlign = align
  ctx.textBaseline = 'alphabetic'
  ctx.lineJoin = 'round'
  ctx.globalAlpha = 0.85
  ctx.fillStyle = CYAN
  ctx.fillText(text, x - offset, y + offset * 0.4)
  ctx.fillStyle = MAGENTA
  ctx.fillText(text, x + offset, y - offset * 0.4)
  ctx.globalAlpha = 1
  if (stroke) {
    ctx.strokeStyle = stroke
    ctx.lineWidth = size * 0.12
    ctx.strokeText(text, x, y)
  }
  ctx.fillStyle = fill
  ctx.fillText(text, x, y)
  ctx.restore()
}

function wrap(ctx: Ctx, text: string, maxWidth: number) {
  const words = text.split(' ')
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else line = test
  }
  if (line) lines.push(line)
  return lines
}

/** Caja de texto de narrador (amarilla con borde de tinta). Devuelve su alto. */
function caption(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  w: number,
  size = 30,
  bg = YELLOW,
  rotate = 0,
) {
  ctx.save()
  ctx.font = `700 ${size}px ${TEXT}`
  const pad = size * 0.55
  const lines = wrap(ctx, text, w - pad * 2)
  const lh = size * 1.18
  const h = lines.length * lh + pad * 1.6
  ctx.translate(x, y)
  ctx.rotate(rotate)
  ctx.fillStyle = INK
  ctx.fillRect(7, 7, w, h)
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)
  ctx.lineWidth = 5
  ctx.strokeStyle = INK
  ctx.strokeRect(0, 0, w, h)
  ctx.fillStyle = INK
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  lines.forEach((l, i) => ctx.fillText(l, pad, pad * 0.8 + i * lh))
  ctx.restore()
  return h
}

function panel(ctx: Ctx, x: number, y: number, w: number, h: number) {
  ctx.lineWidth = 7
  ctx.strokeStyle = INK
  ctx.strokeRect(x, y, w, h)
}

/** Estallido de onomatopeya. */
function burst(ctx: Ctx, cx: number, cy: number, r: number, text: string, fill = YELLOW, seed = 3) {
  const rand = rng(seed)
  const spikes = 14
  ctx.save()
  ctx.beginPath()
  for (let i = 0; i <= spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2
    const rr = i % 2 ? r * (0.62 + rand() * 0.08) : r * (0.95 + rand() * 0.12)
    ctx.lineTo(cx + Math.cos(a) * rr * 1.25, cy + Math.sin(a) * rr)
  }
  ctx.closePath()
  ctx.fillStyle = INK
  ctx.translate(6, 6)
  ctx.fill()
  ctx.translate(-6, -6)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.lineWidth = 5
  ctx.strokeStyle = INK
  ctx.stroke()
  ctx.restore()
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(-0.12)
  offsetText(ctx, text, 0, r * 0.22, r * 0.55, RED, { stroke: INK, align: 'center' })
  ctx.restore()
}

/** Telaraña desde una esquina. */
function web(ctx: Ctx, ox: number, oy: number, radius: number, color: string, from: number, to: number) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 3
  const spokes = 9
  const angles = Array.from({ length: spokes }, (_, i) => from + ((to - from) * i) / (spokes - 1))
  for (const a of angles) {
    ctx.beginPath()
    ctx.moveTo(ox, oy)
    ctx.lineTo(ox + Math.cos(a) * radius, oy + Math.sin(a) * radius)
    ctx.stroke()
  }
  for (let ring = 1; ring <= 6; ring++) {
    const rr = (radius / 6.2) * ring
    ctx.beginPath()
    angles.forEach((a, i) => {
      const px = ox + Math.cos(a) * rr
      const py = oy + Math.sin(a) * rr
      if (i === 0) ctx.moveTo(px, py)
      else {
        const pa = angles[i - 1]
        const mid = (a + pa) / 2
        const sag = rr * 0.86
        ctx.quadraticCurveTo(ox + Math.cos(mid) * sag, oy + Math.sin(mid) * sag, px, py)
      }
    })
    ctx.stroke()
  }
  ctx.restore()
}

function pageNumber(ctx: Ctx, n: number, w: number, h: number, side: 'left' | 'right') {
  ctx.save()
  ctx.font = `34px ${DISPLAY}`
  ctx.fillStyle = INK
  ctx.textAlign = side === 'left' ? 'left' : 'right'
  ctx.fillText(String(n), side === 'left' ? 52 : w - 52, h - 34)
  ctx.restore()
}

/** Reduce el tamaño hasta que el texto quepa en una línea de `maxW`. Devuelve el tamaño usado. */
function fitSize(ctx: Ctx, text: string, font: (size: number) => string, maxW: number, maxSize: number) {
  let size = maxSize
  ctx.font = font(size)
  while (size > 12 && ctx.measureText(text).width > maxW) ctx.font = font((size -= 4))
  return size
}

/** Texto centrado en varias líneas alrededor de (cx, cy). */
function centered(ctx: Ctx, text: string, cx: number, cy: number, maxW: number, size: number, color: string, font = TEXT) {
  ctx.save()
  ctx.font = `700 ${size}px ${font}`
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const lines = wrap(ctx, text, maxW)
  const lh = size * 1.2
  lines.forEach((l, i) => ctx.fillText(l, cx, cy + (i - (lines.length - 1) / 2) * lh))
  ctx.restore()
}

/** Bocadillo de diálogo con la cola apuntando a (tx, ty). */
function speech(ctx: Ctx, text: string, cx: number, cy: number, w: number, tx: number, ty: number, size = 30) {
  ctx.save()
  ctx.font = `700 ${size}px ${TEXT}`
  const lines = wrap(ctx, text, w * 0.7)
  const rx = w / 2
  const ry = (lines.length * size * 1.2) / 2 + size * 1.1
  const shape = () => {
    const a = Math.atan2(ty - cy, tx - cx)
    ctx.beginPath()
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
    ctx.moveTo(cx + Math.cos(a - 0.3) * rx * 0.8, cy + Math.sin(a - 0.3) * ry * 0.8)
    ctx.lineTo(tx, ty)
    ctx.lineTo(cx + Math.cos(a + 0.3) * rx * 0.8, cy + Math.sin(a + 0.3) * ry * 0.8)
    ctx.closePath()
  }
  ctx.translate(6, 6)
  shape()
  ctx.fillStyle = INK
  ctx.fill()
  ctx.translate(-6, -6)
  // Contorno grueso primero y relleno encima: globo y cola quedan como una sola forma.
  shape()
  ctx.lineWidth = 10
  ctx.lineJoin = 'round'
  ctx.strokeStyle = INK
  ctx.stroke()
  ctx.fillStyle = '#fffaf0'
  ctx.fill()
  ctx.restore()
  centered(ctx, text, cx, cy, w * 0.7, size, INK)
}

type Rect = { x: number; y: number; w: number; h: number }

/** Pinta una viñeta según su tipo. Las que esperan material se ven como huecos marcados. */
function drawPanel(ctx: Ctx, p: Panel, r: Rect, accent: string) {
  const s = Math.min(r.w, r.h)
  const cx = r.x + r.w / 2
  const cy = r.y + r.h / 2
  const label = Math.max(22, s * 0.065)
  ctx.save()
  ctx.beginPath()
  ctx.rect(r.x, r.y, r.w, r.h)
  ctx.clip()
  if (p.kind === 'photo') {
    ctx.fillStyle = '#e4d8c0'
    ctx.fillRect(r.x, r.y, r.w, r.h)
    halftone(ctx, r.x, r.y, r.w, r.h, accent, (u, v) => 0.55 - Math.hypot(u - 0.5, v - 0.5) * 0.8, 12)
    ctx.setLineDash([18, 12])
    ctx.lineWidth = 4
    ctx.strokeStyle = 'rgba(23,19,14,0.55)'
    ctx.strokeRect(r.x + 20, r.y + 20, r.w - 40, r.h - 40)
    ctx.setLineDash([])
    offsetText(ctx, 'FOTO', cx, cy, s * 0.2, INK, { align: 'center' })
    centered(ctx, p.content, cx, cy + s * 0.16, r.w - 80, label, INK)
  } else if (p.kind === 'scene') {
    ctx.fillStyle = accent
    ctx.fillRect(r.x, r.y, r.w, r.h)
    halftone(ctx, r.x, r.y, r.w, r.h, 'rgba(23,19,14,0.35)', (u, v) => Math.hypot(u - 0.5, v - 0.55) * 1.3, 14)
    web(ctx, r.x + r.w, r.y, s * 1.1, 'rgba(242,232,213,0.3)', Math.PI * 0.5, Math.PI)
    offsetText(ctx, 'ESCENA 3D', cx, cy, s * 0.15, PAPER, { align: 'center', stroke: INK })
    centered(ctx, p.content, cx, cy + s * 0.16, r.w - 80, label, PAPER)
  } else if (p.kind === 'type') {
    ctx.fillStyle = PAPER
    ctx.fillRect(r.x, r.y, r.w, r.h)
    halftone(ctx, r.x, r.y, r.w, r.h, accent, (_, v) => 0.15 + (1 - v) * 0.45, 12)
    // Un año o una palabra: gigante en una línea. Una frase: en varias líneas.
    const size = fitSize(ctx, p.content, (n) => `${n}px ${DISPLAY}`, r.w - 50, s * 0.42)
    if (size >= s * 0.2) offsetText(ctx, p.content, cx, cy + size * 0.35, size, YELLOW, { align: 'center', stroke: INK })
    else centered(ctx, p.content, cx, cy, r.w - 50, s * 0.11, INK, DISPLAY)
  } else {
    const size = Math.max(20, s * 0.075)
    ctx.fillStyle = '#1d1a24'
    ctx.fillRect(r.x, r.y, r.w, r.h)
    ctx.font = `700 ${size}px "Courier New", monospace`
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    ctx.fillStyle = '#7ee0a1'
    ctx.fillText('$ git log -1', r.x + 24, r.y + 28)
    ctx.fillStyle = PAPER
    wrap(ctx, p.content, r.w - 48).forEach((l, i) => ctx.fillText(l, r.x + 24, r.y + 28 + size * 1.7 + i * size * 1.25))
  }
  ctx.restore()
  panel(ctx, r.x, r.y, r.w, r.h)
}

function toTexture(c: HTMLCanvasElement, mirrored = false) {
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  if (mirrored) {
    tex.wrapS = THREE.RepeatWrapping
    tex.repeat.x = -1
    tex.offset.x = 1
  }
  return tex
}

// ─── Páginas ────────────────────────────────────────────────────────────────

export function drawCover(w = 832, h = 1264) {
  const { c, ctx } = canvas(w, h)
  ctx.fillStyle = RED
  ctx.fillRect(0, 0, w, h)
  halftone(ctx, 0, 0, w, h, '#a3121c', (u, v) => 0.25 + v * 0.75 - u * 0.2, 18)
  // Franja azul diagonal
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(0, h * 0.62)
  ctx.lineTo(w, h * 0.48)
  ctx.lineTo(w, h)
  ctx.lineTo(0, h)
  ctx.closePath()
  ctx.fillStyle = BLUE
  ctx.fill()
  ctx.clip()
  halftone(ctx, 0, h * 0.45, w, h * 0.55, '#13317d', (u, v) => 0.2 + u * 0.6 + v * 0.3, 16)
  ctx.restore()
  ctx.lineWidth = 8
  ctx.strokeStyle = INK
  ctx.beginPath()
  ctx.moveTo(0, h * 0.62)
  ctx.lineTo(w, h * 0.48)
  ctx.stroke()

  web(ctx, w, h * 0.48, w * 0.95, 'rgba(23,19,14,0.55)', Math.PI * 0.5, Math.PI * 1.05)

  // Recuadro de número, como en las portadas clásicas
  ctx.fillStyle = PAPER
  ctx.fillRect(40, 40, 150, 120)
  ctx.lineWidth = 6
  ctx.strokeStyle = INK
  ctx.strokeRect(40, 40, 150, 120)
  ctx.fillStyle = INK
  ctx.font = `30px ${DISPLAY}`
  ctx.textAlign = 'center'
  ctx.fillText('Nº', 115, 82)
  ctx.font = `64px ${DISPLAY}`
  ctx.fillText('1', 115, 144)

  // Cabecera
  const [first, ...rest] = COMIC.title.toUpperCase().split(' ')
  offsetText(ctx, first, w / 2 + 70, 210, 170, YELLOW, { stroke: INK, align: 'center', offset: 7 })
  offsetText(ctx, rest.join(' '), w / 2, 390, 200, YELLOW, { stroke: INK, align: 'center', offset: 8 })

  caption(ctx, COMIC.issue, 70, 450, 380, 32, PAPER, -0.03)
  burst(ctx, w * 0.7, h * 0.68, 120, '¡ÁBREME!', YELLOW, 11)
  caption(ctx, COMIC.tagline, 60, h - 210, w - 120, 36, YELLOW, 0.015)

  ctx.lineWidth = 14
  ctx.strokeStyle = INK
  ctx.strokeRect(7, 7, w - 14, h - 14)
  return toTexture(c)
}

export function drawIndex() {
  const { w, h } = PAGE_PX
  const { c, ctx } = canvas(w, h)
  paper(ctx, w, h, 7)
  halftone(ctx, 0, 0, w, h, 'rgba(31,79,191,0.22)', (u, v) => 1 - (u + v) * 0.9, 16)
  offsetText(ctx, 'ÍNDICE', 60, 170, 130, INK)
  ctx.font = `700 40px ${TEXT}`
  CHAPTERS.forEach((s, i) => {
    const y = 290 + i * 110
    ctx.fillStyle = i % 2 ? BLUE : RED
    ctx.fillRect(60, y - 50, 70, 70)
    ctx.lineWidth = 5
    ctx.strokeStyle = INK
    ctx.strokeRect(60, y - 50, 70, 70)
    ctx.fillStyle = PAPER
    ctx.font = `48px ${DISPLAY}`
    ctx.textAlign = 'center'
    ctx.fillText(String(i + 1), 95, y + 6)
    ctx.textAlign = 'left'
    ctx.fillStyle = INK
    ctx.font = `56px ${DISPLAY}`
    ctx.fillText(s.title.toUpperCase(), 160, y + 8)
    ctx.font = `700 30px ${TEXT}`
    ctx.textAlign = 'right'
    ctx.fillText(s.year, w - 60, y + 4)
    ctx.textAlign = 'left'
    ctx.setLineDash([4, 10])
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(160, y + 30)
    ctx.lineTo(w - 60, y + 30)
    ctx.stroke()
    ctx.setLineDash([])
  })
  caption(
    ctx,
    'Haz clic o desliza para pasar de página. Flechas del teclado también valen.',
    60,
    780,
    w - 120,
    30,
  )
  ctx.font = `400 22px ${TEXT}`
  ctx.fillStyle = INK
  const credit = wrap(
    ctx,
    'Modelo 3D: “Lego Spiderman minifigure version 2” de Neut2000 (Sketchfab), licencia CC BY 4.0.',
    w - 120,
  )
  credit.forEach((l, i) => ctx.fillText(l, 60, h - 110 + i * 28))
  return toTexture(c, true)
}

export function drawChapter(chapter: Chapter, index: number, side: 'left' | 'right') {
  const { w, h } = PAGE_PX
  const { c, ctx } = canvas(w, h)
  paper(ctx, w, h, 20 + index)
  const accent = index % 2 ? BLUE : RED
  const m = 44

  caption(ctx, `CAP. ${index + 1} · ${chapter.year}`, m, m, 330, 28)
  offsetText(ctx, chapter.title.toUpperCase(), m, 210, 110, INK)

  // Viñeta grande con la narración arriba y el bocadillo abajo
  const main = { x: m, y: 240, w: w - m * 2, h: 520 }
  drawPanel(ctx, chapter.main, main, accent)
  caption(ctx, chapter.narration, main.x - 14, main.y - 14, main.w * 0.66, 28, YELLOW, -0.015)
  speech(ctx, chapter.bubble, main.x + main.w * 0.68, main.y + main.h - 70, 360, main.x + main.w * 0.4, main.y + main.h - 24, 26)

  // Dos viñetas pequeñas
  const gap = 24
  const pw = (w - m * 2 - gap) / 2
  const py = main.y + main.h + gap
  const ph = h - py - 90
  chapter.small.forEach((p, i) => drawPanel(ctx, p, { x: m + i * (pw + gap), y: py, w: pw, h: ph }, i ? RED : BLUE))
  burst(ctx, 150, h - 70, 70, chapter.sfx, YELLOW, 5 + index)

  pageNumber(ctx, index + 1, w, h, side)
  return toTexture(c, side === 'left')
}

export function drawEnd() {
  const { w, h } = PAGE_PX
  const { c, ctx } = canvas(w, h)
  paper(ctx, w, h, 99)
  halftone(ctx, 0, 0, w, h, 'rgba(215,38,46,0.28)', (u, v) => Math.hypot(u - 0.5, v - 0.45) * 1.4, 16)
  web(ctx, 0, 0, w * 1.1, 'rgba(23,19,14,0.18)', 0, Math.PI / 2)
  ctx.save()
  ctx.translate(w / 2, h * 0.3)
  ctx.rotate(-0.06)
  offsetText(ctx, '¿CONTINUARÁ…?', 0, 0, 120, RED, { stroke: INK, align: 'center', offset: 6 })
  ctx.restore()
  // El siguiente capítulo lo escribe quien lee: el contacto.
  const top = h * 0.36
  const inviteH = caption(ctx, CONTACT.invite, 80, top, w - 160, 32, YELLOW, 0.02)
  CONTACT.links.forEach((l, i) => {
    const y = top + inviteH + 70 + i * 110
    ctx.fillStyle = INK
    ctx.fillRect(86, y + 6, w - 160, 80)
    ctx.fillStyle = PAPER
    ctx.fillRect(80, y, w - 160, 80)
    ctx.lineWidth = 5
    ctx.strokeStyle = INK
    ctx.strokeRect(80, y, w - 160, 80)
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.font = `44px ${DISPLAY}`
    ctx.fillStyle = i % 2 ? BLUE : RED
    ctx.fillText(l.label.toUpperCase(), 108, y + 44)
    ctx.font = `700 28px ${TEXT}`
    ctx.fillStyle = INK
    ctx.textAlign = 'right'
    ctx.fillText(l.href, w - 108, y + 42)
  })
  return toTexture(c)
}

export function drawBlank(mirrored = true) {
  const { w, h } = PAGE_PX
  const { c, ctx } = canvas(w, h)
  paper(ctx, w, h, 123)
  halftone(ctx, 0, 0, w, h, 'rgba(23,19,14,0.12)', (u) => 1 - u, 18)
  return toTexture(c, mirrored)
}

export function drawBoard(w = 416, h = 632) {
  const { c, ctx } = canvas(w, h)
  ctx.fillStyle = '#8f1820'
  ctx.fillRect(0, 0, w, h)
  halftone(ctx, 0, 0, w, h, 'rgba(23,19,14,0.4)', (_, v) => 0.3 + v * 0.5, 12)
  ctx.lineWidth = 10
  ctx.strokeStyle = INK
  ctx.strokeRect(5, 5, w - 10, h - 10)
  return toTexture(c)
}
