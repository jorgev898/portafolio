import { Suspense, useRef, type ReactNode } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Book } from './Book'
import { COVER_H, COVER_W, PAGE_COUNT, hasHover, type DragState } from './bookLayout'
import { Spiderman } from './Spiderman'

type Props = {
  page: number
  singlePage: boolean
  fontsReady: boolean
  reducedMotion: boolean
  drag: DragState
}

/** Inclina el libro hacia el cursor con inercia, como un objeto colgado y no clavado. */
function Tilt({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null)
  const hover = useRef(hasHover())
  useFrame((state, dt) => {
    const g = ref.current
    if (!g) return
    const on = enabled && hover.current
    // Hasta ~11° de cabeceo y ~18° de giro en las esquinas de la pantalla, con respuesta rápida.
    g.rotation.x = THREE.MathUtils.damp(g.rotation.x, on ? -state.pointer.y * 0.19 : 0, 6, dt)
    g.rotation.y = THREE.MathUtils.damp(g.rotation.y, on ? state.pointer.x * 0.32 : 0, 6, dt)
  })
  return <group ref={ref}>{children}</group>
}

/**
 * Deriva propia del libro, independiente del cursor: flota y gira despacio sobre sí mismo.
 * Cada eje suma dos senos de periodos sin múltiplo común, así el movimiento nunca se repite
 * a la vista. Mientras la mano arrastra una hoja se calma, para no moverle la página al dedo.
 */
const DRIFT: [period: number, amount: number, phase: number][][] = [
  // posición x, y, z
  [[11.3, 0.035, 0.0], [5.9, 0.01, 2.1]],
  [[9.1, 0.045, 1.3], [4.7, 0.012, 4.0]],
  [[13.7, 0.06, 0.7], [7.3, 0.02, 3.3]],
  // giro x, y, z (rad)
  [[10.3, 0.05, 2.4], [6.1, 0.015, 0.5]],
  [[12.9, 0.07, 4.4], [5.3, 0.02, 1.7]],
  [[15.1, 0.04, 1.1], [8.3, 0.014, 5.2]],
]

function Drift({ enabled, drag, children }: { enabled: boolean; drag: DragState; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null)
  const amount = useRef(enabled ? 1 : 0)
  useFrame((state, dt) => {
    const g = ref.current
    if (!g) return
    amount.current = THREE.MathUtils.damp(amount.current, !enabled ? 0 : drag.active ? 0.3 : 1, 2, dt)
    const t = state.clock.elapsedTime
    const v = DRIFT.map((axis) => amount.current * axis.reduce((s, [T, a, ph]) => s + a * Math.sin((t * 2 * Math.PI) / T + ph), 0))
    g.position.set(v[0], v[1], v[2])
    g.rotation.set(v[3], v[4], v[5])
  })
  return <group ref={ref}>{children}</group>
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

export function Scene({ page, singlePage, fontsReady, reducedMotion, drag }: Props) {
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
        <Drift enabled={!reducedMotion} drag={drag}>
          <Tilt enabled={!reducedMotion}>
            {fontsReady && <Book page={page} offsetX={offsetX} reducedMotion={reducedMotion} drag={drag} />}
          </Tilt>
        </Drift>
      </group>
      <Suspense fallback={null}>
        <Spiderman x={l.spideyX} y={spideyY} height={l.spideyH} open={page >= 0} reducedMotion={reducedMotion} />
      </Suspense>
    </>
  )
}
