"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServerSupabase } from "@/lib/supabase/server";
import type { ContextoAdmin } from "@/server/admin/resultado";
import { cambiarActivacionMesa, crearMesa, renombrarMesa } from "@/server/admin/tables";

/**
 * Transporte de las mesas. La logica vive en `src/server/admin/tables.ts`.
 *
 * `requireAdmin()` en cada una, y adentro de cada operacion el chequeo de `owner`: una
 * Server Action es un POST a su propia ruta y no vuelve a pasar por el layout del panel.
 */

const RUTA = "/admin/mesas";

async function contexto(): Promise<ContextoAdmin> {
  const sesion = await requireAdmin(RUTA);
  const db = await createServerSupabase();
  return { db, sesion };
}

function volverConError(mensaje: string): never {
  redirect(`${RUTA}?error=${encodeURIComponent(mensaje)}`);
}

export async function accionCrearMesa(formData: FormData): Promise<void> {
  const ctx = await contexto();

  // `restaurant_id` NO se lee del formulario: sale de la sesion, adentro de crearMesa. El
  // `token` tampoco — lo pone el default de la columna, que es el CSPRNG de Postgres.
  const resultado = await crearMesa({ label: formData.get("label") }, ctx);

  if (!resultado.ok) volverConError(resultado.error.message);

  revalidatePath(RUTA);
  redirect(`${RUTA}?creada=1`);
}

export async function accionRenombrarMesa(formData: FormData): Promise<void> {
  const ctx = await contexto();

  const resultado = await renombrarMesa(
    { id: formData.get("id"), label: formData.get("label") },
    ctx,
  );

  if (!resultado.ok) volverConError(resultado.error.message);

  revalidatePath(RUTA);
  redirect(`${RUTA}?renombrada=1`);
}

export async function accionCambiarActivacionMesa(formData: FormData): Promise<void> {
  const ctx = await contexto();

  const resultado = await cambiarActivacionMesa(
    { id: formData.get("id"), activa: formData.get("activa") },
    ctx,
  );

  if (!resultado.ok) volverConError(resultado.error.message);

  revalidatePath(RUTA);
  redirect(RUTA);
}
