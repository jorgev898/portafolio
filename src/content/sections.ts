// Contenido del cómic. Cada sección es una página del libro.
// Los textos marcados como placeholder hay que sustituirlos por los reales.

export type Section = {
  id: string
  chapter: string
  title: string
  /** Frase grande de la viñeta principal. */
  lead: string
  /** Bocadillos / cajas de texto secundarias. */
  notes: string[]
  /** Onomatopeya decorativa de la página. */
  sfx: string
}

export const COMIC = {
  title: 'Jorge Vergel',
  issue: 'Portafolio · Nº 1',
  tagline: 'Desarrollo web, contado en viñetas',
}

export const SECTIONS: Section[] = [
  {
    id: 'sobre-mi',
    chapter: 'Capítulo 1',
    title: 'Sobre mí',
    lead: 'Texto de ejemplo: quién eres y qué construyes.',
    notes: ['Dónde vives y desde dónde trabajas.', 'Qué te gusta resolver.'],
    sfx: '¡THWIP!',
  },
  {
    id: 'proyectos',
    chapter: 'Capítulo 2',
    title: 'Proyectos',
    lead: 'Texto de ejemplo: tus proyectos favoritos, uno por viñeta.',
    notes: ['Proyecto A · qué hace y con qué está hecho.', 'Proyecto B · el reto y cómo lo resolviste.'],
    sfx: '¡KRAK!',
  },
  {
    id: 'experiencia',
    chapter: 'Capítulo 3',
    title: 'Experiencia',
    lead: 'Texto de ejemplo: dónde has trabajado y qué aprendiste.',
    notes: ['Empresa / periodo / rol.', 'Tecnologías que usas a diario.'],
    sfx: '¡ZAS!',
  },
  {
    id: 'contacto',
    chapter: 'Capítulo 4',
    title: 'Contacto',
    lead: 'Texto de ejemplo: cómo escribirte.',
    notes: ['GitHub · enlace pendiente.', 'Correo y LinkedIn · pendientes.'],
    sfx: '¡BAM!',
  },
]
