import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { loadServerEnv } from "@/lib/env";
import { firmarParametros } from "@/lib/video/cloudinary-provider";

/**
 * Firma una subida de video para que el navegador suba DIRECTO a Cloudinary.
 *
 * El archivo no pasa por acá y no puede pasar: una funcion de Vercel tiene un limite de
 * 4.5 MB de cuerpo, y un video de un plato lo supera sin esfuerzo. Lo unico que viaja por
 * este endpoint es la autorizacion para subir.
 *
 * **`CLOUDINARY_API_SECRET` nunca aparece en la respuesta.** Se usa para calcular el hash
 * y no se incluye en ningun campo. Hay un test que serializa la respuesta entera y busca
 * el secreto adentro.
 */

const cuerpoSchema = z
  .object({
    dishId: z.string().uuid(),
    // El conjunto de caracteres es cerrado a proposito: este valor termina dentro de una
    // ruta de Cloudinary, y un `..` o un espacio ahi es una via para escribir donde no va.
    publicId: z
      .string()
      .min(1)
      .max(120)
      .regex(/^[a-zA-Z0-9_/-]+$/, "El publicId solo acepta letras, números, _, / y -."),
  })
  .strict();

function error(code: string, message: string, status: number): Response {
  return Response.json({ error: { code, message } }, { status });
}

export async function POST(request: Request): Promise<Response> {
  // 1. Sesion. Va primero: sin ella no se contesta nada, ni siquiera si el cuerpo esta mal.
  const sesion = await requireAdminApi();
  if (!sesion) return error("unauthorized", "Necesitás iniciar sesión.", 401);

  // 2. Forma del cuerpo. Antes que el proveedor, para que un publicId invalido conteste
  //    422 y no un 503 que taparia el problema real.
  let crudo: unknown;
  try {
    crudo = await request.json();
  } catch {
    return error("validation_error", "El cuerpo no es JSON válido.", 422);
  }

  const parseado = cuerpoSchema.safeParse(crudo);
  if (!parseado.success) {
    return error("validation_error", parseado.error.issues[0]?.message ?? "Datos inválidos.", 422);
  }

  // 3. Proveedor configurado.
  const env = loadServerEnv();
  const cloudName = env.CLOUDINARY_CLOUD_NAME;
  const apiKey = env.CLOUDINARY_API_KEY;
  const apiSecret = env.CLOUDINARY_API_SECRET;

  if (env.VIDEO_PROVIDER !== "cloudinary" || !cloudName || !apiKey || !apiSecret) {
    return error(
      "provider_unavailable",
      "La subida de video no está configurada en este entorno.",
      503,
    );
  }

  // 4. Firma.
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = env.CLOUDINARY_UPLOAD_FOLDER;
  const publicId = parseado.data.publicId;

  const signature = firmarParametros({ folder, public_id: publicId, timestamp }, apiSecret);

  return Response.json({
    data: {
      cloudName,
      apiKey,
      timestamp,
      signature,
      folder,
      publicId,
      uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`,
    },
  });
}
