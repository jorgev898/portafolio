import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line, useGLTF } from '@react-three/drei'
import gsap from 'gsap'
import * as THREE from 'three'
import { INK } from '../lib/comicCanvas'
import { buildMinifigRig, type MinifigRig, type PartName } from './minifigRig'

const MODEL_URL = '/models/spiderman.glb'
/** Spider-Verse anima a los personajes "a dos tiempos": 12 poses por segundo. */
const POSE_FPS = 12
/** Giro del cuerpo: el pecho mira a la pared (borde izquierdo) y se deja ver en tres cuartos. */
const BODY_YAW = -1.2
/** Giro del cuerpo en el punto más cercano del columpio: casi de frente. */
const FACING_YAW = 0.2
/** Radianes de balanceo de brazos y piernas por unidad de altura trepada. */
const STRIDE = 9
/** Profundidad a la que llega el columpio (la cámara está en z = 6). */
const APEX_Z = 3.4
/** Alto aparente en el punto más cercano, como fracción del alto visible a esa profundidad. */
const APEX_SIZE = 0.55

type Props = {
  x: number
  /** Altura objetivo (Y de los pies) en coordenadas de escena. */
  y: number
  height: number
  /** Al pasar a true (el libro se abre), se columpia hacia la cámara y saluda. */
  open: boolean
  reducedMotion: boolean
}

type SwingState = {
  /** Avance por el arco: 0 = pared, 1 = frente a la cámara. */
  k: number
  /** 1 mientras la telaraña está tendida. */
  web: number
  wave: number
  wavePhase: number
  /** +1 a la ida, -1 a la vuelta: hacia dónde se inclina el cuerpo. */
  dir: number
}

function Part({ rig, name }: { rig: MinifigRig; name: PartName }) {
  return (
    <group name={name}>
      <mesh geometry={rig.parts[name]} material={rig.material} />
      <mesh geometry={rig.outlines[name]} material={rig.outlineMat} />
    </group>
  )
}

const lerp = THREE.MathUtils.lerp
const tmpHand = new THREE.Vector3()
const p0 = new THREE.Vector3()
const p1 = new THREE.Vector3()
const p2 = new THREE.Vector3()
const anchor = new THREE.Vector3()
const curve = new THREE.QuadraticBezierCurve3(p0, p1, p2)
// Fijo fuera del componente: si cambia, drei recrea la geometría de la línea.
const WEB_POINTS: [number, number, number][] = [
  [0, 0, 0],
  [0, 1, 0],
]

export function Spiderman({ x, y, height, open, reducedMotion }: Props) {
  const { scene } = useGLTF(MODEL_URL)
  const rig = useMemo(() => buildMinifigRig(scene), [scene])
  useEffect(() => () => rig.dispose(), [rig])

  const root = useRef<THREE.Group>(null)
  const turn = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null)
  const armR = useRef<THREE.Group>(null)
  const hand = useRef<THREE.Group>(null)
  const legL = useRef<THREE.Group>(null)
  const legR = useRef<THREE.Group>(null)
  const web = useRef<ComponentRef<typeof Line>>(null)

  const [climb] = useState(() => ({ y, phase: 0 }))
  const [swing] = useState<SwingState>(() => ({ k: 0, web: 0, wave: 0, wavePhase: 0, dir: 1 }))
  const look = useRef({ x: 0, y: 0 })
  const clock = useRef({ t: 0, tick: -1 })

  // Trepa hasta la nueva altura: brazos y piernas avanzan en proporción a la distancia.
  useEffect(() => {
    const dist = Math.abs(y - climb.y)
    if (dist < 1e-4) return
    gsap.to(climb, {
      y,
      phase: climb.phase + (dist / height) * STRIDE,
      duration: reducedMotion ? 0 : THREE.MathUtils.clamp(dist / height, 0.5, 1.6),
      ease: 'power1.inOut',
      overwrite: true,
    })
  }, [y, height, climb, reducedMotion])

  // Al abrir el libro: telaraña, columpio hacia la cámara, saludo y vuelta a la pared.
  useEffect(() => {
    if (!open || reducedMotion) return
    const tl = gsap
      .timeline()
      .set(swing, { web: 1, dir: 1 })
      .to(swing, { k: 1, duration: 1.15, ease: 'sine.inOut' })
      .to(swing, { wave: 1, duration: 0.25, ease: 'back.out(2)' })
      .to(swing, { wavePhase: `+=${Math.PI * 6}`, duration: 1.4, ease: 'none' }, '<')
      .to(swing, { wave: 0, duration: 0.25 })
      .set(swing, { dir: -1 })
      .to(swing, { k: 0, duration: 1.15, ease: 'sine.inOut' })
      .set(swing, { web: 0 })
    return () => {
      // Si se cierra el libro a mitad del columpio, vuelve a la pared sin cortes.
      tl.kill()
      gsap.to(swing, { k: 0, wave: 0, dir: -1, duration: 0.7, ease: 'sine.inOut', onComplete: () => void (swing.web = 0) })
    }
  }, [open, reducedMotion, swing])

  useFrame((state, delta) => {
    const k = Math.min(1, delta * 5)
    look.current.x += (state.pointer.x - look.current.x) * k
    look.current.y += (state.pointer.y - look.current.y) * k

    const c = clock.current
    c.t += delta
    const tick = Math.floor(c.t * POSE_FPS)
    if (tick === c.tick) return
    c.tick = tick
    if (!root.current) return

    const t = reducedMotion ? 0 : tick / POSE_FPS
    const breathe = Math.sin(t * 2.2)
    const stride = Math.sin(climb.phase)
    const s = swing
    const face = THREE.MathUtils.smoothstep(s.k, 0, 0.7)
    const arc = Math.sin(Math.PI * s.k)

    // Recorrido: de la pared, baja en arco y sube hasta quedar frente a la cámara.
    const cam = state.camera as THREE.PerspectiveCamera
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))
    const apexHalfH = (cam.position.z - APEX_Z) * tanHalf
    const apexHalfW = apexHalfH * cam.aspect
    const apexScale = (APEX_SIZE * 2 * apexHalfH) / height
    p0.set(x, climb.y, 0.35)
    p2.set(cam.aspect < 0.9 ? 0 : -apexHalfW * 0.3, -apexHalfH * APEX_SIZE * 0.85, APEX_Z)
    p1.set((p0.x + p2.x) / 2, Math.min(p0.y, p2.y) - height * 0.8, (p0.z + p2.z) / 2)
    if (s.k > 0) curve.getPoint(s.k, root.current.position)
    else root.current.position.copy(p0)

    root.current.scale.setScalar(height * lerp(1, Math.max(1, apexScale), face))
    root.current.rotation.z = lerp(-0.05 + Math.sin(t * 0.9) * 0.025, 0, face) - 0.35 * arc * s.dir * (1 - face * 0.6)
    if (turn.current) turn.current.rotation.y = lerp(BODY_YAW, FACING_YAW, face)
    if (body.current) body.current.rotation.x = 0.04 * breathe

    if (head.current) {
      head.current.rotation.y = lerp(1.05 + look.current.x * 0.5, -FACING_YAW + look.current.x * 0.35, face)
      head.current.rotation.x = -look.current.y * 0.3
    }
    // Brazos: el lejano arriba agarrado a la pared (o a la telaraña), el cercano
    // a la altura del pecho; se alternan al trepar. Con el libro abierto, el cercano saluda.
    if (armR.current) armR.current.rotation.x = lerp(-2.75 + 0.55 * stride + 0.06 * breathe, -3.05, s.web)
    if (armL.current) {
      armL.current.rotation.x = lerp(-1.35 - 0.55 * stride - 0.06 * breathe, -2.85, s.wave)
      armL.current.rotation.z = s.wave * (0.3 + 0.35 * Math.sin(s.wavePhase))
    }
    if (legL.current) legL.current.rotation.x = lerp(0.25 - 0.4 * stride, 0.2 + 0.25 * arc, face)
    if (legR.current) legR.current.rotation.x = lerp(-0.6 + 0.4 * stride, -0.35 - 0.25 * arc, face)

    // Telaraña: de un anclaje fuera de pantalla, arriba, hasta la mano.
    const line = web.current
    if (!line) return
    line.visible = s.web > 0
    if (!line.visible || !hand.current) return
    root.current.updateMatrixWorld(true)
    hand.current.getWorldPosition(tmpHand)
    const anchorZ = 1.6
    anchor.set(lerp(p0.x, p2.x, 0.55), (cam.position.z - anchorZ) * tanHalf + 0.4, anchorZ)
    line.geometry.setPositions([anchor.x, anchor.y, anchor.z, tmpHand.x, tmpHand.y, tmpHand.z])
  })

  const { pivots: pv, scale, feet } = rig
  const rel = (a: THREE.Vector3, b: THREE.Vector3) => a.clone().sub(b)

  return (
    <>
      <Line ref={web} points={WEB_POINTS} color={INK} lineWidth={3.5} />
      <group ref={root} scale={height} position={[x, y, 0.35]}>
        <group ref={turn} rotation-y={BODY_YAW}>
          <group scale={scale} position-y={-feet * scale}>
            <group ref={body} position={pv.hip}>
              <Part rig={rig} name="torso" />
              <group ref={head} position={rel(pv.neck, pv.hip)}>
                <Part rig={rig} name="head" />
              </group>
              <group ref={armL} position={rel(pv.shoulderL, pv.hip)}>
                <Part rig={rig} name="armL" />
              </group>
              <group ref={armR} position={rel(pv.shoulderR, pv.hip)}>
                <Part rig={rig} name="armR" />
                <group ref={hand} position={rig.handR} />
              </group>
            </group>
            <group ref={legL} position={pv.hipL}>
              <Part rig={rig} name="legL" />
            </group>
            <group ref={legR} position={pv.hipR}>
              <Part rig={rig} name="legR" />
            </group>
          </group>
        </group>
      </group>
    </>
  )
}

useGLTF.preload(MODEL_URL)
