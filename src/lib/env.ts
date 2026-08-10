import { z } from "zod";

/**
 * Esquema del entorno del servidor.
 *
 * Solo las tres variables de Supabase son obligatorias hoy. Todo lo de Cloudinary
 * es opcional con default y se vuelve obligatorio recien en el paso 16: una variable
 * que llega en un paso posterior no puede romper el gate de un paso anterior.
 */
export const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("NEXT_PUBLIC_SUPABASE_URL debe ser una URL valida"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY no puede estar vacia"),
  /**
   * OPCIONAL, y es una decision de seguridad, no una relajacion.
   *
   * Ningun codigo de `src/` la usa: la leen `scripts/create-admin.ts` y los helpers de
   * `tests/`, directo de `process.env`, y `tests/setup.ts` la exige por su cuenta. Si acá
   * fuera obligatoria, desplegar en Vercel forzaria a cargar en el entorno de produccion
   * una clave que **saltea RLS por completo** y que ninguna linea del servidor lee.
   *
   * Cuanto menos exista esa clave, mejor: no se puede filtrar lo que no esta.
   */
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

  VIDEO_PROVIDER: z.enum(["direct", "cloudinary"]).default("direct"),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  CLOUDINARY_UPLOAD_FOLDER: z.string().default("carta/dev"),
  CLOUDINARY_STREAMING_PROFILE: z.string().default("hd"),

  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://127.0.0.1:3000"),

  /**
   * Protege `/api/keep-alive`. Opcional en el esquema y no por descuido: si fuera
   * obligatoria, cualquier build anterior al paso 18 fallaria por una variable que ese
   * build todavia no necesita. La ruta falla cerrada si no esta.
   */
  CRON_SECRET: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/**
 * Las dos variables que SI viajan al navegador. Son las unicas que puede leer un
 * componente de cliente, el proxy o cualquier cosa que corra fuera del servidor.
 */
export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("NEXT_PUBLIC_SUPABASE_URL debe ser una URL valida"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY no puede estar vacia"),
  /**
   * Origen publico del sitio, **sin barra final**.
   *
   * Es lo que Next usa como `metadataBase` para convertir en absolutas las URLs de Open
   * Graph. Sin esto, compartir la carta por WhatsApp manda un enlace sin vista previa — y
   * la carta de un restaurante se comparte por WhatsApp todo el tiempo.
   */
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://127.0.0.1:3000"),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

const SITE_URL_POR_DEFECTO = "http://127.0.0.1:3000";

/**
 * El origen publico del sitio, **sin lanzar nunca**.
 *
 * Existe aparte de `loadPublicEnv()` por una razon que costo un deploy fallado: esto lo
 * consume el `metadataBase` del layout raiz, que Next evalua **en tiempo de build**, al
 * recolectar los datos de cada pagina. Si acá se usara `loadPublicEnv()`, un build sin
 * variables de entorno —el primer deploy de un proyecto nuevo, antes de cargarlas— muere
 * con "Failed to collect page data for /_not-found" y un mensaje sobre Supabase que no
 * tiene nada que ver con el problema.
 *
 * Es la misma regla que ya explicaba `loadServerEnv`: nada que corra al importar un modulo
 * puede exigir configuracion. Una URL de metadata mal puesta degrada una vista previa de
 * WhatsApp; que no compile, tira el sitio entero.
 */
export function getSiteUrl(): string {
  const parseado = z.string().url().safeParse(process.env.NEXT_PUBLIC_SITE_URL);
  return parseado.success ? parseado.data : SITE_URL_POR_DEFECTO;
}

/**
 * Entorno publico, valido tanto en el servidor como en el navegador.
 *
 * Los nombres se escriben LITERALES y de a uno a proposito: el bundler de Next
 * reemplaza cada `process.env.NEXT_PUBLIC_ALGO` por su valor en tiempo de build. Un
 * acceso dinamico (`process.env[nombre]`, o pasarle `process.env` entero) no se
 * reemplaza, y en el navegador llega `undefined`.
 *
 * Es tambien la razon por la que esta funcion existe aparte de `loadServerEnv()`: esa
 * exige la clave de servicio, que no existe ni tiene que existir fuera del servidor.
 */
export function loadPublicEnv(): PublicEnv {
  const result = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  });

  if (!result.success) {
    const detalle = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(raiz)"}: ${issue.message}`)
      .join("\n  ");
    throw new Error(`Entorno publico invalido. Revisa .env.local:\n  ${detalle}`);
  }

  return result.data;
}

/**
 * Lee y valida el entorno.
 *
 * PEREZOSA a proposito: no se ejecuta al importar el modulo. Si validara en el
 * momento de la importacion, cualquier build fallaria por una variable que ese
 * build todavia no necesita — incluido `next build`, que importa modulos para
 * recolectar rutas.
 *
 * Lanza con los nombres de las variables que faltan, nunca con un mensaje generico.
 */
export function loadServerEnv(source: Record<string, string | undefined> = process.env): ServerEnv {
  const result = serverEnvSchema.safeParse(source);

  if (!result.success) {
    const detalle = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(raiz)"}: ${issue.message}`)
      .join("\n  ");
    throw new Error(`Entorno invalido. Revisa .env.local:\n  ${detalle}`);
  }

  return result.data;
}
