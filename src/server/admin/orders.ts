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
 * Pedidos del panel: el owner controla la cola general y la vista operativa de cocina.
 *
 * Cada operacion de aca es UNA transicion de la maquina de estados. El trigger
 * `orders_validar_transicion` decide si la transicion es legal y RLS asegura que la tanda
 * pertenezca al restaurante del owner.
 */

export type EstadoDePedido =
  | "pendiente"
  | "cocina"
  | "listo"
  | "entregado"
  | "rechazado"
  | "cancelado";

export type ItemDePedido = {
  nombre: string;
  cantidad: number;
  /** Centavos, congelado al momento del pedido. */
  precio: number;
};

export type TandaDelPanel = {
  id: string;
  sequence: number;
  status: EstadoDePedido;
  motivoRechazo: string | null;
  creadoEn: string;
  items: ItemDePedido[];
  /** Centavos. */
  subtotal: number;
};

export type MesaConPedidos = {
  sessionId: string;
  mesa: string;
  abiertaEn: string;
  tandas: TandaDelPanel[];
  /** Centavos, sin contar lo rechazado ni lo cancelado. */
  total: number;
};

/** Una tanda como la ve la cocina: **sin un solo numero de dinero**. */
export type TandaDeCocina = {
  id: string;
  mesa: string;
  sequence: number;
  status: "cocina" | "listo";
  creadoEn: string;
  items: { nombre: string; cantidad: number }[];
};

const NO_SUMAN: EstadoDePedido[] = ["rechazado", "cancelado"];

/** Todas las operaciones requieren un restaurante provisionado para el owner. */
function requiereRestaurante<T>(ctx: ContextoAdmin): ResultadoAccion<T> | null {
  if (ctx.sesion.restaurantId === null) {
    return falla<T>("forbidden", "Tu usuario no tiene un restaurante asignado.");
  }
  return null;
}

const porIdSchema = z.object({ id: z.string().uuid() }).strict();

const rechazoSchema = z
  .object({
    id: z.string().uuid(),
    motivo: z
      .string()
      .trim()
      .min(1, "Decile al comensal por qué no se puede.")
      .max(140, "El motivo tiene que ser corto."),
  })
  .strict();

/**
 * Mueve una tanda de estado y devuelve un error util si RLS o el trigger la frenaron.
 *
 * El `.select()` no es decorativo: un UPDATE que RLS filtra vuelve SIN error y con cero
 * filas, y sin pedir la fila de vuelta no habria como distinguirlo de uno que funciono.
 */
async function moverTanda(
  ctx: ContextoAdmin,
  id: string,
  cambios: Record<string, unknown>,
  desde: EstadoDePedido[],
): Promise<ResultadoAccion<{ id: string }>> {
  const { data, error } = await ctx.db
    .from("orders")
    .update(cambios)
    .eq("id", id)
    // El filtro por estado de origen no reemplaza al trigger: lo acompaña. Sirve para que
    // dos personas apretando el mismo boton a la vez no produzcan un error feo — la
    // segunda simplemente no matchea ninguna fila.
    .in("status", desde)
    .select("id");

  if (error) {
    // 23514 = check_violation, que es lo que levanta el trigger ante una transicion ilegal.
    if (error.code === "23514") {
      return falla("conflict", "Ese pedido ya cambió de estado. Actualizá la pantalla.");
    }
    return fallaDePostgres(error.code, {});
  }

  if (!data || data.length === 0) {
    return falla("not_found", "Ese pedido ya no está en ese estado.");
  }

  return exito({ id });
}

/** `pendiente → cocina`. Es el "aceptado" que el comensal ve. */
export async function confirmarPedido(
  entrada: unknown,
  ctx: ContextoAdmin,
): Promise<ResultadoAccion<{ id: string }>> {
  const denegado = requiereRestaurante<{ id: string }>(ctx);
  if (denegado) return denegado;

  const parseado = porIdSchema.safeParse(entrada);
  if (!parseado.success) return fallaDeValidacion(parseado.error);

  return moverTanda(ctx, parseado.data.id, { status: "cocina" }, ["pendiente"]);
}

/** `pendiente → rechazado`, con una nota corta que el comensal lee. */
export async function rechazarPedido(
  entrada: unknown,
  ctx: ContextoAdmin,
): Promise<ResultadoAccion<{ id: string }>> {
  const denegado = requiereRestaurante<{ id: string }>(ctx);
  if (denegado) return denegado;

  const parseado = rechazoSchema.safeParse(entrada);
  if (!parseado.success) return fallaDeValidacion(parseado.error);

  return moverTanda(
    ctx,
    parseado.data.id,
    { status: "rechazado", rejected_reason: parseado.data.motivo },
    ["pendiente"],
  );
}

/** `cocina → listo`. */
export async function marcarListo(
  entrada: unknown,
  ctx: ContextoAdmin,
): Promise<ResultadoAccion<{ id: string }>> {
  const denegado = requiereRestaurante<{ id: string }>(ctx);
  if (denegado) return denegado;

  const parseado = porIdSchema.safeParse(entrada);
  if (!parseado.success) return fallaDeValidacion(parseado.error);

  return moverTanda(ctx, parseado.data.id, { status: "listo" }, ["cocina"]);
}

/** `listo → entregado`. */
export async function marcarEntregado(
  entrada: unknown,
  ctx: ContextoAdmin,
): Promise<ResultadoAccion<{ id: string }>> {
  const denegado = requiereRestaurante<{ id: string }>(ctx);
  if (denegado) return denegado;

  const parseado = porIdSchema.safeParse(entrada);
  if (!parseado.success) return fallaDeValidacion(parseado.error);

  return moverTanda(ctx, parseado.data.id, { status: "entregado" }, ["listo"]);
}

/**
 * Cancela una tanda antes de entregarla. El comensal no puede cancelar.
 *
 * Un comensal que pudiera cancelar despues de que la cocina prendio la parrilla cancela
 * comida ya hecha, y eso lo paga el restaurante.
 */
export async function cancelarPedido(
  entrada: unknown,
  ctx: ContextoAdmin,
): Promise<ResultadoAccion<{ id: string }>> {
  const denegado = requiereRestaurante<{ id: string }>(ctx);
  if (denegado) return denegado;

  const parseado = porIdSchema.safeParse(entrada);
  if (!parseado.success) return fallaDeValidacion(parseado.error);

  return moverTanda(ctx, parseado.data.id, { status: "cancelado" }, [
    "pendiente",
    "cocina",
    "listo",
  ]);
}

/**
 * Cierra la mesa. Es el boton mas chico de la pantalla y el que sostiene el sistema.
 *
 * Sin esto, la sesion de una mesa nunca termina: el comensal que se sienta mañana hereda la
 * cuenta de anoche y su primer pedido sale como tanda 7. No se rompe al primer dia — se
 * rompe al segundo, que es peor, porque para entonces ya nadie mira.
 */
export async function cerrarSesionDeMesa(
  entrada: unknown,
  ctx: ContextoAdmin,
): Promise<ResultadoAccion<{ id: string }>> {
  const denegado = requiereRestaurante<{ id: string }>(ctx);
  if (denegado) return denegado;

  const parseado = porIdSchema.safeParse(entrada);
  if (!parseado.success) return fallaDeValidacion(parseado.error);

  const { data, error } = await ctx.db
    .from("table_sessions")
    .update({ closed_at: new Date().toISOString(), closed_by: ctx.sesion.userId })
    .eq("id", parseado.data.id)
    .is("closed_at", null)
    .select("id");

  if (error) return fallaDePostgres(error.code, {});
  if (!data || data.length === 0) {
    return falla("not_found", "Esa mesa ya estaba cerrada.");
  }

  return exito({ id: parseado.data.id });
}

type FilaItem = { name_snapshot: string; quantity: number; price_snapshot: number };
type FilaTanda = {
  id: string;
  sequence: number;
  status: EstadoDePedido;
  rejected_reason: string | null;
  created_at: string;
  order_items: FilaItem[] | null;
};
type FilaSesion = {
  id: string;
  opened_at: string;
  restaurant_tables: { label: string } | null;
  orders: FilaTanda[] | null;
};

/**
 * Las mesas con sesion abierta y todo lo que pidieron.
 *
 * Una sola consulta con embeds: PostgREST resuelve los tres niveles en un viaje. Traerlos
 * en tres consultas seria triplicar la latencia de una pantalla que se refresca sola.
 */
export async function listarPedidos(ctx: ContextoAdmin): Promise<MesaConPedidos[]> {
  if (requiereRestaurante(ctx) !== null) return [];

  const { data } = await ctx.db
    .from("table_sessions")
    .select(
      "id, opened_at, restaurant_tables(label), orders(id, sequence, status, rejected_reason, created_at, order_items(name_snapshot, quantity, price_snapshot))",
    )
    .eq("restaurant_id", ctx.sesion.restaurantId)
    .is("closed_at", null)
    .order("opened_at");

  return ((data ?? []) as unknown as FilaSesion[]).map((sesion) => {
    const tandas: TandaDelPanel[] = (sesion.orders ?? [])
      .map((tanda) => {
        const items = (tanda.order_items ?? []).map((item) => ({
          nombre: item.name_snapshot,
          cantidad: item.quantity,
          precio: item.price_snapshot,
        }));

        return {
          id: tanda.id,
          sequence: tanda.sequence,
          status: tanda.status,
          motivoRechazo: tanda.rejected_reason,
          creadoEn: tanda.created_at,
          items,
          subtotal: items.reduce((suma, item) => suma + item.precio * item.cantidad, 0),
        };
      })
      .sort((a, b) => a.sequence - b.sequence);

    return {
      sessionId: sesion.id,
      mesa: sesion.restaurant_tables?.label ?? "Mesa",
      abiertaEn: sesion.opened_at,
      tandas,
      // Lo rechazado y lo cancelado no suman: cobrarle a alguien un plato que la cocina
      // rechazo es la clase de error que termina en una discusion en la mesa.
      total: tandas
        .filter((t) => !NO_SUMAN.includes(t.status))
        .reduce((suma, t) => suma + t.subtotal, 0),
    };
  });
}

type FilaCocina = {
  order_id: string;
  table_label: string;
  sequence: number;
  status: "cocina" | "listo";
  created_at: string;
  items: { name: string; quantity: number }[] | null;
};

/**
 * La cola de la cocina, por el RPC `kitchen_queue`.
 *
 * El RPC devuelve solo los datos que necesita la vista operativa y omite precios.
 */
export async function colaDeCocina(ctx: ContextoAdmin): Promise<TandaDeCocina[]> {
  if (requiereRestaurante(ctx) !== null) return [];

  const { data } = await ctx.db.rpc("kitchen_queue");

  return ((data ?? []) as FilaCocina[]).map((fila) => ({
    id: fila.order_id,
    mesa: fila.table_label,
    sequence: fila.sequence,
    status: fila.status,
    creadoEn: fila.created_at,
    items: (fila.items ?? []).map((item) => ({ nombre: item.name, cantidad: item.quantity })),
  }));
}
