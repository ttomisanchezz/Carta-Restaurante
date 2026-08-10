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
 * Alta y administracion de restaurantes. **Solo superadmin.**
 *
 * Un owner administra SU restaurante; dar de alta uno nuevo es una operacion de la casa,
 * no del cliente.
 */

/**
 * Los mismos patrones que los `check` de la base, a proposito.
 *
 * No es duplicacion ociosa: zod da un mensaje por campo y la base da la ultima palabra.
 * Si algun dia se tocan las reglas hay que tocar las dos, y esta bien que sea asi — la
 * validacion del servidor es la segunda linea de defensa, nunca la unica.
 */
export const crearRestauranteSchema = z
  .object({
    slug: z
      .string()
      .regex(/^[a-z0-9-]{2,40}$/, "Solo minúsculas, números y guiones, entre 2 y 40 caracteres."),
    name: z.string().trim().min(1, "El nombre no puede estar vacío."),
    primary_color: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/, "Tiene que ser un hex de 6 dígitos, por ejemplo #E8562A.")
      .default("#E8562A"),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/, "Código ISO de 3 letras.")
      .default("ARS"),
    plan: z.enum(["basico", "pedidos"]).default("basico"),
  })
  .strict();

export type CrearRestaurante = z.input<typeof crearRestauranteSchema>;

export async function crearRestaurante(
  entrada: unknown,
  ctx: ContextoAdmin,
): Promise<ResultadoAccion<{ id: string }>> {
  // La autorizacion va PRIMERO, antes de validar. Contestarle "el color es inválido" a
  // alguien que no tiene permiso para crear nada le confirma que el formulario existe y
  // que campos tiene.
  if (ctx.sesion.role !== "superadmin") {
    return falla("forbidden", "Solo un superadmin puede crear restaurantes.");
  }

  const parseado = crearRestauranteSchema.safeParse(entrada);
  if (!parseado.success) return fallaDeValidacion(parseado.error);

  const { data, error } = await ctx.db
    .from("restaurants")
    .insert(parseado.data)
    .select("id")
    .single();

  if (error) {
    return fallaDePostgres(error.code, {
      conflict: "Ya existe un restaurante con ese slug.",
      forbidden: "Solo un superadmin puede crear restaurantes.",
    });
  }

  return exito({ id: data.id as string });
}

const cambiarEstadoSchema = z
  .object({
    id: z.string().uuid(),
    is_active: z.boolean(),
  })
  .strict();

/**
 * Publica o da de baja un restaurante.
 *
 * Poner `is_active` en false apaga la carta publica: el siguiente escaneo del QR da 404.
 * Es el interruptor de "dejo de pagar" y el de "cerramos por reformas".
 */
export async function cambiarEstadoRestaurante(
  entrada: unknown,
  ctx: ContextoAdmin,
): Promise<ResultadoAccion<{ id: string; slug: string; is_active: boolean }>> {
  if (ctx.sesion.role !== "superadmin") {
    return falla("forbidden", "Solo un superadmin puede publicar o dar de baja un restaurante.");
  }

  const parseado = cambiarEstadoSchema.safeParse(entrada);
  if (!parseado.success) return fallaDeValidacion(parseado.error);

  const { data, error } = await ctx.db
    .from("restaurants")
    .update({ is_active: parseado.data.is_active })
    .eq("id", parseado.data.id)
    // El slug vuelve porque quien llama tiene que revalidar la carta publica de ESE slug:
    // con `revalidate = 60`, una baja tardaria hasta un minuto en verse. Un restaurante
    // que dejo de pagar no puede seguir sirviendo su carta durante un minuto.
    .select("id, slug, is_active")
    .maybeSingle();

  if (error) {
    return fallaDePostgres(error.code, {
      forbidden: "No tenés permiso para cambiar el estado de este restaurante.",
    });
  }

  // Sin error y sin fila: RLS filtro el update. Para quien pregunta, no existe.
  if (!data) return falla("not_found", "No encontramos ese restaurante.");

  return exito({
    id: data.id as string,
    slug: data.slug as string,
    is_active: data.is_active as boolean,
  });
}

/**
 * Lista para el panel.
 *
 * **El filtro por restaurante es explicito y hace falta.** La policy `restaurants_select`
 * deja ver toda fila con `is_active` en true — tiene que hacerlo, porque de eso vive la
 * carta publica y el cliente anonimo. Pero en el PANEL eso significaria que cualquier
 * owner ve la lista completa de restaurantes del sistema, o sea la cartera de clientes.
 *
 * RLS sigue siendo lo que impide escribir sobre lo ajeno. Esto es otra cosa: no mostrar de
 * mas. Un superadmin si ve todo, que es su trabajo.
 */
export async function listarRestaurantes(ctx: ContextoAdmin) {
  const consulta = ctx.db
    .from("restaurants")
    .select("id, slug, name, primary_color, currency, plan, is_active")
    .order("name");

  if (ctx.sesion.role !== "superadmin") {
    // Un no-superadmin sin restaurante asignado no tiene nada que administrar.
    if (ctx.sesion.restaurantId === null) return [];
    consulta.eq("id", ctx.sesion.restaurantId);
  }

  const { data } = await consulta;
  return data ?? [];
}
