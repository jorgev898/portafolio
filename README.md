# Portafolio · Jorge Vergel

Portafolio en forma de cómic estilo Spider-Verse: un libro 3D que se abre y donde cada sección es una página, con Spiderman agarrado al borde izquierdo de la pantalla.

React + TypeScript + Vite · three.js con @react-three/fiber y @react-three/drei · GSAP.

```bash
npm install
npm run dev     # desarrollo
npm run build   # comprobación de tipos + build de producción
npm run lint    # oxlint
```

## Estructura

- `src/content/sections.ts`: la historia del cómic (portada, 4 capítulos y contacto). Los huecos van entre [corchetes]; la guía para rellenarlos está en `docs/mi-historia.md`.
- `src/lib/comicCanvas.ts`: dibuja la portada y las páginas en canvas (tramado, desfase de color, viñetas).
- `src/three/Book.tsx`: el libro 3D; las hojas se curvan al pasar y se animan con GSAP.
- `src/three/minifigRig.ts`: separa el GLB en sus 6 piezas rígidas y calcula pivotes propios (el esqueleto original está a otra escala que la malla).
- `src/three/Spiderman.tsx`: pose de pared, reposo, cabeza que sigue al cursor y escalada al pasar de página, animado a 12 poses/s.

## Créditos

Modelo 3D: [“Lego Spiderman minifigure version 2”](https://sketchfab.com/3d-models/lego-spiderman-minifigure-version-2-2010edbfc0a34201b659655539b33953) de Neut2000, licencia [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/).
