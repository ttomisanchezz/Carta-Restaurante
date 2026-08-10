"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { cambiarEstadoRestaurante, crearRestaurante } from "@/server/admin/restaurants";
import type { ContextoAdmin } from "@/server/admin/resultado";

/**
 * Las Server Actions del alta de restaurantes.
 *
 * Son la capa de transporte y nada mas: arman el contexto, llaman a `src/server/admin/` y
 * traducen el resultado a una navegacion. **La logica no vive acá**, y esa separacion es
 * lo que permite probarla en `tests/integration/admin-restaurants.test.ts` sin un request
 * de Next de por medio.
 *
 * `requireAdmin()` se llama en CADA una. Una Server Action es un POST a su propia ruta:
 * no vuelve a pasar por el layout del panel, asi que sin esta llamada quedarian abiertas a
 * cualquiera que sepa invocarlas.
 */

const RUTA = "/admin/restaurantes";

async function contexto(): Promise<ContextoAdmin> {
  const sesion = await requireAdmin(RUTA);
  const db = await createServerSupabase();
  return { db, sesion };
}

export async function accionCrearRestaurante(formData: FormData): Promise<void> {
  const ctx = await contexto();

  const entrada: Record<string, unknown> = {
    slug: formData.get("slug"),
    name: formData.get("name"),
  };
  // Los opcionales solo viajan si el formulario los mando con algo adentro: el esquema
  // tiene defaults, y una cadena vacia no pasaria el regex.
  for (const campo of ["primary_color", "currency", "plan"] as const) {
    const valor = formData.get(campo);
    if (typeof valor === "string" && valor !== "") entrada[campo] = valor;
  }

  const resultado = await crearRestaurante(entrada, ctx);

  if (!resultado.ok) {
    const campos = resultado.error.details?.map((d) => d.field).join(",") ?? "";
    redirect(`${RUTA}?error=${resultado.error.code}&campos=${encodeURIComponent(campos)}`);
  }

  revalidatePath(RUTA);
  redirect(`${RUTA}?creado=1`);
}

export async function accionCambiarEstado(formData: FormData): Promise<void> {
  const ctx = await contexto();

  const resultado = await cambiarEstadoRestaurante(
    { id: formData.get("id"), is_active: formData.get("is_active") === "true" },
    ctx,
  );

  if (!resultado.ok) redirect(`${RUTA}?error=${resultado.error.code}`);

  revalidatePath(RUTA);
  // Y la carta publica de ESE slug. Sin esto la baja tardaria hasta 60 segundos en verse,
  // que es el `revalidate` de la ruta publica.
  revalidatePath(`/${resultado.data.slug}`);
  redirect(`${RUTA}?estado=1`);
}
