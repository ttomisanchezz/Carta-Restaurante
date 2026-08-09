"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Entrar y salir del panel.
 *
 * Estas dos NO devuelven `{ ok, error }` como el resto de las Server Actions del
 * proyecto, y es deliberado: no reportan el resultado de una escritura, **navegan**. El
 * error vuelve como un codigo en la query del login, que se traduce a texto en un solo
 * lugar. La ventaja concreta es que el login entero funciona sin una linea de JavaScript
 * en el navegador: es un `<form>` y un redirect.
 */

const RUTA_LOGIN = "/admin/login";
const DESTINO_POR_DEFECTO = "/admin/platos";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * `next` llega del navegador, asi que se trata como hostil.
 *
 * Solo se acepta una ruta interna. Sin este filtro, `?next=https://otro-sitio` convierte
 * al login en un redirector abierto: el atacante manda un link a TU dominio, la victima
 * se loguea de verdad, y termina en la pagina de el. `//evil.com` tambien se rechaza:
 * el navegador lo lee como URL protocol-relative.
 */
function destinoSeguro(next: unknown): string {
  if (typeof next !== "string" || next === "") return DESTINO_POR_DEFECTO;
  if (!next.startsWith("/") || next.startsWith("//")) return DESTINO_POR_DEFECTO;
  return next;
}

function volverAlLogin(motivo: string, destino: string): never {
  redirect(`${RUTA_LOGIN}?error=${motivo}&next=${encodeURIComponent(destino)}`);
}

export async function iniciarSesion(formData: FormData): Promise<void> {
  const destino = destinoSeguro(formData.get("next"));

  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  // Un email con formato invalido y una contrasena equivocada dan EL MISMO error, a
  // proposito. Distinguirlos le confirma a quien prueba cuales direcciones existen.
  if (!parsed.success) volverAlLogin("credenciales", destino);

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) volverAlLogin("credenciales", destino);

  redirect(destino);
}

export async function cerrarSesion(): Promise<void> {
  const supabase = await createServerSupabase();
  // Una Server Action si puede escribir cookies, asi que el signOut de aca borra la
  // sesion de verdad. Desde un Server Component no se podria.
  await supabase.auth.signOut();
  redirect(RUTA_LOGIN);
}
