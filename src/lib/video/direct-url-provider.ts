import type { VideoProvider } from "./provider.ts";

/**
 * Proveedor directo: el `playbackId` ES la ruta.
 *
 * Es lo que permite que toda la suite corra sin salir a la red y sin una cuenta de
 * Cloudinary. El seed apunta a archivos del propio proyecto (`/seed/...`), asi que en
 * desarrollo y en los tests el video y el poster son estaticos servidos por Next.
 *
 * No es un mock: es un proveedor de verdad, el que se usa cuando los archivos ya viven en
 * el mismo dominio y no hace falta transcodificar nada.
 */
export function crearDirectUrlProvider(): VideoProvider {
  return {
    name: "direct",

    playbackUrl: (playbackId) => `/${quitarBarraInicial(playbackId)}`,

    // El proveedor directo no transforma nada: no hay servidor de imagenes detras. El
    // ancho y la relacion se ignoran a proposito, y el poster es el SVG del seed.
    posterUrl: (playbackId) => `/${quitarBarraInicial(playbackId)}.svg`,

    // Sin transcodificador no hay recorte ni cambio de tamano posible: el clip de la
    // grilla es el mismo archivo. Aca no importa, porque los archivos son locales y no
    // pagan red — el recorte existe para no bajar 28 MB desde una CDN.
    clipUrl: (playbackId) => `/${quitarBarraInicial(playbackId)}`,
  };
}

/** Evita `//seed/x` cuando el id ya viene con barra. */
function quitarBarraInicial(valor: string): string {
  return valor.startsWith("/") ? valor.slice(1) : valor;
}
