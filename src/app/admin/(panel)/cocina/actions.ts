"use server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { colaDeCocina, marcarListo, type TandaDeCocina } from "@/server/admin/orders";
import type { ContextoAdmin, ResultadoAccion } from "@/server/admin/resultado";

/**
 * Transporte de la cola de cocina. Dos operaciones y ninguna mas: mirar y marcar listo.
 *
 * `requireAdmin()` en cada una: una Server Action es un POST a su propia ruta y no vuelve a
 * pasar por el layout del panel.
 */

const RUTA = "/admin/cocina";

async function contexto(): Promise<ContextoAdmin> {
  const sesion = await requireAdmin(RUTA);
  const db = await createServerSupabase();
  return { db, sesion };
}

export async function accionColaDeCocina(): Promise<TandaDeCocina[]> {
  return colaDeCocina(await contexto());
}

export async function accionMarcarListo(id: string): Promise<ResultadoAccion<{ id: string }>> {
  return marcarListo({ id }, await contexto());
}
