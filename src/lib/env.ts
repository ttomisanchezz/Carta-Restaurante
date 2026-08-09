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
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY no puede estar vacia"),

  VIDEO_PROVIDER: z.enum(["direct", "cloudinary"]).default("direct"),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  CLOUDINARY_UPLOAD_FOLDER: z.string().default("carta/dev"),
  CLOUDINARY_STREAMING_PROFILE: z.string().default("hd"),

  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://127.0.0.1:3000"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

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
