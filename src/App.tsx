import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import { Canvas } from '@react-three/fiber'
import { CHAPTERS, COMIC, CONTACT } from './content/sections'
import { useFontsReady, useReducedMotion, useSinglePage } from './lib/hooks'
import { CLOSED, PAGE_COUNT } from './three/bookLayout'
import { Scene } from './three/Scene'

const SWIPE_PX = 40

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

  const step = useCallback(
    (dir: 1 | -1) =>
      setPage((p) => {
        if (singlePage) return Math.min(PAGE_COUNT - 1, Math.max(CLOSED, p + dir))
        // Doble página: saltamos a la página izquierda del pliego siguiente/anterior.
        if (p === CLOSED) return dir > 0 ? 0 : CLOSED
        const spread = Math.floor(p / 2)
        const next = dir > 0 ? (spread + 1) * 2 : (spread - 1) * 2
        if (next >= PAGE_COUNT) return p
        return next < 0 ? CLOSED : next
      }),
    [singlePage],
  )
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

  // Clic: abre el libro o pasa de página según el lado. Swipe: dirección del gesto.
  const down = useRef<{ x: number; y: number } | null>(null)
  const onPointerDown = (e: PointerEvent) => {
    down.current = { x: e.clientX, y: e.clientY }
  }
  const onPointerUp = (e: PointerEvent) => {
    const start = down.current
    down.current = null
    if (!start) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1)
    else if (Math.hypot(dx, dy) < 10) {
      if (page === CLOSED) step(1)
      else step(e.clientX > window.innerWidth / 2 ? 1 : -1)
    }
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
        onPointerUp={onPointerUp}
        onPointerCancel={() => (down.current = null)}
        aria-hidden="true"
      >
        <Canvas
          dpr={[1, 2]}
          camera={{ position: [0, 0, 6], fov: 35 }}
          gl={{ antialias: true, alpha: true }}
          flat
        >
          <Scene page={page} singlePage={singlePage} fontsReady={fontsReady} reducedMotion={reducedMotion} />
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
