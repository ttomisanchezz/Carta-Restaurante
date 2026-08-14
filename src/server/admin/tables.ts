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
 * Mesas identificadas por QR. Las administra el owner de su propio restaurante.
 *
 * **El `token` NO se genera acá.** Sale del `default` de la columna, que es
 * `encode(gen_random_bytes(16), 'hex')`: 128 bits del CSPRNG de Postgres. Ningun INSERT de
 * este archivo lo manda, y esa omision es deliberada — el dia que alguien quiera "elegir"
 * un token, la unica forma de hacerlo es tocar el esquema, que es donde se ve.
 */

export type MesaDelPanel = {
  id: string;
  label: string;
  token: string;
  is_active: boolean;
};

/** Todas las operaciones requieren que el owner tenga un restaurante provisionado. */
function requiereRestaurante<T>(ctx: ContextoAdmin): ResultadoAccion<T> | null {
  if (ctx.sesion.restaurantId === null) {
    return falla<T>("forbidden", "Tu usuario no tiene un restaurante asignado.");
  }
  return null;
}

const crearSchema = z
  .object({
    label: z
      .string()
      .trim()
      .min(1, "Poné un nombre para la mesa.")
      .max(60, "Nombre demasiado largo."),
  })
  .strict();

/**
 * Crea una mesa en EL restaurante de quien la crea.
 *
 * `restaurant_id` sale de la sesion y el esquema es `.strict()`, asi que mandarlo desde el
 * formulario es un error de validacion en vez de una fuga. El `with check` de la policy lo
 * frenaria igual: esta es la primera linea, no la unica.
 */
export async function crearMesa(
  entrada: unknown,
  ctx: ContextoAdmin,
): Promise<ResultadoAccion<{ id: string }>> {
  const denegado = requiereRestaurante<{ id: string }>(ctx);
  if (denegado) return denegado;

  const parseado = crearSchema.safeParse(entrada);
  if (!parseado.success) return fallaDeValidacion(parseado.error);

  const { data, error } = await ctx.db
    .from("restaurant_tables")
    .insert({ restaurant_id: ctx.sesion.restaurantId, label: parseado.data.label })
    .select("id")
    .single();

  if (error) {
    return fallaDePostgres(error.code, {
      forbidden: "No podés crear mesas en este restaurante.",
    });
  }

  return exito({ id: data.id as string });
}

const renombrarSchema = z
  .object({
    id: z.string().uuid(),
    label: z
      .string()
      .trim()
      .min(1, "Poné un nombre para la mesa.")
      .max(60, "Nombre demasiado largo."),
  })
  .strict();

/**
 * Cambia la etiqueta visible. **No toca el token**, y por eso renombrar es seguro: los QR
 * ya impresos y pegados a las mesas siguen resolviendo a la misma fila.
 */
export async function renombrarMesa(
  entrada: unknown,
  ctx: ContextoAdmin,
): Promise<ResultadoAccion<{ id: string }>> {
  const denegado = requiereRestaurante<{ id: string }>(ctx);
  if (denegado) return denegado;

  const parseado = renombrarSchema.safeParse(entrada);
  if (!parseado.success) return fallaDeValidacion(parseado.error);

  // `.select()` no es decorativo: un UPDATE que RLS filtra vuelve SIN error y con cero
  // filas, y sin pedir la fila de vuelta no habria como distinguirlo de uno que funciono.
  const { data, error } = await ctx.db
    .from("restaurant_tables")
    .update({ label: parseado.data.label })
    .eq("id", parseado.data.id)
    .select("id");

  if (error) return fallaDePostgres(error.code, {});
  if (!data || data.length === 0) return falla("not_found", "No encontramos esa mesa.");

  return exito({ id: parseado.data.id });
}

const activacionSchema = z
  .object({
    id: z.string().uuid(),
    // Del formulario llega texto, no booleano.
    activa: z.enum(["si", "no"]),
  })
  .strict();

/**
 * Activa o desactiva una mesa. **No hay borrado, y no es un olvido.**
 *
 * La tabla no tiene policy de DELETE: por PostgREST el borrado afecta cero filas para
 * cualquiera. Un token borrado y reusado apuntaria pedidos viejos a la mesa equivocada, y
 * eso se descubre cuando un plato sale a la mesa que no lo pidio.
 */
export async function cambiarActivacionMesa(
  entrada: unknown,
  ctx: ContextoAdmin,
): Promise<ResultadoAccion<{ id: string; activa: boolean }>> {
  const denegado = requiereRestaurante<{ id: string; activa: boolean }>(ctx);
  if (denegado) return denegado;

  const parseado = activacionSchema.safeParse(entrada);
  if (!parseado.success) return fallaDeValidacion(parseado.error);

  const activa = parseado.data.activa === "si";

  const { data, error } = await ctx.db
    .from("restaurant_tables")
    .update({ is_active: activa })
    .eq("id", parseado.data.id)
    .select("id");

  if (error) return fallaDePostgres(error.code, {});
  if (!data || data.length === 0) return falla("not_found", "No encontramos esa mesa.");

  return exito({ id: parseado.data.id, activa });
}

/**
 * El slug del restaurante de la sesion, o `null`.
 *
 * Hace falta para armar la URL que va adentro del QR, y se lee de la base en vez de
 * guardarse en la sesion: el dueño puede cambiar su slug, y un QR ya impreso con el slug
 * viejo es un cartel muerto pegado a una mesa.
 */
export async function slugDeMiRestaurante(ctx: ContextoAdmin): Promise<string | null> {
  if (ctx.sesion.restaurantId === null) return null;

  const { data } = await ctx.db
    .from("restaurants")
    .select("slug")
    .eq("id", ctx.sesion.restaurantId)
    .maybeSingle();

  return (data?.slug as string | undefined) ?? null;
}

/** Las mesas del restaurante de la sesion, las activas primero y por antiguedad. */
export async function listarMesas(ctx: ContextoAdmin): Promise<MesaDelPanel[]> {
  if (ctx.sesion.restaurantId === null) return [];

  const { data } = await ctx.db
    .from("restaurant_tables")
    .select("id, label, token, is_active")
    .eq("restaurant_id", ctx.sesion.restaurantId)
    .order("is_active", { ascending: false })
    .order("created_at");

  return (data ?? []) as MesaDelPanel[];
}
