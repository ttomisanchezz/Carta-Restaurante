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
 * Platos del panel: alta, duplicado y reordenamiento.
 *
 * Los precios son ENTEROS EN CENTAVOS en toda la aplicacion. Acá esta el unico lugar que
 * traduce lo que escribe una persona a ese entero.
 */

/**
 * Convierte un precio escrito a mano en centavos.
 *
 * La regla, explicita porque la ambiguedad acá cuesta plata:
 *
 * - Si hay coma, **la coma es el decimal** y los puntos son separadores de miles.
 *   `13.500,50` y `13500,50` son los dos 1350050.
 * - Si no hay coma y hay un solo punto con **1 o 2 digitos detras**, ese punto es decimal:
 *   `13500.50` es 1350050. Es lo que sale de teclear en un teclado numerico.
 * - Cualquier otro punto es separador de miles: `13.500` es 1350000, no 1350.
 *
 * Devuelve `null` si no logra leerlo, y quien llama lo convierte en validation_error.
 */
export function parsearPrecioACentavos(entrada: unknown): number | null {
  if (typeof entrada === "number") {
    return Number.isFinite(entrada) ? Math.round(entrada * 100) : null;
  }
  if (typeof entrada !== "string") return null;

  const limpio = entrada.trim().replace(/\s/g, "");
  if (limpio === "") return null;

  let normalizado: string;
  if (limpio.includes(",")) {
    normalizado = limpio.replace(/\./g, "").replace(",", ".");
  } else {
    const decimalConPunto = /^-?\d+\.\d{1,2}$/.test(limpio);
    normalizado = decimalConPunto ? limpio : limpio.replace(/\./g, "");
  }

  if (!/^-?\d+(\.\d{1,2})?$/.test(normalizado)) return null;

  const valor = Number(normalizado);
  if (!Number.isFinite(valor)) return null;

  // `round` y no `trunc`: 13500.555 no deberia perder un centavo por el binario del float.
  return Math.round(valor * 100);
}

const precioSchema = z
  .unknown()
  .transform((valor, ctx) => {
    const centavos = parsearPrecioACentavos(valor);
    if (centavos === null) {
      ctx.addIssue({ code: "custom", message: "Escribí un precio válido, por ejemplo 13500,50." });
      return z.NEVER;
    }
    if (centavos < 0) {
      ctx.addIssue({ code: "custom", message: "El precio no puede ser negativo." });
      return z.NEVER;
    }
    return centavos;
  })
  .pipe(z.number().int());

const crearSchema = z
  .object({
    category_id: z.string().uuid("Elegí una categoría."),
    name: z.string().trim().min(1, "El nombre no puede estar vacío."),
    description: z.string().trim().default(""),
    price: precioSchema,
    pairing_text: z.string().trim().optional(),
  })
  .strict();

/**
 * Comprueba que la categoria sea del restaurante de la sesion.
 *
 * Hace falta explicitamente: la policy de lectura de `categories` tiene rama publica, asi
 * que el owner PUEDE leer la categoria de otro restaurante activo. Sin esto, el insert lo
 * frenaria el `with check` de `dishes` con un 42501 y el usuario veria "no tenés permiso"
 * cuando lo correcto es "esa categoría no existe para vos".
 */
async function categoriaPropia(categoryId: string, ctx: ContextoAdmin): Promise<boolean> {
  const { data } = await ctx.db
    .from("categories")
    .select("restaurant_id")
    .eq("id", categoryId)
    .maybeSingle();

  if (!data) return false;
  if (ctx.sesion.role === "superadmin") return true;
  return data.restaurant_id === ctx.sesion.restaurantId;
}

export async function crearPlato(
  entrada: unknown,
  ctx: ContextoAdmin,
): Promise<ResultadoAccion<{ id: string }>> {
  const restaurantId = ctx.sesion.restaurantId;
  if (restaurantId === null) {
    return falla("forbidden", "Tu usuario no tiene un restaurante asignado.");
  }

  const parseado = crearSchema.safeParse(entrada);
  if (!parseado.success) return fallaDeValidacion(parseado.error);

  if (!(await categoriaPropia(parseado.data.category_id, ctx))) {
    return falla("not_found", "No encontramos esa categoría.");
  }

  const { data: ultimo } = await ctx.db
    .from("dishes")
    .select("sort_order")
    .eq("category_id", parseado.data.category_id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await ctx.db
    .from("dishes")
    .insert({
      restaurant_id: restaurantId,
      category_id: parseado.data.category_id,
      name: parseado.data.name,
      description: parseado.data.description,
      price: parseado.data.price,
      pairing_text: parseado.data.pairing_text ?? null,
      sort_order: (ultimo?.sort_order ?? -1) + 1,
    })
    .select("id")
    .single();

  if (error) return fallaDePostgres(error.code, { forbidden: "No podés crear platos acá." });

  return exito({ id: data.id as string });
}

const porIdSchema = z.object({ id: z.string().uuid() }).strict();

/**
 * Duplica un plato.
 *
 * El duplicado nace **sin video**: `video_status` en `pending` y `video_playback_id` en
 * null. Es lo correcto y ademas es lo seguro — la policy de lectura publica exige `ready`,
 * asi que el duplicado no aparece en la carta hasta que tenga su propio video. Copiar el
 * `video_playback_id` del original haria que dos platos distintos mostraran el mismo
 * video, que es exactamente el error que un dueño apurado no revisa.
 */
export async function duplicarPlato(
  entrada: unknown,
  ctx: ContextoAdmin,
): Promise<ResultadoAccion<{ id: string }>> {
  const parseado = porIdSchema.safeParse(entrada);
  if (!parseado.success) return fallaDeValidacion(parseado.error);

  const { data: original } = await ctx.db
    .from("dishes")
    .select("restaurant_id, category_id, name, description, price, pairing_text, sort_order")
    .eq("id", parseado.data.id)
    .maybeSingle();

  if (!original) return falla("not_found", "No encontramos ese plato.");

  const esPropio = original.restaurant_id === ctx.sesion.restaurantId;
  if (!esPropio && ctx.sesion.role !== "superadmin") {
    return falla("not_found", "No encontramos ese plato.");
  }

  // La copia va al FINAL de la categoria, no justo debajo del original.
  //
  // Lo intuitivo seria `original.sort_order + 1`, y esta mal: ese numero ya es el del
  // plato siguiente. Dos platos con el mismo sort_order hacen que el orden de la carta lo
  // decida el planificador de Postgres, o sea que cambie solo entre cargas. Dejarla al
  // final es predecible y no toca el orden de nada mas; si el dueño la quiere arriba, la
  // sube con los controles.
  const { data: ultimo } = await ctx.db
    .from("dishes")
    .select("sort_order")
    .eq("category_id", original.category_id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await ctx.db
    .from("dishes")
    .insert({
      restaurant_id: original.restaurant_id,
      category_id: original.category_id,
      name: `${original.name} (copia)`,
      description: original.description,
      price: original.price,
      pairing_text: original.pairing_text,
      video_status: "pending",
      video_playback_id: null,
      sort_order: ((ultimo?.sort_order as number | undefined) ?? -1) + 1,
    })
    .select("id")
    .single();

  if (error) return fallaDePostgres(error.code, { forbidden: "No podés duplicar este plato." });

  return exito({ id: data.id as string });
}

/**
 * Baja un plato un lugar dentro de su categoria.
 *
 * Mismas dos precauciones que en categorias: se compara el dueño antes de tocar nada, y
 * los updates piden la fila de vuelta — un update filtrado por RLS vuelve sin error y con
 * cero filas, y sin `.select()` no habria forma de distinguirlo de uno que hizo el trabajo.
 */
export async function bajarPlato(
  entrada: unknown,
  ctx: ContextoAdmin,
): Promise<ResultadoAccion<{ movido: boolean }>> {
  const parseado = porIdSchema.safeParse(entrada);
  if (!parseado.success) return fallaDeValidacion(parseado.error);

  const { data: actual } = await ctx.db
    .from("dishes")
    .select("id, restaurant_id, category_id, sort_order")
    .eq("id", parseado.data.id)
    .maybeSingle();

  if (!actual) return falla("not_found", "No encontramos ese plato.");

  const esPropio = actual.restaurant_id === ctx.sesion.restaurantId;
  if (!esPropio && ctx.sesion.role !== "superadmin") {
    return falla("not_found", "No encontramos ese plato.");
  }

  const { data: siguiente } = await ctx.db
    .from("dishes")
    .select("id, sort_order")
    // Dentro de la MISMA categoria: mezclar categorias al reordenar dejaria un orden que
    // no se corresponde con lo que se ve en la carta.
    .eq("category_id", actual.category_id)
    .gt("sort_order", actual.sort_order)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!siguiente) return exito({ movido: false });

  const { data: f1, error: e1 } = await ctx.db
    .from("dishes")
    .update({ sort_order: siguiente.sort_order })
    .eq("id", actual.id)
    .select("id");
  if (e1) return fallaDePostgres(e1.code, {});
  if (!f1 || f1.length === 0) return falla("not_found", "No encontramos ese plato.");

  const { data: f2, error: e2 } = await ctx.db
    .from("dishes")
    .update({ sort_order: actual.sort_order })
    .eq("id", siguiente.id)
    .select("id");
  if (e2) return fallaDePostgres(e2.code, {});
  if (!f2 || f2.length === 0) return falla("not_found", "No encontramos ese plato.");

  return exito({ movido: true });
}

export type PlatoDelPanel = {
  id: string;
  name: string;
  price: number;
  category_id: string;
  video_status: string;
  sort_order: number;
};

/** Platos del restaurante de la sesion, ordenados como en la carta. */
export async function listarPlatos(ctx: ContextoAdmin): Promise<PlatoDelPanel[]> {
  const restaurantId = ctx.sesion.restaurantId;
  if (restaurantId === null) return [];

  const { data } = await ctx.db
    .from("dishes")
    .select("id, name, price, category_id, video_status, sort_order")
    .eq("restaurant_id", restaurantId)
    .order("category_id")
    .order("sort_order");

  return (data ?? []) as PlatoDelPanel[];
}
