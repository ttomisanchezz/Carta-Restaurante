import { loadServerEnv, type ServerEnv } from "../env.ts";
import { crearCloudinaryProvider } from "./cloudinary-provider.ts";
import { crearDirectUrlProvider } from "./direct-url-provider.ts";

/**
 * La unica puerta al video.
 *
 * Ningun componente ni ruta importa el SDK de Cloudinary: piden el proveedor y reciben
 * URLs. Cambiar de proveedor de video es entonces un archivo nuevo y una linea acá, no
 * una cacería por todo `src/`.
 */

export type RelacionDeAspecto = "4:5" | "9:16" | "1:1" | "16:9";

export type OpcionesDePoster = {
  width: number;
  ratio: RelacionDeAspecto;
};

export type VideoProvider = {
  /** `direct` o `cloudinary`. Lo usan los tests y el diagnostico. */
  name: "direct" | "cloudinary";
  /** URL del manifiesto o del archivo a reproducir. */
  playbackUrl: (playbackId: string) => string;
  /** URL del cuadro fijo que se ve antes de que arranque el video. */
  posterUrl: (playbackId: string, opciones: OpcionesDePoster) => string;
};

/** Lo minimo del entorno que le importa al video. */
export type EntornoDeVideo = Pick<
  ServerEnv,
  "VIDEO_PROVIDER" | "CLOUDINARY_CLOUD_NAME" | "CLOUDINARY_STREAMING_PROFILE"
>;

/**
 * Elige el proveedor segun `VIDEO_PROVIDER`.
 *
 * Recibe el entorno como parametro —con el real por defecto— para que los tests puedan
 * probar las dos ramas sin ensuciar `process.env` ni depender del orden de ejecucion.
 */
/**
 * Elige el poster de un plato: **el guardado gana sobre el derivado**.
 *
 * Vive acá, en una funcion pura y con tests, porque el orden al reves ya llego a
 * produccion una vez. Con `VIDEO_PROVIDER=cloudinary`, los platos del seed pedian su
 * poster a `res.cloudinary.com/.../seed/<slug>.jpg`, que da 404 porque esos videos nunca
 * se subieron: la carta de demostracion mostraba una imagen rota.
 *
 * La regla es simple y no depende del proveedor: si la fila trae un poster explicito, ese
 * es el poster. El proveedor lo DERIVA del video solo cuando no hay ninguno guardado — el
 * caso de los platos que se cargan por el panel.
 */
export function elegirPosterUrl(
  // Solo se le pide `posterUrl`, no el proveedor entero: es lo unico que usa, y asi un
  // test puede pasarle un doble de tres lineas sin inventar un `name` valido.
  proveedor: Pick<VideoProvider, "posterUrl">,
  plato: { thumbnail_url: string | null; video_playback_id: string | null },
  opciones: { width: number; ratio: "9:16" | "4:5" },
): string {
  if (plato.thumbnail_url) return plato.thumbnail_url;
  if (!plato.video_playback_id) return "";
  return proveedor.posterUrl(plato.video_playback_id, opciones);
}

export function getVideoProvider(env: EntornoDeVideo = loadServerEnv()): VideoProvider {
  if (env.VIDEO_PROVIDER === "cloudinary") {
    return crearCloudinaryProvider(env);
  }

  return crearDirectUrlProvider();
}
