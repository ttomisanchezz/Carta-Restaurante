import { z } from "zod";
import { createAnonSupabase } from "@/lib/supabase/server";
import type { EstadoDePedido } from "../admin/orders.ts";
import { exito, falla, type ResultadoAccion } from "../admin/resultado.ts";

/**
 * Lo que el comensal puede hacer con su pedido: mandarlo y mirar como va.
 *
 * **Las dos cosas pasan por un RPC `security definer` y por ningun otro lado.** El rol
 * anonimo no tiene SELECT ni INSERT sobre `orders`, `order_items` ni `table_sessions`: no
 * es que no los usemos, es que no puede. Si mañana alguien agrega una consulta directa acá,
 * no va a "funcionar mal", no va a funcionar.
 */

export type ItemDeCarrito = { dishId: string; cantidad: number };

export type ItemDeTanda = {
  nombre: string;
  cantidad: number;
  /** Centavos, congelado al momento del pedido. */
  precio: number;
  subtotal: number;
};

export type TandaDelComensal = {
  sequence: number;
  status: EstadoDePedido;
  motivoRechazo: string | null;
  creadoEn: string;
  subtotal: number;
  items: ItemDeTanda[];
};

export type EstadoDeSesion = {
  mesa: string;
  abiertaEn: string;
  /** Centavos, sin contar lo rechazado ni lo cancelado. */
  total: number;
  tandas: TandaDelComensal[];
};

/**
 * El token de mesa tal como puede venir de la URL: 32 hex, ni uno mas.
 *
 * Mismo criterio que en `queries.ts`: corta la basura de entrada sin gastar una ida a
 * Postgres. **No es la unica defensa** — el RPC filtra por token exacto igual.
 */
const tokenSchema = z.string().regex(/^[0-9a-f]{32}$/);

/**
 * El pedido que llega del navegador. Fijate que NO hay precio en este esquema, y no es un
 * olvido: el precio lo calcula la base leyendo `dishes`. Un campo de precio acá, aunque
 * nadie lo leyera, seria una invitacion a que alguien lo lea el año que viene.
 */
const pedidoSchema = z
  .array(
    z
      .object({
        dishId: z.string().uuid(),
        cantidad: z.number().int().min(1).max(20),
      })
      .strict(),
  )
  .min(1, "Agregá algo antes de pedir.")
  .max(30, "Demasiados renglones en un pedido.");

/**
 * Traduce los codigos de error propios del RPC a los del sobre de resultado.
 *
 * Se ramifica por CODIGO y nunca por el texto: el mensaje de Postgres cambia entre
 * versiones y no es contrato. Los codigos `CT***` los define la migracion de esta fase.
 */
function traducirErrorDePedido(
  codigo: string | undefined,
  mensaje: string,
): ResultadoAccion<never> {
  switch (codigo) {
    case "CT001":
      return falla("not_found", "Esta mesa ya no está disponible. Pedile la carta al mozo.");
    case "CT002":
      return falla("validation_error", "Revisá las cantidades del pedido.");
    case "CT003":
      return falla("conflict", "Alguno de los platos ya no está disponible. Actualizá la carta.");
    case "CT004":
      return falla("conflict", mensaje || "Esperá unos segundos antes de mandar otro pedido.");
    default:
      return falla("internal_error", "No pudimos mandar tu pedido. Probá de nuevo.");
  }
}

export type PedidoCreado = { sequence: number; status: EstadoDePedido };

/**
 * Manda una tanda desde la mesa.
 *
 * Todo el trabajo pesado —resolver la mesa, abrir o reusar la sesion, numerar la tanda,
 * calcular el precio del lado del servidor, aplicar los topes y el limite de frecuencia—
 * pasa adentro de `create_order`, en una sola transaccion. Si algo falla, no queda una
 * sesion abierta a medias ni una tanda sin items.
 */
export async function crearPedido(
  tableToken: string,
  items: unknown,
): Promise<ResultadoAccion<PedidoCreado>> {
  if (!tokenSchema.safeParse(tableToken).success) {
    return falla("not_found", "Esta mesa ya no está disponible.");
  }

  const parseado = pedidoSchema.safeParse(items);
  if (!parseado.success) {
    return falla("validation_error", "Revisá tu pedido antes de mandarlo.");
  }

  const db = createAnonSupabase();

  const { data, error } = await db.rpc("create_order", {
    p_table_token: tableToken,
    // Al RPC solo le viaja QUE plato y CUANTOS. El precio no se manda porque no se usa.
    p_items: parseado.data.map((item) => ({ dish_id: item.dishId, quantity: item.cantidad })),
  });

  if (error) return traducirErrorDePedido(error.code, error.message);

  const respuesta = data as { sequence: number; status: EstadoDePedido } | null;
  if (!respuesta) return falla("internal_error", "No pudimos mandar tu pedido. Probá de nuevo.");

  return exito({ sequence: respuesta.sequence, status: respuesta.status });
}

type RespuestaEstado = {
  table_label: string;
  opened_at: string;
  total: number;
  orders: {
    sequence: number;
    status: EstadoDePedido;
    rejected_reason: string | null;
    created_at: string;
    subtotal: number;
    items: { name: string; quantity: number; price: number; subtotal: number }[];
  }[];
};

/**
 * Como va la cuenta de esta mesa, o `null` si no hay sesion abierta.
 *
 * `null` es el estado normal de una mesa recien sentada, no un error: la carta arranca
 * limpia. Es tambien lo que devuelve un token invalido, y que no se distingan es
 * deliberado.
 *
 * Lo llama el polling del comensal cada pocos segundos. **No esta memorizado con `cache()`
 * a proposito**: `cache()` dura lo que dura un request, y acá cada pedido HTTP tiene que
 * traer el estado de verdad — memorizarlo entre renders no serviria y confundiria.
 */
export async function estadoDeSesion(tableToken: string): Promise<EstadoDeSesion | null> {
  if (!tokenSchema.safeParse(tableToken).success) return null;

  const db = createAnonSupabase();

  const { data, error } = await db.rpc("get_session_status", { p_table_token: tableToken });

  // Un fallo de la base NO es "no hay sesion". Devolver `null` acá le mostraria al comensal
  // una cuenta vacia con Postgres caido, y volveria a pedir todo lo que ya habia pedido.
  if (error) {
    throw new Error(`No se pudo leer el estado de la mesa: ${error.message}`);
  }

  const respuesta = data as RespuestaEstado | null;
  if (!respuesta) return null;

  return {
    mesa: respuesta.table_label,
    abiertaEn: respuesta.opened_at,
    total: respuesta.total,
    tandas: (respuesta.orders ?? []).map((tanda) => ({
      sequence: tanda.sequence,
      status: tanda.status,
      motivoRechazo: tanda.rejected_reason,
      creadoEn: tanda.created_at,
      subtotal: tanda.subtotal,
      items: (tanda.items ?? []).map((item) => ({
        nombre: item.name,
        cantidad: item.quantity,
        precio: item.price,
        subtotal: item.subtotal,
      })),
    })),
  };
}
