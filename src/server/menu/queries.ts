import { cache } from "react";
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
  "id, category_id, name, description, price, pairing_text, thumbnail_url, video_playback_id";

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

  const { data: restaurante } = await db
    .from("restaurants")
    .select("id, slug, name, primary_color, currency")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle<RestauranteDeCarta>();

  if (!restaurante) return null;

  // En paralelo, no en secuencia: son independientes entre si y encadenarlas duplica la
  // latencia de la unica pantalla que ve un comensal con hambre y datos moviles.
  const [categorias, platos] = await Promise.all([
    db
      .from("categories")
      .select("id, name, sort_order")
      .eq("restaurant_id", restaurante.id)
      .order("sort_order"),
    // `video_status` e `is_available` los filtra la policy. Se ordena por categoria y
    // despues por posicion para que la grilla salga ya agrupada.
    db.from("dishes").select(CAMPOS_PLATO).eq("restaurant_id", restaurante.id).order("sort_order"),
  ]);

  return {
    restaurante,
    categorias: (categorias.data ?? []) as CategoriaDeCarta[],
    platos: (platos.data ?? []) as PlatoDeCarta[],
  };
});

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
