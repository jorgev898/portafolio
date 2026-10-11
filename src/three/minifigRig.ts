import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * El GLB trae un esqueleto de 11 huesos, pero sus pivotes están a otra escala
 * que la malla (el cuello cae a la altura del pecho). Como cada vértice depende
 * de un único hueso con peso 1, separamos la malla en sus piezas rígidas y
 * montamos una jerarquía propia con pivotes calculados desde la geometría.
 */

export type PartName = 'torso' | 'head' | 'armL' | 'armR' | 'legL' | 'legR'

export type PivotName = 'hip' | 'neck' | 'shoulderL' | 'shoulderR' | 'hipL' | 'hipR'

export type MinifigRig = {
  /** Escala para que la figura mida 1 de alto. */
  scale: number
  /** Y de los pies en unidades de malla. */
  feet: number
  /** Pivotes en espacio de malla. */
  pivots: Record<PivotName, THREE.Vector3>
  /** Geometrías trasladadas para que su origen sea su pivote. */
  parts: Record<PartName, THREE.BufferGeometry>
  material: THREE.MeshToonMaterial
  /** Punta de la mano derecha respecto al pivote del hombro (de ahí sale la telaraña). */
  handR: THREE.Vector3
  /** Cascos de contorno de cada pieza (mismo pivote). */
  outlines: Record<PartName, THREE.BufferGeometry>
  outlineMat: THREE.MeshBasicMaterial
  dispose: () => void
}

function partFromBone(name: string): PartName | null {
  const n = name.replace(/[^A-Za-z]/g, '')
  if (n.startsWith('Torso')) return 'torso'
  if (n.startsWith('Head')) return 'head'
  if (n.startsWith('ArmL')) return 'armL'
  if (n.startsWith('ArmR')) return 'armR'
  if (n.startsWith('LegL')) return 'legL'
  if (n.startsWith('LegR')) return 'legR'
  return null
}

function splitByBone(mesh: THREE.SkinnedMesh) {
  const src = mesh.geometry
  const pos = src.getAttribute('position')
  const normal = src.getAttribute('normal')
  const uv = src.getAttribute('uv')
  const skinIndex = src.getAttribute('skinIndex')
  const skinWeight = src.getAttribute('skinWeight')
  const index = src.getIndex()
  const bones = mesh.skeleton.bones

  // Hueso dominante de cada vértice
  const owner = new Array<PartName | null>(pos.count)
  for (let v = 0; v < pos.count; v++) {
    let best = 0
    for (let c = 1; c < 4; c++) if (skinWeight.getComponent(v, c) > skinWeight.getComponent(v, best)) best = c
    owner[v] = partFromBone(bones[skinIndex.getComponent(v, best)].name)
  }

  const tri = index ? (i: number) => index.getX(i) : (i: number) => i
  const triCount = (index ? index.count : pos.count) / 3
  const buckets = new Map<PartName, number[]>()
  for (let t = 0; t < triCount; t++) {
    const part = owner[tri(t * 3)]
    if (!part) continue
    let list = buckets.get(part)
    if (!list) buckets.set(part, (list = []))
    list.push(tri(t * 3), tri(t * 3 + 1), tri(t * 3 + 2))
  }

  const parts = new Map<PartName, THREE.BufferGeometry>()
  for (const [part, oldIdx] of buckets) {
    const remap = new Map<number, number>()
    const newIdx = oldIdx.map((o) => {
      let n = remap.get(o)
      if (n === undefined) remap.set(o, (n = remap.size))
      return n
    })
    const count = remap.size
    const p = new Float32Array(count * 3)
    const nr = new Float32Array(count * 3)
    const u = new Float32Array(count * 2)
    for (const [o, n] of remap) {
      p.set([pos.getX(o), pos.getY(o), pos.getZ(o)], n * 3)
      if (normal) nr.set([normal.getX(o), normal.getY(o), normal.getZ(o)], n * 3)
      if (uv) u.set([uv.getX(o), uv.getY(o)], n * 2)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(p, 3))
    if (normal) g.setAttribute('normal', new THREE.BufferAttribute(nr, 3))
    if (uv) g.setAttribute('uv', new THREE.BufferAttribute(u, 2))
    g.setIndex(newIdx)
    g.computeBoundingBox()
    parts.set(part, g)
  }
  return parts
}

function toonGradient() {
  const data = new Uint8Array([90, 170, 255])
  const tex = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat)
  tex.minFilter = THREE.NearestFilter
  tex.magFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  tex.needsUpdate = true
  return tex
}

export function buildMinifigRig(scene: THREE.Object3D): MinifigRig {
  let skinned: THREE.SkinnedMesh | undefined
  scene.traverse((o) => {
    if (!skinned && (o as THREE.SkinnedMesh).isSkinnedMesh) skinned = o as THREE.SkinnedMesh
  })
  if (!skinned) throw new Error('spiderman.glb: no se encontró la malla con esqueleto')

  const split = splitByBone(skinned)
  const get = (n: PartName) => {
    const g = split.get(n)
    if (!g) throw new Error(`spiderman.glb: falta la pieza ${n}`)
    return g
  }
  const box = (n: PartName) => get(n).boundingBox!

  const srcMat = skinned.material as THREE.MeshStandardMaterial
  const gradientMap = toonGradient()
  const material = new THREE.MeshToonMaterial({ map: srcMat.map, gradientMap, side: THREE.DoubleSide })

  // Medidas en el espacio de la malla
  const feet = Math.min(box('legL').min.y, box('legR').min.y)
  const top = box('head').max.y
  const midZ = (box('torso').min.z + box('torso').max.z) / 2
  const hip = new THREE.Vector3(0, Math.max(box('legL').max.y, box('legR').max.y) - 0.8, midZ)
  const neck = new THREE.Vector3(0, box('head').min.y, midZ)
  const shoulderY = box('armL').max.y - 1.1
  const shoulderL = new THREE.Vector3(box('armL').min.x + 0.4, shoulderY, midZ)
  const shoulderR = new THREE.Vector3(box('armR').max.x - 0.4, shoulderY, midZ)
  const hipL = new THREE.Vector3(box('legL').min.x + 0.6, hip.y, midZ)
  const hipR = new THREE.Vector3(box('legR').max.x - 0.6, hip.y, midZ)

  const shift = (n: PartName, pivot: THREE.Vector3) => get(n).translate(-pivot.x, -pivot.y, -pivot.z)
  const parts: Record<PartName, THREE.BufferGeometry> = {
    torso: shift('torso', hip),
    head: shift('head', neck),
    armL: shift('armL', shoulderL),
    armR: shift('armR', shoulderR),
    legL: shift('legL', hipL),
    legR: shift('legR', hipR),
  }

  // translate() ya recalcula la caja: la mano es el extremo inferior del brazo.
  const armBox = parts.armR.boundingBox!
  const handR = new THREE.Vector3(
    (armBox.min.x + armBox.max.x) / 2,
    armBox.min.y + 0.8,
    (armBox.min.z + armBox.max.z) / 2,
  )

  const outlines = Object.fromEntries(
    Object.entries(parts).map(([k, g]) => [k, outlineGeometry(g)]),
  ) as Record<PartName, THREE.BufferGeometry>
  const outlineMat = outlineMaterial('#17130e', 0.11)

  return {
    scale: 1 / (top - feet),
    feet,
    pivots: { hip, neck, shoulderL, shoulderR, hipL, hipR },
    handR,
    parts,
    material,
    outlines,
    outlineMat,
    dispose: () => {
      Object.values(parts).forEach((g) => g.dispose())
      Object.values(outlines).forEach((g) => g.dispose())
      outlineMat.dispose()
      material.dispose()
      gradientMap.dispose()
    },
  }
}

/**
 * Contorno de tinta por casco invertido: la pieza, inflada a lo largo de sus
 * normales suavizadas y pintada solo por detrás. Las normales originales del
 * LEGO tienen aristas duras, así que se suavizan aparte para que no se abra.
 */
export function outlineGeometry(source: THREE.BufferGeometry) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', source.getAttribute('position').clone())
  g.setIndex(source.getIndex()!.clone())
  const merged = mergeVertices(g, 1e-3)
  merged.computeVertexNormals()
  g.dispose()
  return merged
}

export function outlineMaterial(color: THREE.ColorRepresentation, thickness: number) {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide })
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `vec3 transformed = position + normalize(normal) * ${thickness.toFixed(4)};`,
    )
  }
  return m
}
