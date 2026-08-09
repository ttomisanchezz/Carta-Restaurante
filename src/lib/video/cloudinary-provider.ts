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
  };
}
