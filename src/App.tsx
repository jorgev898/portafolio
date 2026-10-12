import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Canvas } from '@react-three/fiber'
import { CHAPTERS, COMIC, CONTACT } from './content/sections'
import { useFontsReady, useReducedMotion, useSinglePage } from './lib/hooks'
import { CLOSED, PAGE_COUNT, createDrag, grabLeaf, leafToDrag, moveLeaf, nextPage } from './three/bookLayout'
import { Scene } from './three/Scene'

type StageEvent = ReactPointerEvent<HTMLDivElement>

const SWIPE_PX = 40
/** Movimiento antes de considerar que es un arrastre y no un clic. */
const DRAG_START_PX = 6
/** Velocidad (px/ms) de un golpe que confirma el giro aunque no pase de la mitad. */
const FLICK_SPEED = 0.45

type Gesture = {
  x: number
  y: number
  lastX: number
  lastT: number
  /** Velocidad horizontal suavizada, px/ms. */
  vx: number
  /** Dirección del arrastre (1 = adelante) cuando una hoja sigue a la mano. */
  dir: 1 | -1 | 0
  /** Ya se intentó agarrar una hoja en este gesto. */
  tried: boolean
}

/** Etiqueta legible de lo que se ve en cada página. */
const PAGE_LABELS = ['Índice', ...CHAPTERS.map((s) => s.title), '¿Continuará…?']

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" className="icon">
      <path
        d={dir === 'left' ? 'M15 4 7 12l8 8' : 'M9 4l8 8-8 8'}
        fill="none"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function App() {
  const [page, setPage] = useState(CLOSED)
  const singlePage = useSinglePage()
  const reducedMotion = useReducedMotion()
  const fontsReady = useFontsReady()

  const step = useCallback((dir: 1 | -1) => setPage((p) => nextPage(p, dir, singlePage)), [singlePage])
  const close = useCallback(() => setPage(CLOSED), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') step(1)
      else if (e.key === 'ArrowLeft') step(-1)
      else if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, close])

  // Arrastrar una hoja: el punto agarrado se queda bajo la mano; se confirma al pasar la mitad
  // (o con un golpe rápido). Clic: abre el libro o pasa de página según el lado.
  // Swipe: cuando el gesto no empezó sobre la hoja que tocaba girar.
  const [drag] = useState(createDrag)
  const down = useRef<Gesture | null>(null)

  const endDrag = (stage: HTMLElement, cancel: boolean) => {
    drag.active = false
    drag.cancel = cancel
    delete stage.dataset.drag
  }

  const onPointerDown = (e: StageEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    down.current = { x: e.clientX, y: e.clientY, lastX: e.clientX, lastT: e.timeStamp, vx: 0, dir: 0, tried: false }
  }
  const onPointerMove = (e: StageEvent) => {
    const g = down.current
    if (!g) return
    const dt = e.timeStamp - g.lastT
    if (dt > 0) g.vx = g.vx * 0.6 + ((e.clientX - g.lastX) / dt) * 0.4
    g.lastX = e.clientX
    g.lastT = e.timeStamp
    const dx = e.clientX - g.x
    const dy = e.clientY - g.y

    if (g.dir === 0) {
      if (g.tried || Math.abs(dx) < DRAG_START_PX || Math.abs(dx) < Math.abs(dy)) return
      // Se decide una sola vez por gesto: o agarra la hoja, o queda como swipe.
      g.tried = true
      const dir = dx < 0 ? 1 : -1
      const leaf = leafToDrag(page, dir, singlePage)
      if (leaf < 0 || !grabLeaf(drag, leaf, dir, g.x, g.y)) return
      g.dir = dir
      e.currentTarget.dataset.drag = ''
    }
    moveLeaf(drag, e.clientX, e.clientY)
  }
  const onPointerUp = (e: StageEvent) => {
    const g = down.current
    down.current = null
    if (!g) return
    if (g.dir !== 0) {
      const pastHalf = g.dir > 0 ? drag.p > 0.5 : drag.p < 0.5
      // Hacia delante la mano va a la izquierda (vx < 0); hacia atrás, a la derecha.
      const flicked = -g.vx * g.dir > FLICK_SPEED
      const goes = pastHalf || flicked
      endDrag(e.currentTarget, !goes)
      if (goes) step(g.dir)
      return
    }
    const dx = e.clientX - g.x
    const dy = e.clientY - g.y
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1)
    else if (Math.hypot(dx, dy) < 10) {
      if (page === CLOSED) step(1)
      else step(e.clientX > window.innerWidth / 2 ? 1 : -1)
    }
  }
  const onPointerCancel = (e: StageEvent) => {
    if (down.current && down.current.dir !== 0) endDrag(e.currentTarget, true)
    down.current = null
  }

  const isOpen = page !== CLOSED
  const lastPage = singlePage ? PAGE_COUNT - 1 : PAGE_COUNT - 2
  const atEnd = page >= lastPage
  const label = singlePage || !isOpen ? PAGE_LABELS[page] : `${PAGE_LABELS[page]} · ${PAGE_LABELS[page + 1]}`

  return (
    <>
      <div
        className="stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        aria-hidden="true"
      >
        <Canvas
          dpr={[1, 2]}
          camera={{ position: [0, 0, 6], fov: 35 }}
          gl={{ antialias: true, alpha: true }}
          flat
        >
          <Scene
            page={page}
            singlePage={singlePage}
            fontsReady={fontsReady}
            reducedMotion={reducedMotion}
            drag={drag}
          />
        </Canvas>
      </div>

      <div className="hud">
        {isOpen ? (
          <nav className="pager" aria-label="Páginas del cómic">
            <button type="button" className="btn" onClick={() => step(-1)} aria-label="Página anterior">
              <Chevron dir="left" />
            </button>
            <p className="pager-label" aria-live="polite">
              {label}
            </p>
            <button type="button" className="btn" onClick={() => step(1)} disabled={atEnd} aria-label="Página siguiente">
              <Chevron dir="right" />
            </button>
            <button type="button" className="btn btn-text" onClick={close}>
              Cerrar
            </button>
          </nav>
        ) : (
          <button type="button" className="hint" onClick={() => step(1)}>
            Haz clic en la portada para abrir
          </button>
        )}
      </div>

      <p className="credit">
        Modelo 3D:{' '}
        <a
          href="https://sketchfab.com/3d-models/lego-spiderman-minifigure-version-2-2010edbfc0a34201b659655539b33953"
          target="_blank"
          rel="noopener noreferrer"
        >
          Neut2000
        </a>{' '}
        · CC BY 4.0
      </p>

      {/* Versión en texto del cómic para lectores de pantalla y buscadores. */}
      <main className="sr-only">
        <h1>
          {COMIC.title}: {COMIC.issue}
        </h1>
        <p>{COMIC.tagline}</p>
        {CHAPTERS.map((s) => (
          <section key={s.id} id={s.id}>
            <h2>
              {s.title} ({s.year})
            </h2>
            <p>{s.narration}</p>
            <blockquote>{s.bubble}</blockquote>
          </section>
        ))}
        <section id="contacto">
          <h2>Contacto</h2>
          <p>{CONTACT.invite}</p>
          <ul>
            {CONTACT.links.map((l) => (
              <li key={l.label}>
                {l.label}: {l.href}
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  )
}
