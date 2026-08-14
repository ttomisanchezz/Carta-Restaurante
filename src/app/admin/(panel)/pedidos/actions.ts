"use server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  cancelarPedido,
  cerrarSesionDeMesa,
  confirmarPedido,
  listarPedidos,
  type MesaConPedidos,
  marcarEntregado,
  rechazarPedido,
} from "@/server/admin/orders";
import type { ContextoAdmin, ResultadoAccion } from "@/server/admin/resultado";

/**
 * Transporte de la cola de pedidos. La logica vive en `src/server/admin/orders.ts`.
 *
 * `requireAdmin()` en cada una, sin excepcion: una Server Action es un POST a su propia
 * ruta y no vuelve a pasar por el layout del panel. El chequeo de rol lo hace despues cada
 * operacion, adentro.
 *
 * ## Por que devuelven datos en vez de redirigir
 *
 * El resto del panel usa `<form action>` + `redirect()`, que recarga la pantalla. Acá no
 * sirve: esta es una cola en vivo que se refresca sola, y una recarga completa por cada
 * "confirmar" perderia el scroll justo cuando hay ocho mesas esperando. Estas acciones
 * devuelven el resultado y la pantalla se actualiza sin navegar.
 */

const RUTA = "/admin/pedidos";

async function contexto(): Promise<ContextoAdmin> {
  const sesion = await requireAdmin(RUTA);
  const db = await createServerSupabase();
  return { db, sesion };
}

/** La cola completa. La llama el polling de la pantalla. */
export async function accionListarPedidos(): Promise<MesaConPedidos[]> {
  return listarPedidos(await contexto());
}

export async function accionConfirmar(id: string): Promise<ResultadoAccion<{ id: string }>> {
  return confirmarPedido({ id }, await contexto());
}

export async function accionRechazar(
  id: string,
  motivo: string,
): Promise<ResultadoAccion<{ id: string }>> {
  return rechazarPedido({ id, motivo }, await contexto());
}

export async function accionEntregar(id: string): Promise<ResultadoAccion<{ id: string }>> {
  return marcarEntregado({ id }, await contexto());
}

export async function accionCancelar(id: string): Promise<ResultadoAccion<{ id: string }>> {
  return cancelarPedido({ id }, await contexto());
}

export async function accionCerrarMesa(id: string): Promise<ResultadoAccion<{ id: string }>> {
  return cerrarSesionDeMesa({ id }, await contexto());
}
