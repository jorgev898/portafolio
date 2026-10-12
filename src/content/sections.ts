// Contenido del cómic: la historia de origen, un capítulo por página.
//
// PLANTILLA: todo lo que va entre [corchetes] es un hueco por rellenar.

/**
 * Qué muestra una viñeta:
 * - photo: una foto o captura real (más adelante pasa por el shader de cómic).
 * - scene: una escena 3D con Spiderman haciendo de doble de acción.
 * - type: solo texto grande (un año, una palabra, una onomatopeya).
 * - code: un fragmento real de código o un mensaje de commit.
 */
export type PanelKind = 'photo' | 'scene' | 'type' | 'code'

export type Panel = {
  kind: PanelKind
  /** photo / type / code: el contenido. scene: qué hace Spiderman en la escena. */
  content: string
  /** Solo photo: ruta dentro de public/, p. ej. '/historia/cap1.jpg'. Vacío mientras no haya imagen. */
  src?: string
}

export type Chapter = {
  id: string
  /** Año o periodo, p. ej. '2019' o '2019–2021'. */
  year: string
  title: string
  /** Cartela de narración, en primera persona. Una o dos frases. */
  narration: string
  /** Bocadillo: algo que dijiste o pensaste en ese momento. */
  bubble: string
  sfx: string
  /** La viñeta grande de la página. */
  main: Panel
  /** Las dos viñetas pequeñas de abajo. */
  small: [Panel, Panel]
}

export const COMIC = {
  title: 'Jorge Vergel',
  issue: 'Nº 1 · Origen',
  tagline: '[Una línea: qué haces, contado como el subtítulo de un cómic]',
}

export const CHAPTERS: Chapter[] = [
  {
    id: 'origen',
    year: '[20XX]',
    title: 'El origen',
    narration: '[Cómo empezó todo: la primera vez que programaste o lo que te enganchó.]',
    bubble: '[Lo que pensaste ese día]',
    sfx: '¡THWIP!',
    main: { kind: 'photo', content: '[Foto tuya de esa época, o tu primer ordenador]' },
    small: [
      { kind: 'type', content: '[20XX]' },
      { kind: 'code', content: '[Tu primer código, p. ej. print("hola")]' },
    ],
  },
  {
    id: 'primer-proyecto',
    year: '[20XX]',
    title: 'Primer proyecto',
    narration: '[El primer proyecto de verdad: para quién era y qué tenía que hacer.]',
    bubble: '[Una frase del momento]',
    sfx: '¡DEPLOY!',
    main: { kind: 'photo', content: '[Captura del proyecto]' },
    small: [
      { kind: 'scene', content: 'Spiderman frente al portátil a las 3 de la mañana' },
      { kind: 'type', content: '[Un dato real: usuarios, días, líneas…]' },
    ],
  },
  {
    id: 'el-reto',
    year: '[20XX]',
    title: 'El reto',
    narration: '[El problema más difícil que has resuelto y cómo saliste de él.]',
    bubble: '[Lo que dijiste cuando por fin funcionó]',
    sfx: '¡KRAK!',
    main: { kind: 'scene', content: 'Spiderman colgado boca abajo de un «Error 500»' },
    small: [
      { kind: 'photo', content: '[Captura del proyecto o del error]' },
      { kind: 'code', content: '[El commit que lo arregló]' },
    ],
  },
  {
    id: 'hoy',
    year: '[Hoy]',
    title: 'Hoy',
    narration: '[Dónde estás ahora, qué construyes y con qué tecnologías.]',
    bubble: '[Qué te gustaría construir después]',
    sfx: '¡BAM!',
    main: { kind: 'photo', content: '[Foto actual, o tu escritorio de trabajo]' },
    small: [
      { kind: 'type', content: '[Tu stack en 3 palabras]' },
      { kind: 'photo', content: '[Captura de tu proyecto más reciente]' },
    ],
  },
]

/** Contacto: va en la última página, la de «¿Continuará…?». */
export const CONTACT = {
  invite: '[Una frase para invitar a escribirte]',
  links: [
    { label: 'Correo', href: '[tu correo]' },
    { label: 'GitHub', href: '[github.com/usuario]' },
    { label: 'LinkedIn', href: '[linkedin.com/in/usuario]' },
  ],
}
