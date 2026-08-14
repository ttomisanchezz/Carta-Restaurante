"use server";

import type { ResultadoAccion } from "@/server/admin/resultado";
import { crearPedido, type EstadoDeSesion, estadoDeSesion } from "@/server/menu/orders";

/**
 * Transporte del pedido del comensal. La logica vive en `src/server/menu/orders.ts`.
 *
 * ## Estas dos Server Actions son publicas, y esta bien
 *
 * No llevan `requireAdmin()` porque no hay sesion que exigir: el comensal es anonimo. **El
 * token de la mesa ES la credencial**, y por eso viaja como argumento y se valida adentro,
 * contra la base, en cada llamada. Una Server Action es un POST a su propia ruta: cualquiera
 * puede invocarla con cualquier token, y lo unico que la sostiene es que un token que no
 * resuelve no hace nada.
 *
 * Todo lo demas —que el plato sea de ese restaurante, que el precio salga del servidor, los
 * topes de cantidad, el limite de frecuencia— vive en `create_order`, adentro de Postgres,
 * en una transaccion. Acá no se decide nada de eso.
 */

export async function accionCrearPedido(
  token: string,
  items: { dishId: string; cantidad: number }[],
): Promise<ResultadoAccion<{ sequence: number; status: string }>> {
  return crearPedido(token, items);
}

export async function accionEstadoDeSesion(token: string): Promise<EstadoDeSesion | null> {
  return estadoDeSesion(token);
}
