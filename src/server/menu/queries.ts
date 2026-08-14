import { cache } from "react";
import { z } from "zod";
import { createAnonSupabase } from "@/lib/supabase/server";

/**
 * Lecturas de la carta publica.
 *
 * Todo pasa por el cliente ANONIMO: **las policies de RLS son el filtro**, no un `where`
 * que alguien puede olvidarse de escribir. Si esta capa usara la clave de servicio, un
 * bug de un parametro expondria la carta de otro restaurante y ninguna policy lo frenaria.
 */

export type PlatoDeCarta = {
  id: string;
  category_id: string;
  name: string;
  description: string;
  price: number;
  /** `null` significa "no sabemos". La vista no dibuja nada en ese caso. */
  calories: number | null;
  pairing_text: string | null;
  thumbnail_url: string | null;
  video_playback_id: string | null;
};

export type CategoriaDeCarta = {
  id: string;
  name: string;
  sort_order: number;
};

export type RestauranteDeCarta = {
  id: string;
  slug: string;
  name: string;
  primary_color: string;
  currency: string;
};

export type Carta = {
  restaurante: RestauranteDeCarta;
  categorias: CategoriaDeCarta[];
  platos: PlatoDeCarta[];
};

const CAMPOS_PLATO =
  "id, category_id, name, description, price, calories, pairing_text, thumbnail_url, video_playback_id";

/**
 * La carta de un restaurante, o `null` si no hay nada que mostrar.
 *
 * `null` significa las dos cosas a la vez —no existe, o esta dado de baja— y es
 * deliberado: quien pregunta no tiene por que poder distinguirlas. La ruta lo convierte
 * en un 404 en los dos casos.
 *
 * El filtro `is_active` va explicito aunque la policy ya lo aplique para un anonimo. La
 * policy tiene una rama que deja al dueno ver su propio restaurante apagado, y esta
 * pantalla es la carta publica: apagado es apagado para todos, tambien para el dueno.
 */
export const getMenuBySlug = cache(async (slug: string): Promise<Carta | null> => {
  const db = createAnonSupabase();

  const { data: restaurante, error } = await db
    .from("restaurants")
    .select("id, slug, name, primary_color, currency")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle<RestauranteDeCarta>();

  // Un fallo de la base NO es "no existe". Devolver `null` acá mostraria un 404 cuando
  // Postgres esta caido: el comensal leeria "no encontramos esta carta" y el restaurante
  // pensaria que le borramos el local. Se lanza, y lo atiende la frontera de error, que
  // dice la verdad y ofrece reintentar.
  if (error) {
    throw new Error(`No se pudo leer la carta de "${slug}": ${error.message}`);
  }

  if (!restaurante) return null;

  // En paralelo, no en secuencia: son independientes entre si y encadenarlas duplica la
  // latencia de la unica pantalla que ve un comensal con hambre y datos moviles.
  const [categorias, platos] = await Promise.all([
    db
      .from("categories")
      .select("id, name, sort_order")
      .eq("restaurant_id", restaurante.id)
      .order("sort_order"),
    // `video_status` e `is_available` los filtra la policy.
    db.from("dishes").select(CAMPOS_PLATO).eq("restaurant_id", restaurante.id).order("sort_order"),
  ]);

  const listaCategorias = (categorias.data ?? []) as CategoriaDeCarta[];

  /**
   * Agrupar por categoria hay que hacerlo ACA, y no alcanza con el `order` de arriba.
   *
   * `sort_order` es relativo a su categoria: cada una empieza en 0. Ordenar solo por esa
   * columna mezcla la carta — salen juntos todos los ceros, o sea la primera entrada al
   * lado del primer postre. Se veia en la demo: "Provoleta a la parrilla" seguida de
   * "Flan mixto".
   *
   * El `sort` de JavaScript es estable desde ES2019, asi que reordenar por categoria
   * conserva el orden por `sort_order` que ya trajo Postgres dentro de cada grupo. Por eso
   * no hace falta pedir `sort_order` en el select ni ordenar por dos claves.
   */
  const posicionDeCategoria = new Map(listaCategorias.map((c, i) => [c.id, i]));
  const listaPlatos = [...((platos.data ?? []) as PlatoDeCarta[])].sort(
    (a, b) =>
      (posicionDeCategoria.get(a.category_id) ?? Number.MAX_SAFE_INTEGER) -
      (posicionDeCategoria.get(b.category_id) ?? Number.MAX_SAFE_INTEGER),
  );

  return {
    restaurante,
    categorias: listaCategorias,
    platos: listaPlatos,
  };
});

export type MesaDeCarta = {
  tableId: string;
  restaurantId: string;
  label: string;
};

/**
 * El token tal como puede venir de la URL: 32 caracteres hex, ni uno mas.
 *
 * Es la forma exacta que produce `encode(gen_random_bytes(16), 'hex')` y la misma que
 * impone el `check` de la columna. Validar acá corta de entrada la basura —un `/mesa/5`,
 * un intento de inyeccion, un token truncado al copiarlo— sin gastar una ida a Postgres.
 * **No es la unica defensa**: abajo esta el RPC, que igual filtra por token exacto.
 */
const tokenSchema = z.string().regex(/^[0-9a-f]{32}$/);

/**
 * La mesa detras de un token, o `null`.
 *
 * Resuelve contra `public.resolve_table`, que es `security definer`: el rol anonimo no
 * tiene —ni puede tener— SELECT sobre `restaurant_tables`. Esa funcion devuelve como mucho
 * una fila y nunca el token de vuelta.
 *
 * `null` significa las cinco cosas a la vez: token mal formado, token inexistente, mesa
 * desactivada, restaurante desactivado, o token que existe pero pertenece a OTRO
 * restaurante. Que sean indistinguibles es el punto — un atacante que pudiera separar
 * "token invalido" de "mesa apagada" tendria un oraculo para descubrir tokens validos.
 */
export const getTableByToken = cache(
  async (slug: string, token: string): Promise<MesaDeCarta | null> => {
    if (!tokenSchema.safeParse(token).success) return null;

    const db = createAnonSupabase();

    const { data, error } = await db
      .rpc("resolve_table", { p_slug: slug, p_token: token })
      .maybeSingle<{ table_id: string; restaurant_id: string; label: string }>();

    // Igual que en `getMenuBySlug`: un fallo de la base NO es "no existe". Devolver `null`
    // acá mostraria un 404 con Postgres caido, y el comensal leeria que su mesa no existe.
    if (error) {
      throw new Error(`No se pudo resolver la mesa de "${slug}": ${error.message}`);
    }

    if (!data) return null;

    return { tableId: data.table_id, restaurantId: data.restaurant_id, label: data.label };
  },
);

export type PlatoConRestaurante = {
  plato: PlatoDeCarta;
  restaurante: RestauranteDeCarta;
};

/**
 * Un plato de la carta de un restaurante, o `null`.
 *
 * Se resuelve BUSCANDO DENTRO de la carta y no con una consulta por id, y eso resuelve
 * tres cosas de una:
 *
 * - Un id de otro restaurante bajo este slug no aparece en esta lista, asi que da 404 sin
 *   necesidad de escribir la comprobacion (y sin poder olvidarsela).
 * - Un plato que no esta `ready` o no esta disponible ya lo filtro la policy de RLS.
 * - No cuesta una consulta extra: `getMenuBySlug` esta memorizada con `cache()`, y la
 *   pagina del plato normalmente ya la resolvio el layout del slug en el mismo pedido.
 */
export const getDishBySlugAndId = cache(
  async (slug: string, dishId: string): Promise<PlatoConRestaurante | null> => {
    const carta = await getMenuBySlug(slug);
    if (!carta) return null;

    const plato = carta.platos.find((p) => p.id === dishId);
    if (!plato) return null;

    return { plato, restaurante: carta.restaurante };
  },
);
