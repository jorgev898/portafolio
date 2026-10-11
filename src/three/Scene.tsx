import { Suspense } from 'react'
import { useThree } from '@react-three/fiber'
import { Book } from './Book'
import { COVER_H, COVER_W, PAGE_COUNT } from './bookLayout'
import { Spiderman } from './Spiderman'

type Props = {
  page: number
  singlePage: boolean
  fontsReady: boolean
  reducedMotion: boolean
}

/** Reparte la pantalla entre el libro (centro) y Spiderman (pared izquierda). */
function useLayout(singlePage: boolean) {
  const { width: vw, height: vh } = useThree((s) => s.viewport)
  if (singlePage) {
    const spideyH = Math.min(vh * 0.15, vw * 0.3)
    const scale = Math.min((vw * 0.8) / COVER_W, (vh * 0.64) / COVER_H)
    return {
      bookScale: scale,
      bookY: -vh * 0.07,
      spideyH,
      spideyX: -vw / 2 + spideyH * 0.36,
      climbTop: vh / 2 - spideyH * 1.3,
      climbBottom: vh / 2 - spideyH * 1.9,
    }
  }
  const spideyH = vh * 0.26
  const side = spideyH * 0.75
  const scale = Math.min((vw - side * 2) / (COVER_W * 2.1), (vh * 0.76) / COVER_H)
  return {
    bookScale: scale,
    bookY: -vh * 0.02,
    spideyH,
    spideyX: -vw / 2 + spideyH * 0.36,
    climbTop: vh * 0.04,
    climbBottom: -vh * 0.46,
  }
}

export function Scene({ page, singlePage, fontsReady, reducedMotion }: Props) {
  const l = useLayout(singlePage)

  // Libro cerrado: centrado sobre la portada. Abierto: centrado en el lomo,
  // o en la página enfocada cuando solo cabe una.
  let offsetX = -COVER_W / 2
  if (page >= 0) offsetX = singlePage ? (page % 2 === 0 ? COVER_W / 2 : -COVER_W / 2) : 0

  const progress = (page + 1) / PAGE_COUNT
  const spideyY = l.climbTop + (l.climbBottom - l.climbTop) * progress

  return (
    <>
      <ambientLight intensity={1.6} />
      <directionalLight position={[3, 4, 5]} intensity={2.4} />
      <group position-y={l.bookY} scale={l.bookScale}>
        {fontsReady && <Book page={page} offsetX={offsetX} reducedMotion={reducedMotion} />}
      </group>
      <Suspense fallback={null}>
        <Spiderman x={l.spideyX} y={spideyY} height={l.spideyH} open={page >= 0} reducedMotion={reducedMotion} />
      </Suspense>
    </>
  )
}
