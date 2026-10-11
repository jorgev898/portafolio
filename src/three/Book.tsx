import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import gsap from 'gsap'
import * as THREE from 'three'
import { SECTIONS } from '../content/sections'
import { drawBlank, drawBoard, drawCover, drawEnd, drawIndex, drawSection } from '../lib/comicCanvas'
import { COVER_H, COVER_W, PAGE_H, PAGE_W, turnedFor } from './bookLayout'

const GAP = 0.006
const SEGMENTS = 32
const SHADE = new THREE.Color('#c9b99c')

type Progress = { p: number }

type LeafProps = {
  index: number
  count: number
  width: number
  height: number
  curl: number
  front: THREE.Texture
  back: THREE.Texture
  progress: Progress
}

/** Curva la hoja: cada columna gira algo más que la anterior, así el borde libre se adelanta. */
function bend(mesh: THREE.Mesh, width: number, p: number, curl: number) {
  const pos = mesh.geometry.attributes.position as THREE.BufferAttribute
  const lift = Math.sin(Math.PI * p)
  const ds = width / SEGMENTS
  const cols = SEGMENTS + 1
  let x = 0
  let z = 0
  for (let k = 0; k < cols; k++) {
    if (k > 0) {
      const a = -Math.PI * p - curl * lift * ((k - 0.5) / SEGMENTS)
      x += Math.cos(a) * ds
      z -= Math.sin(a) * ds
    }
    pos.setXYZ(k, x, pos.getY(k), z)
    pos.setXYZ(k + cols, x, pos.getY(k + cols), z)
  }
  pos.needsUpdate = true
  mesh.geometry.computeBoundingSphere()
  ;(mesh.material as THREE.MeshBasicMaterial).color.setRGB(1, 1, 1).lerp(SHADE, lift * 0.6)
}

function Leaf({ index, count, width, height, curl, front, back, progress }: LeafProps) {
  const group = useRef<THREE.Group>(null)
  const frontMesh = useRef<THREE.Mesh>(null)
  const backMesh = useRef<THREE.Mesh>(null)
  const last = useRef(-1)

  useFrame(() => {
    const p = progress.p
    if (p === last.current || !group.current || !frontMesh.current || !backMesh.current) return
    last.current = p
    bend(frontMesh.current, width, p, curl)
    bend(backMesh.current, width, p, curl)
    const zFlat = (count - index) * GAP
    const zTurned = (index + 1) * GAP
    group.current.position.z = THREE.MathUtils.lerp(zFlat, zTurned, p) + Math.sin(Math.PI * p) * 0.02
  })

  return (
    <group ref={group}>
      <mesh ref={frontMesh}>
        <planeGeometry args={[width, height, SEGMENTS, 1]} />
        <meshBasicMaterial map={front} side={THREE.FrontSide} />
      </mesh>
      <mesh ref={backMesh}>
        <planeGeometry args={[width, height, SEGMENTS, 1]} />
        <meshBasicMaterial map={back} side={THREE.BackSide} />
      </mesh>
    </group>
  )
}

type BookProps = {
  page: number
  /** Desplazamiento X del libro en espacio local según el estado (cerrado, abierto, página enfocada). */
  offsetX: number
  reducedMotion: boolean
}

export function Book({ page, offsetX, reducedMotion }: BookProps) {
  const shiftRef = useRef<THREE.Group>(null)
  const shadowRef = useRef<THREE.Mesh>(null)

  const textures = useMemo(() => {
    const sections = SECTIONS.map((s, i) => drawSection(s, i, i % 2 === 0 ? 'right' : 'left'))
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
    },
    [textures],
  )

  const leaves = useMemo(() => {
    const [s1, s2, s3, s4] = textures.sections
    return [
      { front: textures.cover, back: textures.index, width: COVER_W, height: COVER_H, curl: 0.08 },
      { front: s1, back: s2, width: PAGE_W, height: PAGE_H, curl: 0.55 },
      { front: s3, back: s4, width: PAGE_W, height: PAGE_H, curl: 0.55 },
      { front: textures.end, back: textures.blank, width: PAGE_W, height: PAGE_H, curl: 0.55 },
    ]
  }, [textures])

  const progress = useMemo<Progress[]>(() => leaves.map(() => ({ p: 0 })), [leaves])
  const open = useMemo(() => ({ o: 0 }), [])

  useEffect(() => {
    const turned = turnedFor(page)
    const order = progress.map((_, i) => i)
    const forward = progress.some((pr, i) => i < turned && pr.p < 1)
    if (!forward) order.reverse()
    let delay = 0
    const dur = reducedMotion ? 0 : 1.05
    for (const i of order) {
      const target = i < turned ? 1 : 0
      if (progress[i].p === target) continue
      gsap.to(progress[i], { p: target, duration: dur, delay, ease: 'power2.inOut', overwrite: true })
      delay += reducedMotion ? 0 : 0.14
    }
    gsap.to(open, { o: turned > 0 ? 1 : 0, duration: dur, ease: 'power2.inOut', overwrite: true })
    if (shiftRef.current) {
      gsap.to(shiftRef.current.position, {
        x: offsetX,
        duration: reducedMotion ? 0 : 0.9,
        ease: 'power3.inOut',
        overwrite: true,
      })
    }
  }, [page, offsetX, progress, open, reducedMotion])

  useFrame(() => {
    const s = shadowRef.current
    if (!s) return
    const o = open.o
    s.scale.x = COVER_W * (1 + o)
    s.position.x = (COVER_W * (1 - o)) / 2 + 0.05
  })

  return (
    <group ref={shiftRef} position-x={-COVER_W / 2}>
      {/* Sombra dura de cómic */}
      <mesh ref={shadowRef} position={[COVER_W / 2 + 0.05, -0.05, -0.02]} scale={[COVER_W, COVER_H, 1]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#17130e" transparent opacity={0.88} />
      </mesh>
      {/* Contraportada (base fija a la derecha) */}
      <mesh position={[COVER_W / 2, 0, 0]}>
        <planeGeometry args={[COVER_W, COVER_H]} />
        <meshBasicMaterial map={textures.board} />
      </mesh>
      {leaves.map((leaf, i) => (
        <Leaf key={i} index={i} count={leaves.length} progress={progress[i]} {...leaf} />
      ))}
    </group>
  )
}
