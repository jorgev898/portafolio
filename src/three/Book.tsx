import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import gsap from 'gsap'
import * as THREE from 'three'
import { CHAPTERS } from '../content/sections'
import { drawBlank, drawBoard, drawChapter, drawCover, drawEnd, drawIndex } from '../lib/comicCanvas'
import { COVER_H, COVER_W, LEAN, LEAVES, PAGE_H, PAGE_W, hasHover, turnedFor, type DragState } from './bookLayout'

const GAP = 0.006
const COLS = 32
/** Filas de la malla: permiten que la hoja se doble en diagonal y no solo como un cilindro. */
const ROWS = 12
const SHADE = new THREE.Color('#a8977a')
const INK = new THREE.Color('#17130e')
/** Cuánto se despega el borde de la hoja al acercar el cursor (fracción de giro). */
const PEEL = 0.075
/** Rigidez con la que la hoja persigue a la mano; más alto = más pegada. */
const FOLLOW = 28
/** Cuánto se queda atrás el borde libre por cada vuelta/s de velocidad: el papel arrastra aire. */
const LAG = 0.32
/** Muelle del borde libre: rigidez y amortiguación. Poco amortiguado, para que se asiente con vaivén. */
const FLEX_K = 170
const FLEX_C = 7
/** Luz que da forma al papel: desde delante y algo a la izquierda (componentes x y z). */
const LIGHT_X = -0.45
const LIGHT_Z = 0.89
/** Desplazamiento de la sombra del libro sobre la mesa: la luz viene de arriba a la izquierda. */
const LIGHT_OFFSET = new THREE.Vector2(0.04, -0.07)
/**
 * Caída de una hoja soltada (unidades de giro/s²). La gravedad tira según lo tumbada que esté,
 * el aire la frena (cuadrático + lineal) y el colchón de aire que queda entre ella y la pila
 * la frena aún más al llegar: planea y se posa en vez de golpear.
 */
const FALL_G = 5
const AIR_DRAG = 6
const AIR_LINEAR = 1
const AIR_CUSHION = 0.8
/** Pase con clic o flechas: la mano levanta la hoja hasta pasar algo la vertical y la suelta. */
const HAND_PAST = 0.1
const HAND_TIME = 0.5

/** Giro de la hoja; `falling` es el reposo hacia el que cae suelta (null si la mueve gsap o la mano). */
type Progress = { p: number; v: number; falling: number | null }
type LeafSpec = (typeof LEAVES)[number]
type Uniform<T> = { value: T }

/** Estado de forma de cada hoja; lo escriben Book (cursor, mano) y Leaf (lo que resulta). */
type Bend = {
  /** Giro extra por el cursor cerca del borde. */
  peel: number
  /** Altura de la mano, -1 (abajo) a 1 (arriba): esa esquina va por delante. */
  grabY: number
  /** Sentido del último movimiento: 1 hacia la izquierda, -1 hacia la derecha. */
  dir: 1 | -1
  /** La sujeta la mano: el sentido lo marca el gesto, no la velocidad. */
  held: boolean
  /** Velocidad de giro suavizada, en vueltas/s. */
  vel: number
  /** Doblez extra del borde libre (rad) y su velocidad: el muelle que da vida al papel. */
  flex: number
  flexVel: number
  lift: number
  /** X del borde libre arriba, en medio y abajo. */
  edgeTop: number
  edgeMid: number
  edgeBottom: number
}

const createBend = (): Bend => ({
  peel: 0,
  grabY: -0.5,
  dir: 1,
  held: false,
  vel: 0,
  flex: 0,
  flexVel: 0,
  lift: 0,
  edgeTop: 0,
  edgeMid: 0,
  edgeBottom: 0,
})

/** Uniforms compartidos de la sombra que una hoja levantada deja sobre el papel de debajo. */
type PageShadow = {
  /** Pasa de mundo a coordenadas del libro (lomo en x = 0). */
  uWorldToBook: Uniform<THREE.Matrix4>
  /** Borde libre de la hoja levantada: x en y = 0 y pendiente dx/dy. */
  uEdge: Uniform<THREE.Vector2>
  /** Distancia en la que la sombra se desvanece fuera de la hoja. */
  uReach: Uniform<number>
  uStrength: Uniform<number>
}

/**
 * Sombrea el papel en su propio shader. Al calcularse píxel a píxel sobre la página que recibe,
 * se recorta sola a su borde y cubre del lomo a la hoja sin dejar huecos ni cantos rectos.
 * `receive` vale 1 en el papel de debajo a la derecha, -1 a la izquierda y 0 en el resto: las dos
 * páginas reciben a la vez y cada una oscurece según lo cerca que esté la hoja de su lado, así la
 * sombra pasa de una a otra sin saltos cuando la hoja cruza el lomo.
 */
function withPageShadow(shared: PageShadow, receive: Uniform<number>) {
  return (shader: THREE.WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, shared, { uReceive: receive })
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 uWorldToBook;\nvarying vec2 vBook;')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvBook = (uWorldToBook * modelMatrix * vec4(transformed, 1.0)).xy;',
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec2 uEdge;
uniform float uReach;
uniform float uStrength;
uniform float uReceive;
varying vec2 vBook;`,
      )
      .replace(
        '#include <opaque_fragment>',
        `{
  // Coordenadas medidas desde el lomo hacia fuera, en el lado de esta página.
  float side = uReceive;
  float edge = side * (uEdge.x + uEdge.y * vBook.y);
  // Lo que la hoja ocupa de este lado (nada si está al otro): bajo ella, sombra plena.
  float d = side * vBook.x - max(edge, 0.0);
  float t = 1.0 - smoothstep(-0.02, uReach, d);
  // Cuanto más se aleja la hoja hacia el otro lado, menos sombra deja en este.
  float near = smoothstep(-0.45, 0.15, edge);
  float s = abs(side) * uStrength * near * t * t;
  // Sombra cálida: el azul cae más que el rojo, como tinta sobre papel.
  outgoingLight *= 1.0 - s * vec3(0.55, 0.6, 0.7);
}
#include <opaque_fragment>`,
      )
  }
}

/**
 * Sombra del libro sobre la mesa: un rectángulo con bordes difuminados, calculado en el shader.
 * Cada lado tiene su propio desenfoque, así la mitad izquierda puede seguir a la portada en vuelo.
 */
function makeTableShadow() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uBox: { value: new THREE.Vector4(0, COVER_W, -COVER_H / 2, COVER_H / 2) },
      uBlur: { value: new THREE.Vector3(0.1, 0.1, 0.1) },
      uColor: { value: INK },
      uOpacity: { value: 0.45 },
    },
    vertexShader: `
varying vec2 vP;
void main() {
  vP = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
    fragmentShader: `
uniform vec4 uBox;   // izquierda, derecha, abajo, arriba
uniform vec3 uBlur;  // izquierda, derecha, vertical
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vP;
float band(float v, float a, float b, float ba, float bb) {
  return smoothstep(a - ba, a + ba, v) * (1.0 - smoothstep(b - bb, b + bb, v));
}
void main() {
  float s = band(vP.x, uBox.x, uBox.y, uBlur.x, uBlur.y) * band(vP.y, uBox.z, uBox.w, uBlur.z, uBlur.z);
  gl_FragColor = vec4(uColor, s * s * uOpacity);
}`,
  })
}

/**
 * Curva la hoja. Cada columna gira algo más que la anterior (el borde libre se adelanta),
 * cada fila según su altura respecto a la mano (la esquina agarrada va por delante), y el muelle
 * `flex` dobla el borde hacia atrás al acelerar y hacia delante al frenar. Cada franja se ilumina
 * según mire a la luz: el pliegue tiene brillo y penumbra en vez de un tono plano.
 */
function bendLeaf(geo: THREE.BufferGeometry, leaf: LeafSpec, p: number, b: Bend) {
  const pos = geo.attributes.position as THREE.BufferAttribute
  const color = geo.attributes.color as THREE.BufferAttribute
  const lift = Math.sin(Math.PI * p)
  const ds = leaf.width / COLS
  const cols = COLS + 1
  for (let j = 0; j <= ROWS; j++) {
    const row = j * cols
    const yn = pos.getY(row) / (leaf.height / 2)
    const lean = b.dir * leaf.soft * LEAN * lift * yn * b.grabY
    let x = 0
    let z = 0
    for (let k = 0; k < cols; k++) {
      let a = -Math.PI * p
      if (k > 0) {
        const s = (k - 0.5) / COLS
        a -= (leaf.curl * lift + lean) * s - b.flex * s * s
        // El papel no atraviesa el libro: como mucho queda plano sobre él.
        a = THREE.MathUtils.clamp(a, -Math.PI, 0)
        x += Math.cos(a) * ds
        z -= Math.sin(a) * ds
      }
      pos.setXYZ(row + k, x, pos.getY(row + k), z)
      // Normal de la franja (sin a, cos a) frente a la luz; 1 = plana, >1 = brillo, <1 = penumbra.
      const k2 = Math.abs(Math.sin(a) * LIGHT_X + Math.cos(a) * LIGHT_Z) / LIGHT_Z
      color.setXYZ(row + k, SHADE.r + (1 - SHADE.r) * k2, SHADE.g + (1 - SHADE.g) * k2, SHADE.b + (1 - SHADE.b) * k2)
    }
    if (j === 0) b.edgeTop = x
    if (j === ROWS / 2) b.edgeMid = x
    if (j === ROWS) b.edgeBottom = x
  }
  b.lift = lift
  pos.needsUpdate = true
  color.needsUpdate = true
  geo.computeBoundingSphere()
}

/** Estado mutable del libro: lo animan gsap y la mano, y se lee cada fotograma. */
type Motion = {
  progress: Progress[]
  bends: Bend[]
  /** Movimiento reducido: sin muelle, la hoja no ondula. */
  calm: boolean
}

type LeafProps = {
  index: number
  spec: LeafSpec
  front: THREE.Texture
  back: THREE.Texture
  motion: { current: Motion }
  shadow: PageShadow
  /** 1 cuando esta hoja es la que queda debajo de la que se levanta. */
  receive: Uniform<number>
}

function Leaf({ index, spec, front, back, motion, shadow, receive }: LeafProps) {
  const group = useRef<THREE.Group>(null)
  const last = useRef({ p: -1, grabY: 0 })
  const onBeforeCompile = useMemo(() => withPageShadow(shadow, receive), [shadow, receive])

  // Una sola geometría para las dos caras: se dobla una vez por fotograma.
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(spec.width, spec.height, COLS, ROWS)
    const n = g.attributes.position.count
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3))
    return g
  }, [spec])
  useEffect(() => () => geo.dispose(), [geo])

  useFrame((_, dt) => {
    const bend = motion.current.bends[index]
    const p = THREE.MathUtils.clamp(motion.current.progress[index].p + bend.peel, 0, 1)
    const l = last.current
    if (dt > 0 && l.p >= 0) {
      const raw = (p - l.p) / dt
      if (!bend.held && Math.abs(raw) > 0.05) bend.dir = raw > 0 ? 1 : -1
      bend.vel = THREE.MathUtils.damp(bend.vel, raw, 10, dt)
      if (Math.abs(bend.vel) < 1e-3) bend.vel = 0
      // El borde libre persigue un doblez proporcional a la velocidad con un muelle poco
      // amortiguado: se queda atrás al arrancar, se adelanta al frenar y se asienta con vaivén.
      // Sujeta por la mano, la mitad: el punto agarrado no debe alejarse del dedo.
      const free = motion.current.calm ? 0 : LAG * bend.vel * spec.soft * (bend.held ? 0.5 : 1)
      const target = THREE.MathUtils.clamp(free, -0.9, 0.9)
      const h = Math.min(dt, 1 / 30)
      bend.flexVel += (-FLEX_K * (bend.flex - target) - FLEX_C * bend.flexVel) * h
      bend.flex += bend.flexVel * h
      if (target === 0 && Math.abs(bend.flex) < 1e-4 && Math.abs(bend.flexVel) < 1e-3) {
        bend.flex = 0
        bend.flexVel = 0
      }
    }
    if (p === l.p && bend.vel === 0 && bend.flex === 0 && bend.grabY === l.grabY) return
    l.p = p
    l.grabY = bend.grabY
    bendLeaf(geo, spec, p, bend)
    if (group.current) {
      const zFlat = (LEAVES.length - index) * GAP
      const zTurned = (index + 1) * GAP
      group.current.position.z = THREE.MathUtils.lerp(zFlat, zTurned, p) + bend.lift * 0.02
    }
  })

  return (
    <group ref={group}>
      <mesh geometry={geo}>
        <meshBasicMaterial map={front} side={THREE.FrontSide} vertexColors onBeforeCompile={onBeforeCompile} />
      </mesh>
      <mesh geometry={geo}>
        <meshBasicMaterial map={back} side={THREE.BackSide} vertexColors onBeforeCompile={onBeforeCompile} />
      </mesh>
    </group>
  )
}

type BookProps = {
  page: number
  /** Desplazamiento X del libro en espacio local según el estado (cerrado, abierto, página enfocada). */
  offsetX: number
  reducedMotion: boolean
  drag: DragState
}

const _ndc = new THREE.Vector2()
const _inv = new THREE.Matrix4()
const _ray = new THREE.Ray()
const _hit = new THREE.Vector3()
const BOOK_PLANE = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)

export function Book({ page, offsetX, reducedMotion, drag }: BookProps) {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const shiftRef = useRef<THREE.Group>(null)
  const inkRef = useRef<THREE.Mesh>(null)
  const wasActive = useRef(false)
  const hover = useRef(hasHover())
  const raycaster = useMemo(() => new THREE.Raycaster(), [])

  const tableShadow = useMemo(() => makeTableShadow(), [])
  const pageShadow = useMemo<PageShadow>(
    () => ({
      uWorldToBook: { value: new THREE.Matrix4() },
      uEdge: { value: new THREE.Vector2(0, 0) },
      uReach: { value: 0.2 },
      uStrength: { value: 0 },
    }),
    [],
  )
  // Un interruptor por hoja y otro para la contraportada: solo recibe sombra el papel de debajo.
  const receivers = useMemo(() => LEAVES.map(() => ({ value: 0 })), [])
  const boardReceive = useMemo(() => ({ value: 0 }), [])
  const boardShadow = useMemo(() => withPageShadow(pageShadow, boardReceive), [pageShadow, boardReceive])

  const textures = useMemo(() => {
    const sections = CHAPTERS.map((s, i) => drawChapter(s, i, i % 2 === 0 ? 'right' : 'left'))
    return {
      cover: drawCover(),
      index: drawIndex(),
      sections,
      end: drawEnd(),
      blank: drawBlank(),
      board: drawBoard(),
    }
  }, [])

  useEffect(
    () => () => {
      const { sections, ...rest } = textures
      ;[...sections, ...Object.values(rest)].forEach((t) => t.dispose())
      tableShadow.dispose()
    },
    [textures, tableShadow],
  )

  const faces = useMemo(() => {
    const [s1, s2, s3, s4] = textures.sections
    return [
      [textures.cover, textures.index],
      [s1, s2],
      [s3, s4],
      [textures.end, textures.blank],
    ]
  }, [textures])

  const motion = useRef<Motion>({
    progress: LEAVES.map(() => ({ p: 0, v: 0, falling: null })),
    bends: LEAVES.map(createBend),
    calm: reducedMotion,
  })

  /** Rayo desde la cámara hasta el plano del libro, en coordenadas del libro (lomo en x = 0). */
  const toBookNdc = useMemo(
    () => (nx: number, ny: number) => {
      const g = shiftRef.current
      if (!g) return null
      raycaster.setFromCamera(_ndc.set(nx, ny), camera)
      _ray.copy(raycaster.ray).applyMatrix4(_inv.copy(g.matrixWorld).invert())
      return _ray.intersectPlane(BOOK_PLANE, _hit)
    },
    [camera, raycaster],
  )

  useEffect(() => {
    drag.toBook = (clientX, clientY) => {
      const r = gl.domElement.getBoundingClientRect()
      const hit = toBookNdc(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
      return hit ? { x: hit.x, y: hit.y } : null
    }
    return () => {
      drag.toBook = null
    }
  }, [drag, gl, toBookNdc])

  useEffect(() => {
    const { progress } = motion.current
    const turned = turnedFor(page)
    const order = progress.map((_, i) => i)
    const forward = progress.some((pr, i) => i < turned && pr.p < 1)
    if (!forward) order.reverse()
    let delay = 0
    for (const i of order) {
      const lp = progress[i]
      const target = i < turned ? 1 : 0
      // La hoja que se acaba de soltar ya cae sola hacia su sitio.
      if (lp.falling === target || lp.p === target) continue
      gsap.killTweensOf(lp)
      const s = target > 0.5 ? 1 : -1
      // La mano la levanta hasta pasar algo la vertical (acelerando, como un empujón) y la
      // suelta: el resto lo hacen la gravedad y el aire, igual que al arrastrarla.
      const release = 0.5 + s * HAND_PAST
      const span = (release - lp.p) * s
      if (reducedMotion) {
        lp.falling = target
      } else if (span <= 0.02) {
        // Ya está pasada la vertical (p. ej. cayendo hacia el otro lado): basta un empujón.
        lp.falling = target
        lp.v = s * Math.max(s * lp.v, 1)
      } else {
        lp.falling = null
        const duration = HAND_TIME * Math.max(0.4, span / (0.5 + HAND_PAST))
        gsap.to(lp, {
          p: release,
          duration,
          delay,
          ease: 'sine.in',
          onComplete: () => {
            lp.falling = target
            // Velocidad final de sine.in: π/2 · recorrido / duración.
            lp.v = s * ((Math.PI / 2) * span) / duration
          },
        })
      }
      delay += reducedMotion ? 0 : 0.14
    }
    if (shiftRef.current) {
      gsap.to(shiftRef.current.position, {
        x: offsetX,
        duration: reducedMotion ? 0 : 0.9,
        ease: 'power3.inOut',
        overwrite: true,
      })
    }
  }, [page, offsetX, reducedMotion])

  useFrame((state, dt) => {
    const { progress, bends } = motion.current
    motion.current.calm = reducedMotion
    // La hoja agarrada persigue a la mano con un retraso mínimo: pesa, pero no se despega del dedo.
    bends.forEach((b, i) => {
      b.held = drag.active && i === drag.leaf
      if (b.held) b.dir = drag.dir
    })
    if (drag.active && drag.leaf >= 0) {
      const lp = progress[drag.leaf]
      if (!wasActive.current) {
        gsap.killTweensOf(lp)
        lp.falling = null
      }
      lp.p = THREE.MathUtils.damp(lp.p, drag.p, reducedMotion ? 60 : FOLLOW, dt)
      const b = bends[drag.leaf]
      b.grabY = THREE.MathUtils.damp(b.grabY, drag.grabY, 20, dt)
    } else if (wasActive.current && drag.leaf >= 0) {
      // Soltada: cae sola con la velocidad que llevaba la mano, a un lado (pasa) o al otro (vuelve).
      const lp = progress[drag.leaf]
      const goes = !drag.cancel
      gsap.killTweensOf(lp)
      lp.falling = (drag.dir > 0) === goes ? 1 : 0
      lp.v = THREE.MathUtils.clamp(bends[drag.leaf].vel, -3, 3)
    }
    wasActive.current = drag.active

    for (const [i, lp] of progress.entries()) {
      if (lp.falling === null) continue
      const target = lp.falling
      const s = target > lp.p ? 1 : -1
      if (reducedMotion || (target - lp.p) * s <= 0) {
        lp.p = target
        lp.v = 0
        lp.falling = null
        continue
      }
      const leaf = LEAVES[i]
      // La gravedad empuja según lo tumbada que esté; cerca de la vertical, un mínimo hacia su
      // lado (el último empujón de la mano) para que no se quede de pie ni vuelva atrás.
      const gravity = s * Math.max(-s * FALL_G * Math.cos(Math.PI * lp.p), 0.15 * FALL_G)
      // El papel arrastra mucho aire; la portada, rígida y pesada, poco.
      const air = 0.4 + 0.6 * leaf.soft
      const gap = Math.abs(target - lp.p)
      const h = Math.min(dt, 1 / 30)
      // Los frenos lineales van implícitos: el colchón es muy rígido junto a la pila y, explícito,
      // invertiría la velocidad en un fotograma largo.
      const linear = air * (AIR_LINEAR + AIR_CUSHION / (gap + 0.02))
      lp.v = (lp.v + (gravity - air * AIR_DRAG * lp.v * Math.abs(lp.v)) * h) / (1 + linear * h)
      lp.p += lp.v * h
      if ((target - lp.p) * s <= 0) {
        lp.p = target
        lp.v = 0
        lp.falling = null
      }
    }

    // Con el cursor cerca del borde, la hoja que tocaría pasar se despega por la esquina más cercana.
    const fwd = turnedFor(page)
    const back = fwd - 1
    let fwdTarget = 0
    let backTarget = 0
    let hoverY = 0
    const hit = hover.current && !reducedMotion && !drag.active ? toBookNdc(state.pointer.x, state.pointer.y) : null
    if (hit) {
      const inY = THREE.MathUtils.smoothstep(COVER_H / 2 + 0.12 - Math.abs(hit.y), 0, 0.2)
      const near = (along: number, w: number) => THREE.MathUtils.smoothstep(along, 0.45 * w, 1.05 * w)
      fwdTarget = PEEL * near(hit.x, fwd === 0 ? COVER_W : PAGE_W) * inY
      backTarget = PEEL * near(-hit.x, PAGE_W) * inY
      hoverY = THREE.MathUtils.clamp(hit.y / (PAGE_H / 2), -1, 1)
    }
    bends.forEach((b, i) => {
      const target = i === fwd ? fwdTarget : i === back ? -backTarget : 0
      b.peel = THREE.MathUtils.damp(b.peel, target, 9, dt)
      if (Math.abs(b.peel) < 1e-4) b.peel = 0
      if (target !== 0 && b.grabY !== hoverY) {
        b.grabY = THREE.MathUtils.damp(b.grabY, hoverY, 8, dt)
        if (Math.abs(b.grabY - hoverY) < 1e-3) b.grabY = hoverY
      }
    })

    // Sombra de la hoja más levantada sobre el papel que tiene debajo a cada lado del lomo.
    // Todo depende de su posición (borde y altura), nunca de en qué mitad está.
    let li = -1
    let best = 0.01
    bends.forEach((b, i) => {
      if (b.lift > best) {
        best = b.lift
        li = i
      }
    })
    receivers.forEach((r) => (r.value = 0))
    boardReceive.value = 0
    pageShadow.uStrength.value = 0
    if (li >= 0) {
      const b = bends[li]
      // A la derecha: la hoja siguiente o la contraportada. A la izquierda: la anterior, salvo
      // la portada, que no tiene nada debajo (su sombra cae en la mesa).
      ;(li + 1 < LEAVES.length ? receivers[li + 1] : boardReceive).value = 1
      if (li > 0) receivers[li - 1].value = -1
      pageShadow.uEdge.value.set(b.edgeMid, (b.edgeTop - b.edgeBottom) / LEAVES[li].height)
      // Más alta, más ancha y suave; pegada al papel, más corta.
      pageShadow.uReach.value = 0.12 + 0.5 * b.lift
      pageShadow.uStrength.value = 0.5 * b.lift
    }
    if (shiftRef.current) pageShadow.uWorldToBook.value.copy(shiftRef.current.matrixWorld).invert()

    // La huella del libro sobre la mesa va de la contraportada (fija) a donde esté la portada.
    // Si la portada se levanta, su lado de la sombra se encoge hacia el lomo y se difumina.
    const cover = bends[0]
    const left = Math.min(0, cover.edgeMid)
    const u = tableShadow.uniforms
    u.uBox.value.set(left + LIGHT_OFFSET.x, COVER_W + LIGHT_OFFSET.x, -COVER_H / 2 + LIGHT_OFFSET.y, COVER_H / 2 + LIGHT_OFFSET.y)
    u.uBlur.value.set(0.1 + 0.3 * cover.lift, 0.1, 0.1)
    // El canto de tinta solo existe donde el papel está apoyado: se retira con la portada.
    if (inkRef.current) {
      const inkLeft = left * (1 - THREE.MathUtils.smoothstep(cover.lift, 0, 0.15))
      inkRef.current.scale.x = COVER_W - inkLeft
      inkRef.current.position.x = (COVER_W + inkLeft) / 2 + 0.018
    }
  })

  return (
    <group ref={shiftRef} position-x={-COVER_W / 2}>
      {/* Sombra difusa del libro sobre la mesa */}
      <mesh position-z={-0.04} material={tableShadow}>
        <planeGeometry args={[COVER_W * 2 + 1.4, COVER_H + 1.4]} />
      </mesh>
      {/* Canto de tinta: una línea fina bajo el papel apoyado, no una sombra */}
      <mesh ref={inkRef} position={[COVER_W / 2 + 0.018, -0.018, -0.02]} scale={[COVER_W, COVER_H, 1]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color={INK} transparent opacity={0.85} depthWrite={false} />
      </mesh>
      {/* Contraportada (base fija a la derecha) */}
      <mesh position={[COVER_W / 2, 0, 0]}>
        <planeGeometry args={[COVER_W, COVER_H]} />
        <meshBasicMaterial map={textures.board} onBeforeCompile={boardShadow} />
      </mesh>
      {LEAVES.map((spec, i) => (
        <Leaf
          key={i}
          index={i}
          spec={spec}
          front={faces[i][0]}
          back={faces[i][1]}
          motion={motion}
          shadow={pageShadow}
          receive={receivers[i]}
        />
      ))}
    </group>
  )
}
