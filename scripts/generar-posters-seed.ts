/**
 * Genera los posters de la demo BRASA.
 *
 * ## Por que existen estos archivos
 *
 * En produccion el poster de un plato lo saca el proveedor de video del propio video, o lo
 * sube el restaurante. En la demo no hay ninguno de los dos, y un plato sin poster muestra
 * una imagen rota en una reunion de venta. Estos SVG son el reemplazo.
 *
 * ## Por que NO llevan el nombre del plato
 *
 * La version anterior dibujaba el nombre dentro del poster. Como la tarjeta ya muestra el
 * nombre justo debajo, el comensal lo leia dos veces con ocho pixeles de diferencia — y
 * despues del pase visual, con filete de acento en los dos lados, se leia directamente
 * como un error de maquetado. Se veia igual en la vista de plato: el titulo repetido
 * adentro y afuera de la imagen.
 *
 * Lo que dibujan en cambio son **brasas bajo la parrilla**: las barras oscuras del asador
 * y el rescoldo colandose entre ellas. Abstracto a proposito. Un poster de relleno tiene
 * que parecer una imagen, no una etiqueta, porque en el producto real ahi va un cuadro de
 * video.
 *
 * El rescoldo cambia de lugar y de intensidad en cada plato: doce rectangulos identicos en
 * una grilla se leen como que las imagenes no cargaron.
 *
 * ## Ejecutar
 *
 *     node --experimental-strip-types scripts/generar-posters-seed.ts
 *
 * Es idempotente y se corre a mano, solo cuando cambia la paleta o entra un plato nuevo.
 * Nada del gate depende de el; lo que el gate verifica es que los archivos existan
 * (`tests/integration/seed.test.ts`) y que ninguno pase de 60 KB
 * (`tests/e2e/perf-poster.spec.ts`). Estos pesan ~1 KB.
 *
 * Ojo con la ruta de import: en `scripts/` NO se usa el alias `@/`, porque Node resuelve
 * literal y no lee `paths` de tsconfig. Este archivo no importa nada, pero la regla aplica.
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Los mismos tokens de `src/app/globals.css`. Un SVG no puede leer una custom property. */
const FONDO_ALTO = "#241A14";
const FONDO_BAJO = "#17110D";
const BRASA = "#E15A2B";
const CARBON = "#17110D";
const REFLEJO = "#F5EAD9";

const ANCHO = 480;
const ALTO = 600;

/** Barras del asador. 10 varillas: menos parece una reja, mas parece un codigo de barras. */
const VARILLAS = 10;
const PASO = ALTO / VARILLAS;
const GROSOR = 22;

type Poster = {
  /** Nombre del archivo, sin extension. Tiene que coincidir con `thumbnail_url` del seed. */
  archivo: string;
  /** Va al `aria-label` del SVG suelto. En la tarjeta manda el `alt` del `<img>`. */
  nombre: string;
};

/**
 * El orden importa: de el sale la posicion del rescoldo de cada plato, asi que reordenar
 * esta lista cambia los doce posters. Es el mismo orden en el que salen en la carta.
 */
const POSTERS: Poster[] = [
  { archivo: "provoleta", nombre: "Provoleta a la parrilla" },
  { archivo: "empanadas-de-carne", nombre: "Empanadas de carne cortada a cuchillo" },
  { archivo: "chorizo-criollo", nombre: "Chorizo criollo con chimichurri" },
  { archivo: "ojo-de-bife", nombre: "Ojo de bife 400g" },
  { archivo: "entrana-fina", nombre: "Entraña fina" },
  { archivo: "asado-de-tira", nombre: "Asado de tira" },
  { archivo: "mollejas-al-limon", nombre: "Mollejas al limón" },
  { archivo: "papas-con-huevo-roto", nombre: "Papas fritas con huevo roto" },
  { archivo: "cebollas-asadas", nombre: "Cebollas asadas con manteca de hierbas" },
  { archivo: "champinones-al-ajillo", nombre: "Champiñones al ajillo" },
  { archivo: "flan-mixto", nombre: "Flan mixto" },
  { archivo: "panqueque-flambeado", nombre: "Panqueque de dulce de leche flambeado" },
];

/**
 * Donde cae el rescoldo de cada plato.
 *
 * Barrido determinista y no aleatorio: el archivo tiene que salir byte por byte igual en
 * cada corrida, o cada ejecucion ensucia el diff de git con doce archivos cambiados.
 *
 * Los numeros primos como paso hacen que la posicion no se repita ni forme un patron
 * visible al recorrer la grilla de arriba abajo.
 */
function rescoldo(indice: number): { cx: number; cy: number; fuerza: number } {
  return {
    cx: 0.28 + ((indice * 7) % 5) * 0.11,
    cy: 0.46 + ((indice * 3) % 4) * 0.09,
    // Apagado a proposito. Con el rescoldo mas fuerte, el poster le ganaba en atencion al
    // nombre y al precio, que es lo que el comensal necesita leer.
    fuerza: 0.36 + ((indice * 5) % 3) * 0.08,
  };
}

/** Escapa lo que va dentro de un atributo XML. Los nombres traen tildes, no comillas. */
function escapar(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function varillas(): string {
  const piezas: string[] = [];

  for (let i = 0; i < VARILLAS; i += 1) {
    const y = Math.round(i * PASO + (PASO - GROSOR) / 2);
    // Se extienden fuera del lienzo para que no se vean las puntas: son varillas de un
    // asador que sigue mas alla del recorte, no barras flotando.
    piezas.push(
      `<rect x="-24" y="${y}" width="${ANCHO + 48}" height="${GROSOR}" rx="${GROSOR / 2}" fill="${CARBON}" opacity="0.72"/>`,
    );
    // Filo de luz arriba de cada varilla: es lo que las convierte en hierro y no en rayas.
    piezas.push(
      `<rect x="-24" y="${y}" width="${ANCHO + 48}" height="1" fill="${REFLEJO}" opacity="0.07"/>`,
    );
  }

  return piezas.join("");
}

function svg({ archivo, nombre }: Poster, indice: number): string {
  const { cx, cy, fuerza } = rescoldo(indice);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ANCHO} ${ALTO}" width="${ANCHO}" height="${ALTO}" role="img" aria-label="${escapar(nombre)}">
  <defs>
    <linearGradient id="fondo-${archivo}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${FONDO_ALTO}"/>
      <stop offset="1" stop-color="${FONDO_BAJO}"/>
    </linearGradient>
    <radialGradient id="brasa-${archivo}" cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="0.68">
      <stop offset="0" stop-color="${BRASA}" stop-opacity="${fuerza.toFixed(2)}"/>
      <stop offset="0.5" stop-color="${BRASA}" stop-opacity="${(fuerza * 0.28).toFixed(2)}"/>
      <stop offset="1" stop-color="${BRASA}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${ANCHO}" height="${ALTO}" fill="url(#fondo-${archivo})"/>
  <rect width="${ANCHO}" height="${ALTO}" fill="url(#brasa-${archivo})"/>
  <g>${varillas()}</g>
</svg>
`;
}

const destino = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "seed");

for (const [indice, poster] of POSTERS.entries()) {
  const ruta = join(destino, `${poster.archivo}.svg`);
  writeFileSync(ruta, svg(poster, indice), "utf8");
  console.log(`escrito ${poster.archivo}.svg`);
}
