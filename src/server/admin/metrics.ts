import type { ContextoAdmin } from "./resultado.ts";

/**
 * Lectura de las metricas de visualizacion para el panel del dueño.
 *
 * No hay escritura acá: el unico camino que escribe eventos es la RPC `record_dish_views`,
 * que llama el navegador del comensal. El panel solo lee.
 *
 * La vista `dish_view_metrics` va con `security_invoker`, asi que esta consulta se resuelve
 * con las policies del usuario de la sesion: el filtro por restaurante es la RLS, y el
 * `.eq()` de abajo es la segunda linea, no la primera.
 */

export type MetricaDePlato = {
  dish_id: string;
  dish_name: string;
  vistas: number;
  completos: number;
  /** `null` cuando todavia no hubo una sola vista: no es un 0%, es que no se sabe. */
  porcentaje_completo: number | null;
};

export async function listarMetricas(ctx: ContextoAdmin): Promise<MetricaDePlato[]> {
  const restaurantId = ctx.sesion.restaurantId;
  if (restaurantId === null) return [];

  const { data } = await ctx.db
    .from("dish_view_metrics")
    .select("dish_id, dish_name, vistas, completos, porcentaje_completo")
    .eq("restaurant_id", restaurantId)
    // Lo mas visto primero: es la pregunta que el dueño trae abierta al entrar.
    .order("vistas", { ascending: false })
    .order("dish_name");

  return (data ?? []) as MetricaDePlato[];
}
