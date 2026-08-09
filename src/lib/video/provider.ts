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
export function getVideoProvider(env: EntornoDeVideo = loadServerEnv()): VideoProvider {
  if (env.VIDEO_PROVIDER === "cloudinary") {
    return crearCloudinaryProvider(env);
  }

  return crearDirectUrlProvider();
}
