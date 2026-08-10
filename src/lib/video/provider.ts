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

export type OpcionesDeClip = OpcionesDePoster & {
  /** Segundos a los que se recorta el clip. Un teaser en loop no necesita mas. */
  segundos: number;
};

export type VideoProvider = {
  /** `direct` o `cloudinary`. Lo usan los tests y el diagnostico. */
  name: "direct" | "cloudinary";
  /** URL del manifiesto o del archivo a reproducir. Para la vista de plato. */
  playbackUrl: (playbackId: string) => string;
  /** URL del cuadro fijo que se ve antes de que arranque el video. */
  posterUrl: (playbackId: string, opciones: OpcionesDePoster) => string;
  /**
   * Clip corto y liviano para la GRILLA. Distinto de `playbackUrl` a proposito.
   *
   * La grilla usaba el mismo manifiesto HLS que la vista de plato, y estaba mal por dos
   * razones que se notaban en pantalla. Medido contra la cuenta real, con una fuente 4K
   * de 28 MB:
   *
   *   MP4 sin transformar   28.8 MB   12.4 s
   *   MP4 600px, 6 segundos  1.17 MB   0.9 s desde la CDN
   *
   * 25 veces mas liviano. Y ademas se ve MEJOR: para acomodar HLS a una tarjeta de ~170px
   * habia que limitar la calidad al tamano del reproductor, o sea pedirle a propósito la
   * peor version. Un archivo unico, recortado al tamano real, no tiene ese problema — y no
   * necesita manifiesto, ni negociacion de niveles, ni hls.js.
   *
   * HLS sigue siendo lo correcto en la vista de plato: ahi el video es el contenido, se
   * mira entero y conviene que se adapte a la red.
   */
  clipUrl: (playbackId: string, opciones: OpcionesDeClip) => string;
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
