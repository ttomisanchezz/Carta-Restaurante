---
description: Tokens de diseno, Tailwind v4 y reglas de componentes visuales
paths:
  - "src/app/**/*.css"
  - "src/app/**/*.tsx"
  - "src/components/**"
---

# Estilos y tokens

- **Tailwind v4 se configura en CSS, no en JavaScript.** `@import "tailwindcss";` y despues
  `@theme { ... }` en `src/app/globals.css`. Si aparece un `tailwind.config.js`, es basura de v3:
  borralo y portá los tokens al bloque `@theme`.
- **Un hex dentro de un componente es un bug.** Tambien un valor de pixel fuera de la escala
  (4, 8, 12, 16, 24, 32, 48, 64).
- **Tema oscuro unico.** No hay clase `dark:`, no hay toggle, no hay media query de esquema de color.
  Si estas escribiendo `dark:algo`, estas resolviendo un problema que este producto no tiene.
- Los componentes usan **solo tokens semanticos** (`--color-bg`, `--color-surface`, `--color-brand`,
  `--color-text`, `--color-text-muted`, `--color-border`, `--color-border-strong`, `--color-danger`,
  `--color-success`). Los primitivos (`--ink-950` y compania) solo los lee la capa semantica.
- **El color de marca del restaurante llega de la base.** Se valida con zod como `^#[0-9A-Fa-f]{6}$`
  antes de tocar el DOM y se inyecta como `style={{ "--color-brand": color }}` en el contenedor del
  layout. Si no valida, se usa el color por defecto. **Nunca** interpoles texto de la base dentro de
  un atributo `style` sin ese filtro.
- La marca es **acento**: precio, categoria activa, botones, anillo de foco, la barra vertical de la
  cita de maridaje. Nunca como fondo de una superficie grande.
- Botones con fondo de marca llevan texto `--ink-950` (5.5:1), no blanco (3.6:1, no pasa AA).
- **Posters con `<img>` plano**, no `next/image`: Cloudinary ya entrega la imagen optimizada, cada
  transformacion de next/image en Vercel se cobra, y next/image bloquea SVG (que es lo que usa el
  seed). Siempre con `width`, `height`, `alt`, `loading="lazy"` y `decoding="async"`.
- La primera fila de posters de la grilla lleva `loading="eager"` y `fetchpriority="high"`. El resto,
  `lazy`. El primer frame visible es la metrica del producto.
- **Ningun autoplay en la grilla.** Ningun `<video>` en una tarjeta. El video de un plato se carga
  solo cuando el comensal lo abre.
- Movimiento: solo `transform` y `opacity`, 160ms `ease-out` (hover/press) o 220ms (abrir plato).
  Todo dentro de `@media (prefers-reduced-motion: reduce) { ... }` que lo desactiva.
- Foco visible en todo lo enfocable: `outline: 2px solid var(--color-brand); outline-offset: 2px`.
  Nunca `outline: none` sin reemplazo.
- Objetivos tactiles de 44x44 CSS px como minimo (el minimo WCAG es 24; en una carta que se usa con
  el pulgar, 44 es lo razonable).
- Maximo 300 lineas por componente.
