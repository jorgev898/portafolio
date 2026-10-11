import { SECTIONS } from '../content/sections'

export const PAGE_W = 1
export const PAGE_H = 1.5
export const COVER_W = 1.04
export const COVER_H = 1.58

/** Páginas lineales del libro: 0 = índice (interior de la portada), 1..4 = secciones, 5 = cierre. */
export const PAGE_COUNT = SECTIONS.length + 2

/** Página enfocada cuando el libro está cerrado. */
export const CLOSED = -1

/** Hojas que deben estar giradas para mostrar la página `page`. */
export const turnedFor = (page: number) => (page < 0 ? 0 : Math.floor(page / 2) + 1)
