import { useEffect, useState, useSyncExternalStore } from 'react'

function mediaStore(query: string) {
  return {
    subscribe: (cb: () => void) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', cb)
      return () => mql.removeEventListener('change', cb)
    },
    get: () => window.matchMedia(query).matches,
  }
}

const reduced = mediaStore('(prefers-reduced-motion: reduce)')
const portrait = mediaStore('(max-aspect-ratio: 9/10)')

export const useReducedMotion = () => useSyncExternalStore(reduced.subscribe, reduced.get, () => false)

/** En pantallas estrechas el libro muestra una página a la vez. */
export const useSinglePage = () => useSyncExternalStore(portrait.subscribe, portrait.get, () => false)

/** Las texturas del cómic se dibujan en canvas: hay que esperar a las fuentes. */
export function useFontsReady() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let alive = true
    const fonts = ['100px Bangers', '700 30px "Comic Neue"', '400 22px "Comic Neue"']
    // Si la red de fuentes falla, dibujamos igualmente con las de respaldo.
    const timeout = new Promise((r) => setTimeout(r, 3500))
    Promise.race([Promise.all(fonts.map((f) => document.fonts.load(f))), timeout])
      .catch(() => undefined)
      .then(() => alive && setReady(true))
    return () => {
      alive = false
    }
  }, [])
  return ready
}
