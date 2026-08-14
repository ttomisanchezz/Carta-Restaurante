import { z } from "zod";
import {
  type ContextoAdmin,
  exito,
  falla,
  fallaDePostgres,
  fallaDeValidacion,
  type ResultadoAccion,
} from "./resultado.ts";

/**
 * Confirmacion del video de un plato.
 *
 * El archivo lo sube el navegador directo a Cloudinary; el servidor nunca lo ve. Esta
 * funcion es el paso que viene despues: anotar en la base que ese plato ya tiene video, y
 * recien ahi el plato entra en la carta publica.
 */

const confirmarSchema = z
  .object({
    dishId: z.string().uuid(),
    playbackId: z
      .string()
      .min(1)
      .max(120)
      .regex(/^[a-zA-Z0-9_/-]+$/, "El identificador del video tiene caracteres no permitidos."),
  })
  .strict();

export async function confirmarVideo(
  entrada: unknown,
  ctx: ContextoAdmin,
): Promise<ResultadoAccion<{ id: string }>> {
  const parseado = confirmarSchema.safeParse(entrada);
  if (!parseado.success) return fallaDeValidacion(parseado.error);

  // Se comprueba el dueño antes de escribir. Sin esto, el update lo filtraria RLS y
  // volveria sin error y con cero filas: la accion diria "listo" sin haber hecho nada.
  const { data: plato } = await ctx.db
    .from("dishes")
    .select("id, restaurant_id")
    .eq("id", parseado.data.dishId)
    .maybeSingle();

  if (!plato) return falla("not_found", "No encontramos ese plato.");

  const esPropio = plato.restaurant_id === ctx.sesion.restaurantId;
  if (!esPropio) {
    return falla("not_found", "No encontramos ese plato.");
  }

  const { data, error } = await ctx.db
    .from("dishes")
    .update({
      video_playback_id: parseado.data.playbackId,
      // `ready` es lo que hace visible el plato en la carta: lo exige la policy de
      // lectura publica, no un filtro de la aplicacion.
      video_status: "ready",
    })
    .eq("id", parseado.data.dishId)
    .select("id");

  if (error) {
    return fallaDePostgres(error.code, { forbidden: "No podés modificar este plato." });
  }
  if (!data || data.length === 0) return falla("not_found", "No encontramos ese plato.");

  return exito({ id: parseado.data.dishId });
}
