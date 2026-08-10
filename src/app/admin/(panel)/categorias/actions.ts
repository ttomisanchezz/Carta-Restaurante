"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { borrarCategoria, crearCategoria, subirCategoria } from "@/server/admin/categories";
import type { ContextoAdmin } from "@/server/admin/resultado";

/**
 * Transporte de las categorias. La logica vive en `src/server/admin/categories.ts`.
 *
 * `requireAdmin()` en cada una: una Server Action es un POST a su propia ruta y no vuelve
 * a pasar por el layout del panel.
 */

const RUTA = "/admin/categorias";

async function contexto(): Promise<ContextoAdmin> {
  const sesion = await requireAdmin(RUTA);
  const db = await createServerSupabase();
  return { db, sesion };
}

/** Un `message` que puede tener cualquier caracter va a la query codificado. */
function volverConError(mensaje: string): never {
  redirect(`${RUTA}?error=${encodeURIComponent(mensaje)}`);
}

export async function accionCrearCategoria(formData: FormData): Promise<void> {
  const ctx = await contexto();

  // `restaurant_id` NO se lee del formulario: sale de la sesion, adentro de crearCategoria.
  const resultado = await crearCategoria({ name: formData.get("name") }, ctx);

  if (!resultado.ok) volverConError(resultado.error.message);

  revalidatePath(RUTA);
  redirect(`${RUTA}?creada=1`);
}

export async function accionBorrarCategoria(formData: FormData): Promise<void> {
  const ctx = await contexto();

  const resultado = await borrarCategoria({ id: formData.get("id") }, ctx);

  if (!resultado.ok) volverConError(resultado.error.message);

  revalidatePath(RUTA);
  redirect(`${RUTA}?borrada=1`);
}

export async function accionSubirCategoria(formData: FormData): Promise<void> {
  const ctx = await contexto();

  const resultado = await subirCategoria({ id: formData.get("id") }, ctx);

  if (!resultado.ok) volverConError(resultado.error.message);

  revalidatePath(RUTA);
  redirect(RUTA);
}
