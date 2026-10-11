import * as THREE from 'three'
import { COMIC, SECTIONS, type Section } from '../content/sections'

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
  SECTIONS.forEach((s, i) => {
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
    ctx.fillText(`pág. ${i + 1}`, w - 60, y + 4)
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

export function drawSection(section: Section, index: number, side: 'left' | 'right') {
  const { w, h } = PAGE_PX
  const { c, ctx } = canvas(w, h)
  paper(ctx, w, h, 20 + index)
  const accent = index % 2 ? BLUE : RED
  const m = 44

  caption(ctx, section.chapter.toUpperCase(), m, m, 260, 28)
  offsetText(ctx, section.title.toUpperCase(), m, 220, 120, INK)

  // Viñeta principal
  const p1 = { x: m, y: 260, w: w - m * 2, h: 470 }
  ctx.fillStyle = accent
  ctx.fillRect(p1.x, p1.y, p1.w, p1.h)
  halftone(ctx, p1.x, p1.y, p1.w, p1.h, 'rgba(23,19,14,0.35)', (u, v) => Math.hypot(u - 0.85, v - 0.15) * 1.1, 15)
  web(ctx, p1.x + p1.w, p1.y, p1.w * 0.9, 'rgba(242,232,213,0.35)', Math.PI * 0.5, Math.PI)
  panel(ctx, p1.x, p1.y, p1.w, p1.h)
  caption(ctx, section.lead, p1.x + 30, p1.y + 40, p1.w * 0.72, 40, PAPER, -0.02)

  // Dos viñetas secundarias
  const gap = 24
  const pw = (w - m * 2 - gap) / 2
  const py = p1.y + p1.h + gap
  const ph = h - py - 90
  section.notes.slice(0, 2).forEach((note, i) => {
    const x = m + i * (pw + gap)
    halftone(ctx, x, py, pw, ph, i ? 'rgba(215,38,46,0.3)' : 'rgba(31,79,191,0.3)', (u, v) => 1 - v * 0.9 - u * 0.1, 13)
    panel(ctx, x, py, pw, ph)
    caption(ctx, note, x + 18, py + 22, pw - 36, 28, i ? YELLOW : PAPER)
  })
  burst(ctx, w - 170, py + ph - 70, 90, section.sfx, YELLOW, 5 + index)

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
  ctx.translate(w / 2, h * 0.47)
  ctx.rotate(-0.06)
  offsetText(ctx, '¿CONTINUARÁ…?', 0, 0, 120, RED, { stroke: INK, align: 'center', offset: 6 })
  ctx.restore()
  caption(ctx, 'Este cómic sigue en construcción. Vuelve pronto.', 90, h * 0.56, w - 180, 32, YELLOW, 0.02)
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
