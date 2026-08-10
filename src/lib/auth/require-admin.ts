import { redirect } from "next/navigation";
import { createServerSupabase } from "../supabase/server.ts";

/**
 * El unico guard del panel.
 *
 * Se llama en el layout del panel y **tambien dentro de cada Server Action**. No es
 * redundancia: una Server Action es un POST a su propia ruta y no vuelve a pasar por el
 * layout, asi que sin esta llamada quedaria expuesta a cualquiera que sepa invocarla.
 */

export type SesionAdmin = {
  userId: string;
  /** `null` para un superadmin: no pertenece a ningun restaurante, los ve todos. */
  restaurantId: string | null;
  role: "owner" | "staff" | "superadmin";
};

type FilaPerfil = {
  id: string;
  restaurant_id: string | null;
  role: SesionAdmin["role"];
};

/**
 * La misma comprobacion, pero para un route handler: devuelve `null` en vez de redirigir.
 *
 * Un `redirect()` dentro de una API es una respuesta 307 hacia HTML, que a un cliente que
 * espera JSON lo deja adivinando. Acá el que llama traduce el `null` a un 401 con su
 * codigo.
 *
 * Hace falta ademas porque `/api` esta fuera del `matcher` del proxy: estas rutas se
 * autorizan solas, sin red debajo.
 */
export async function requireAdminApi(): Promise<SesionAdmin | null> {
  const supabase = await createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: perfil } = await supabase
    .from("profiles")
    .select("id, restaurant_id, role")
    .eq("id", user.id)
    .maybeSingle<FilaPerfil>();

  if (!perfil) return null;

  return { userId: perfil.id, restaurantId: perfil.restaurant_id, role: perfil.role };
}

export async function requireAdmin(rutaActual = "/admin/platos"): Promise<SesionAdmin> {
  const supabase = await createServerSupabase();

  // `getUser()` valida el JWT contra Supabase. `getSession()` solo lee la cookie y le
  // cree: alcanza para pintar un nombre, no para decidir un permiso.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/admin/login?next=${encodeURIComponent(rutaActual)}`);
  }

  const { data: perfil } = await supabase
    .from("profiles")
    .select("id, restaurant_id, role")
    .eq("id", user.id)
    .maybeSingle<FilaPerfil>();

  if (!perfil) {
    // El cierre de sesion real lo hace `proxy.ts`, que si puede borrar cookies. Aca solo
    // se corta el render: un layout es un Server Component y no puede escribir cookies.
    redirect("/admin/login?error=sin-perfil");
  }

  return {
    userId: perfil.id,
    restaurantId: perfil.restaurant_id,
    role: perfil.role,
  };
}
