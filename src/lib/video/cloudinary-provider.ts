import { createHash } from "node:crypto";
import type { EntornoDeVideo, VideoProvider } from "./provider.ts";

/**
 * Proveedor de Cloudinary.
 *
 * **Este es el unico archivo del proyecto autorizado a importar el SDK `cloudinary`.**
 * Hoy no lo importa, y es a proposito: las URLs de entrega son un formato estable y
 * documentado, armarlas como strings no cuesta nada y evita meter un SDK entero en el
 * bundle del servidor solo para concatenar texto. El SDK se usa donde si hace falta —la
 * firma de subida del paso 16—, no acá.
 *
 * Las URLs siguen el formato de entrega de Cloudinary:
 *
 *   video:  /video/upload/sp_<perfil>/<publicId>.m3u8
 *   poster: /video/upload/so_1,c_fill,ar_<ratio>,w_<ancho>,q_auto,f_auto/<publicId>.jpg
 *
 * `so_1` toma el cuadro del segundo 1: el 0 suele ser negro o una claqueta.
 */

const BASE = "https://res.cloudinary.com";

export function crearCloudinaryProvider(env: EntornoDeVideo): VideoProvider {
  const cloud = env.CLOUDINARY_CLOUD_NAME;

  // Falla al construir el proveedor, no al primera reproduccion. Y nombra la variable:
  // "configuracion invalida" a las tres de la mañana no le sirve a nadie.
  if (!cloud || cloud.trim() === "") {
    throw new Error(
      "CLOUDINARY_CLOUD_NAME es obligatoria cuando VIDEO_PROVIDER es 'cloudinary'. " +
        "Sale de Cloudinary Console > Dashboard > Product Environment.",
    );
  }

  const perfil = env.CLOUDINARY_STREAMING_PROFILE;

  return {
    name: "cloudinary",

    playbackUrl: (playbackId) => `${BASE}/${cloud}/video/upload/sp_${perfil}/${playbackId}.m3u8`,

    posterUrl: (playbackId, { width, ratio }) =>
      `${BASE}/${cloud}/video/upload/so_1,c_fill,ar_${ratio},w_${width},q_auto,f_auto/${playbackId}.jpg`,

    /**
     * `du_<segundos>` recorta, `w_<width>` baja la resolucion al tamano real de la tarjeta,
     * `q_auto` deja que Cloudinary elija la compresion y `f_auto` sirve webm o mp4 segun el
     * navegador. Las cuatro juntas son la diferencia entre 28 MB y poco mas de un mega.
     */
    clipUrl: (playbackId, { width, ratio, segundos }) =>
      `${BASE}/${cloud}/video/upload/c_fill,ar_${ratio},w_${width},du_${segundos},q_auto,f_auto/${playbackId}.mp4`,
  };
}

/**
 * Firma un conjunto de parametros de subida.
 *
 * Vive en este archivo y no en la route, y no es un capricho de organizacion: la regla del
 * proyecto dice que solo este archivo puede tocar cosas de Cloudinary. La route importa
 * esta funcion y no sabe nada del formato.
 *
 * El algoritmo es el de Cloudinary: **parametros ordenados alfabeticamente**, unidos como
 * `clave=valor` con `&`, con el secreto pegado al final, y SHA-1 de todo eso en hex. El
 * orden alfabetico no es decorativo — es lo que hace que el servidor de Cloudinary llegue
 * a la misma cadena que nosotros.
 *
 * Se calcula con `node:crypto` en vez del SDK a proposito: son cuatro lineas, no agrega
 * una dependencia al bundle del servidor, y deja el resultado verificable contra un SHA-1
 * calculado por fuera — que es exactamente lo que hace el test.
 *
 * El secreto entra acá y **no sale**: la funcion devuelve solo el hash.
 */
export function firmarParametros(
  parametros: Record<string, string | number>,
  apiSecret: string,
): string {
  const aFirmar = Object.keys(parametros)
    .sort()
    .map((clave) => `${clave}=${parametros[clave]}`)
    .join("&");

  return createHash("sha1").update(`${aFirmar}${apiSecret}`).digest("hex");
}
