"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { bajarPlato, crearPlato, duplicarPlato } from "@/server/admin/dishes";
import type { ContextoAdmin } from "@/server/admin/resultado";

/**
 * Transporte de los platos. La logica vive en `src/server/admin/dishes.ts`.
 */

const RUTA = "/admin/platos";

async function contexto(): Promise<ContextoAdmin> {
  const sesion = await requireAdmin(RUTA);
  const db = await createServerSupabase();
  return { db, sesion };
}

function volverConError(mensaje: string): never {
  redirect(`${RUTA}?error=${encodeURIComponent(mensaje)}`);
}

export async function accionCrearPlato(formData: FormData): Promise<void> {
  const ctx = await contexto();

  const resultado = await crearPlato(
    {
      category_id: formData.get("category_id"),
      name: formData.get("name"),
      description: formData.get("description") ?? "",
      // Llega como lo escribio una persona: "13500,50". Lo traduce a centavos el esquema.
      price: formData.get("price"),
    },
    ctx,
  );

  if (!resultado.ok) {
    const detalle = resultado.error.details?.[0]?.message;
    volverConError(detalle ?? resultado.error.message);
  }

  revalidatePath(RUTA);
  redirect(`${RUTA}?creado=1`);
}

export async function accionDuplicarPlato(formData: FormData): Promise<void> {
  const ctx = await contexto();

  const resultado = await duplicarPlato({ id: formData.get("id") }, ctx);
  if (!resultado.ok) volverConError(resultado.error.message);

  revalidatePath(RUTA);
  redirect(`${RUTA}?duplicado=1`);
}

export async function accionBajarPlato(formData: FormData): Promise<void> {
  const ctx = await contexto();

  const resultado = await bajarPlato({ id: formData.get("id") }, ctx);
  if (!resultado.ok) volverConError(resultado.error.message);

  revalidatePath(RUTA);
  redirect(RUTA);
}
