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
  /**
   * El public id del video en Cloudinary, que ademas **es el nombre del archivo**.
   *
   * No es casualidad y no se puede cambiar por gusto: con `thumbnail_url` en `null`, el
   * poster lo deriva el proveedor a partir del `video_playback_id`. En produccion eso es un
   * cuadro del video real; en tests y en desarrollo el proveedor es `direct`, que traduce
   * el id a `/<id>.svg`. Si el archivo no se llama igual que el id, la suite entera corre
   * contra una grilla de imagenes rotas.
   */
  publicId: string;
  /** Va al `aria-label` del SVG suelto. En la tarjeta manda el `alt` del `<img>`. */
  nombre: string;
};

/**
 * El orden importa: de el sale la posicion del rescoldo de cada plato, asi que reordenar
 * esta lista cambia los doce posters. Es el mismo orden en el que salen en la carta.
 */
const POSTERS: Poster[] = [
  { publicId: "provoleta_oafjse", nombre: "Provoleta a la parrilla" },
  { publicId: "empanada_kinkj3", nombre: "Empanadas de carne cortada a cuchillo" },
  { publicId: "chorizo_nroul6", nombre: "Chorizo criollo con chimichurri" },
  { publicId: "ojobife400gr_coscxd", nombre: "Ojo de bife 400g" },
  { publicId: "entrana_clw2vd", nombre: "Entraña fina" },
  { publicId: "tira_asado_g6bsfg", nombre: "Asado de tira" },
  { publicId: "mollehja_al_limon_lceipv", nombre: "Mollejas al limón" },
  // Prestado: las papas todavia no tienen video propio. Ver la nota de VIDEOS en seed.sql.
  { publicId: "chorizo_nroul6", nombre: "Papas fritas con huevo roto" },
  { publicId: "cebolla_o5hqud", nombre: "Cebollas asadas con manteca de hierbas" },
  { publicId: "champinione_hcodtb", nombre: "Champiñones al ajillo" },
  { publicId: "flan_dulce_leche_juedar", nombre: "Flan mixto" },
  { publicId: "panqueue_dulce_de_leche_deqc08", nombre: "Panqueque de dulce de leche flambeado" },
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

function svg({ publicId, nombre }: Poster, indice: number): string {
  const { cx, cy, fuerza } = rescoldo(indice);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ANCHO} ${ALTO}" width="${ANCHO}" height="${ALTO}" role="img" aria-label="${escapar(nombre)}">
  <defs>
    <linearGradient id="fondo-${publicId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${FONDO_ALTO}"/>
      <stop offset="1" stop-color="${FONDO_BAJO}"/>
    </linearGradient>
    <radialGradient id="brasa-${publicId}" cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="0.68">
      <stop offset="0" stop-color="${BRASA}" stop-opacity="${fuerza.toFixed(2)}"/>
      <stop offset="0.5" stop-color="${BRASA}" stop-opacity="${(fuerza * 0.28).toFixed(2)}"/>
      <stop offset="1" stop-color="${BRASA}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${ANCHO}" height="${ALTO}" fill="url(#fondo-${publicId})"/>
  <rect width="${ANCHO}" height="${ALTO}" fill="url(#brasa-${publicId})"/>
  <g>${varillas()}</g>
</svg>
`;
}

/**
 * A la raiz de `public/`, no a `public/seed/`.
 *
 * El proveedor directo traduce el `video_playback_id` a `/<id>.svg` sin prefijos, asi que
 * el archivo tiene que quedar exactamente ahi. Poner una carpeta en el medio significaria
 * meter la ruta dentro del id guardado en la base, y ese id pertenece a Cloudinary.
 */
const destino = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

/**
 * Sin repetir: dos platos pueden compartir video —hoy las papas usan el del chorizo— y sin
 * esto el segundo pisaria el archivo del primero con otro rescoldo. El resultado dependeria
 * del orden de la lista, que es justo lo que este script evita ser.
 */
const yaEscritos = new Set<string>();

for (const [indice, poster] of POSTERS.entries()) {
  if (yaEscritos.has(poster.publicId)) {
    console.log(`omitido ${poster.publicId}.svg (compartido con otro plato)`);
    continue;
  }
  yaEscritos.add(poster.publicId);
  writeFileSync(join(destino, `${poster.publicId}.svg`), svg(poster, indice), "utf8");
  console.log(`escrito ${poster.publicId}.svg`);
}
