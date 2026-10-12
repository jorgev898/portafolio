import { CHAPTERS } from '../content/sections'

export const PAGE_W = 1
export const PAGE_H = 1.5
export const COVER_W = 1.04
export const COVER_H = 1.58

/** Páginas lineales del libro: 0 = índice (interior de la portada), 1..4 = secciones, 5 = cierre. */
export const PAGE_COUNT = CHAPTERS.length + 2

/** Hojas móviles, de arriba abajo: la portada (rígida) y tres hojas de papel (blandas). */
export const LEAVES = [
  { width: COVER_W, height: COVER_H, curl: 0.08, soft: 0.15 },
  { width: PAGE_W, height: PAGE_H, curl: 0.55, soft: 1 },
  { width: PAGE_W, height: PAGE_H, curl: 0.55, soft: 1 },
  { width: PAGE_W, height: PAGE_H, curl: 0.55, soft: 1 },
]

/** Cuánto adelanta la esquina agarrada al resto de la hoja (radianes en el borde libre). */
export const LEAN = 0.4

/** Página enfocada cuando el libro está cerrado. */
export const CLOSED = -1

/** Hojas que deben estar giradas para mostrar la página `page`. */
export const turnedFor = (page: number) => (page < 0 ? 0 : Math.floor(page / 2) + 1)

/** Página a la que se llega desde `p` avanzando (1) o retrocediendo (-1). */
export function nextPage(p: number, dir: 1 | -1, singlePage: boolean) {
  if (singlePage) return Math.min(PAGE_COUNT - 1, Math.max(CLOSED, p + dir))
  // Doble página: saltamos a la página izquierda del pliego siguiente/anterior.
  if (p === CLOSED) return dir > 0 ? 0 : CLOSED
  const spread = Math.floor(p / 2)
  const next = dir > 0 ? (spread + 1) * 2 : (spread - 1) * 2
  if (next >= PAGE_COUNT) return p
  return next < 0 ? CLOSED : next
}

/** Hoja que se arrastra al ir hacia `dir`, o -1 si ese paso no gira ninguna hoja. */
export function leafToDrag(page: number, dir: 1 | -1, singlePage: boolean) {
  const from = turnedFor(page)
  const to = turnedFor(nextPage(page, dir, singlePage))
  return from === to ? -1 : dir > 0 ? from : from - 1
}

/** Punto en el plano del libro: x desde el lomo, y desde el centro, en unidades de página. */
export type BookPoint = { x: number; y: number }

/** Estado del arrastre; lo escribe App con el puntero y lo lee Book cada fotograma. */
export type DragState = {
  active: boolean
  /** Hoja que sigue a la mano. */
  leaf: number
  /** Giro objetivo de esa hoja, 0 (plana a la derecha) a 1 (girada a la izquierda). */
  p: number
  /** Altura de la mano sobre la hoja, -1 (abajo) a 1 (arriba): esa esquina va por delante. */
  grabY: number
  /** Distancia del lomo al punto agarrado; es el radio con el que gira bajo el dedo. */
  radius: number
  /** Sentido del gesto: 1 hacia la izquierda (avanzar), -1 hacia la derecha. */
  dir: 1 | -1
  /** Soltada sin confirmar el giro: la hoja vuelve a su sitio. */
  cancel: boolean
  /** Proyecta un punto de pantalla sobre el plano del libro. Lo asigna Book al montarse. */
  toBook: ((clientX: number, clientY: number) => BookPoint | null) | null
}

export const createDrag = (): DragState => ({
  active: false,
  leaf: -1,
  p: 0,
  grabY: 0,
  radius: 1,
  dir: 1,
  cancel: false,
  toBook: null,
})

/**
 * Empieza a arrastrar `leaf` si el gesto nació encima de ella: la hoja de la derecha
 * para avanzar, la de la izquierda para retroceder. Devuelve false si no.
 */
export function grabLeaf(drag: DragState, leaf: number, dir: 1 | -1, clientX: number, clientY: number) {
  const hit = drag.toBook?.(clientX, clientY)
  if (!hit) return false
  const { width, height } = LEAVES[leaf]
  const along = hit.x * dir
  if (along <= 0 || along > width || Math.abs(hit.y) > height / 2) return false
  drag.leaf = leaf
  drag.dir = dir
  drag.radius = Math.max(along, width * 0.5)
  drag.grabY = clampUnit(hit.y / (height / 2))
  drag.cancel = false
  drag.active = true
  return true
}

/** Lleva la hoja agarrada bajo la mano: el punto agarrado gira en un círculo alrededor del lomo. */
export function moveLeaf(drag: DragState, clientX: number, clientY: number) {
  const hit = drag.toBook?.(clientX, clientY)
  if (!hit) return
  const { width, height, curl, soft } = LEAVES[drag.leaf]
  drag.grabY = clampUnit(hit.y / (height / 2))
  // Ángulo al que tiene que estar el punto agarrado para quedar bajo la mano.
  const theta = Math.acos(clampUnit(hit.x / drag.radius))
  // El papel se curva y la esquina agarrada se adelanta (ver bendLeaf en Book): ese punto va
  // por delante del giro base. Se descuenta resolviendo πp + k·sin(πp) = θ por punto fijo.
  const k = (curl + drag.dir * soft * LEAN * drag.grabY ** 2) * 0.5 * (drag.radius / width)
  let p = theta / Math.PI
  for (let i = 0; i < 5; i++) p = clamp01((theta - k * Math.sin(Math.PI * p)) / Math.PI)
  drag.p = p
}

const clampUnit = (v: number) => Math.min(1, Math.max(-1, v))
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** Hay un cursor que puede pasar por encima (en táctil no hay hover). */
export const hasHover = () =>
  typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches
