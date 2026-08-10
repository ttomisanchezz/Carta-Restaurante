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
 * Categorias de la carta. Las administra el owner de su propio restaurante.
 */

export type CategoriaDelPanel = {
  id: string;
  name: string;
  sort_order: number;
  platos: number;
};

const crearSchema = z
  .object({
    name: z.string().trim().min(1, "El nombre no puede estar vacío."),
  })
  .strict();

/**
 * Crea una categoria en EL restaurante de quien la crea.
 *
 * **`restaurant_id` sale de la sesion, nunca del formulario**, y el esquema es `.strict()`
 * asi que mandarlo es un error de validacion en vez de una fuga. Aceptarlo del cliente
 * seria confiarle al navegador la respuesta a "de quien es esto": el `with check` de la
 * policy lo frenaria igual, pero la primera linea de defensa es no preguntarlo.
 */
export async function crearCategoria(
  entrada: unknown,
  ctx: ContextoAdmin,
): Promise<ResultadoAccion<{ id: string }>> {
  const restaurantId = ctx.sesion.restaurantId;
  if (restaurantId === null) {
    return falla("forbidden", "Tu usuario no tiene un restaurante asignado.");
  }

  const parseado = crearSchema.safeParse(entrada);
  if (!parseado.success) return fallaDeValidacion(parseado.error);

  // Al final de la lista: el orden lo cambia despues quien quiera, con los controles.
  const { data: ultima } = await ctx.db
    .from("categories")
    .select("sort_order")
    .eq("restaurant_id", restaurantId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await ctx.db
    .from("categories")
    .insert({
      restaurant_id: restaurantId,
      name: parseado.data.name,
      sort_order: (ultima?.sort_order ?? -1) + 1,
    })
    .select("id")
    .single();

  if (error) {
    return fallaDePostgres(error.code, {
      forbidden: "No podés crear categorías en este restaurante.",
    });
  }

  return exito({ id: data.id as string });
}

const porIdSchema = z.object({ id: z.string().uuid() }).strict();

/**
 * Borra una categoria, salvo que tenga platos adentro.
 *
 * El bloqueo lo impone la base con `on delete restrict`, no un `if` de acá: el `if` se
 * puede olvidar en el proximo camino de codigo, la foreign key no. Acá solo se traduce el
 * error a algo que una persona entienda, con el numero de platos que estorban.
 */
export async function borrarCategoria(
  entrada: unknown,
  ctx: ContextoAdmin,
): Promise<ResultadoAccion<{ id: string }>> {
  const parseado = porIdSchema.safeParse(entrada);
  if (!parseado.success) return fallaDeValidacion(parseado.error);

  const { data, error } = await ctx.db
    .from("categories")
    .delete()
    .eq("id", parseado.data.id)
    .select("id");

  if (error) {
    // 23503 = foreign_key_violation, que es lo que produce ON DELETE RESTRICT.
    if (error.code === "23503") {
      const { count } = await ctx.db
        .from("dishes")
        .select("id", { count: "exact", head: true })
        .eq("category_id", parseado.data.id);

      const cuantos = count ?? 0;
      return falla(
        "conflict",
        `No podés borrar esta categoría: tiene ${cuantos} ${cuantos === 1 ? "plato" : "platos"} adentro. Movelos o borralos primero.`,
      );
    }

    return fallaDePostgres(error.code, {});
  }

  // Sin error y sin filas: RLS filtro el borrado porque la categoria es de otro. Se
  // contesta `not_found` y no `forbidden`: confirmar que existe ya es contar de mas.
  if (!data || data.length === 0) {
    return falla("not_found", "No encontramos esa categoría.");
  }

  return exito({ id: parseado.data.id });
}

/**
 * Sube una categoria un lugar.
 *
 * Intercambia `sort_order` con la anterior. Si ya es la primera, no hace nada y **no es un
 * error**: el usuario apretó un boton que no tenia efecto, no rompió nada.
 *
 * Los dos updates no son una transaccion. Con PostgREST no hay forma de mandarlos juntos
 * sin una funcion en la base, y el riesgo real es acotado: dos categorias quedarian con el
 * mismo `sort_order` por un instante, y el peor efecto visible es que la carta las muestre
 * en un orden arbitrario entre ellas hasta el siguiente movimiento.
 */
export async function subirCategoria(
  entrada: unknown,
  ctx: ContextoAdmin,
): Promise<ResultadoAccion<{ movida: boolean }>> {
  const parseado = porIdSchema.safeParse(entrada);
  if (!parseado.success) return fallaDeValidacion(parseado.error);

  const { data: actual } = await ctx.db
    .from("categories")
    .select("id, restaurant_id, sort_order")
    .eq("id", parseado.data.id)
    .maybeSingle();

  if (!actual) return falla("not_found", "No encontramos esa categoría.");

  // Poder LEERLA no alcanza para poder moverla. La policy de lectura tiene una rama
  // publica —toda categoria de un restaurante activo es legible, porque de eso vive la
  // carta— asi que acá llega tranquilamente la categoria de otro. Sin esta comprobacion
  // los dos updates de abajo los filtraria RLS, devolverian cero filas SIN error, y la
  // funcion contestaria "listo, la movi" sin haber movido nada.
  const esPropia = actual.restaurant_id === ctx.sesion.restaurantId;
  if (!esPropia && ctx.sesion.role !== "superadmin") {
    return falla("not_found", "No encontramos esa categoría.");
  }

  const { data: anterior } = await ctx.db
    .from("categories")
    .select("id, sort_order")
    .eq("restaurant_id", actual.restaurant_id)
    .lt("sort_order", actual.sort_order)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Ya era la primera.
  if (!anterior) return exito({ movida: false });

  // Los dos updates piden la fila de vuelta. Sin `.select()`, un update que RLS filtra
  // vuelve sin error y con cero filas, y no habria forma de distinguirlo de uno que si
  // hizo el trabajo.
  const { data: f1, error: e1 } = await ctx.db
    .from("categories")
    .update({ sort_order: anterior.sort_order })
    .eq("id", actual.id)
    .select("id");
  if (e1) return fallaDePostgres(e1.code, {});
  if (!f1 || f1.length === 0) return falla("not_found", "No encontramos esa categoría.");

  const { data: f2, error: e2 } = await ctx.db
    .from("categories")
    .update({ sort_order: actual.sort_order })
    .eq("id", anterior.id)
    .select("id");
  if (e2) return fallaDePostgres(e2.code, {});
  if (!f2 || f2.length === 0) return falla("not_found", "No encontramos esa categoría.");

  return exito({ movida: true });
}

/** Categorias del restaurante de la sesion, con cuantos platos tiene cada una. */
export async function listarCategorias(ctx: ContextoAdmin): Promise<CategoriaDelPanel[]> {
  const restaurantId = ctx.sesion.restaurantId;
  if (restaurantId === null) return [];

  const { data } = await ctx.db
    .from("categories")
    .select("id, name, sort_order, dishes(count)")
    .eq("restaurant_id", restaurantId)
    .order("sort_order");

  return (data ?? []).map((fila) => ({
    id: fila.id as string,
    name: fila.name as string,
    sort_order: fila.sort_order as number,
    // PostgREST devuelve el agregado como [{ count: n }].
    platos: (fila.dishes as { count: number }[] | null)?.[0]?.count ?? 0,
  }));
}
