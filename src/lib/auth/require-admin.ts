import { redirect } from "next/navigation";
import { createServerSupabase } from "../supabase/server.ts";

/**
 * El unico guard del panel.
 *
 * Se llama en el layout del panel y **tambien dentro de cada Server Action**. No es
 * redundancia: una Server Action es un POST a su propia ruta y no vuelve a pasar por el
 * layout, asi que sin esta llamada quedaria expuesta a cualquiera que sepa invocarla.
 */

/** El panel tiene un unico rol; los estados del pedido no son roles de usuario. */
export type RolDeUsuario = "owner";

export type SesionAdmin = {
  userId: string;
  /** Puede ser null durante una provision incompleta; las operaciones lo rechazan. */
  restaurantId: string | null;
  role: RolDeUsuario;
};

export type SesionPanel = SesionAdmin & {
  lastSignInAt: string | null;
  previousSignInAt: string | null;
};

type FilaPerfil = {
  id: string;
  restaurant_id: string | null;
  role: SesionAdmin["role"];
  previous_sign_in_at: string | null;
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
    .select("id, restaurant_id, role, previous_sign_in_at")
    .eq("id", user.id)
    .maybeSingle<FilaPerfil>();

  if (!perfil) return null;

  return { userId: perfil.id, restaurantId: perfil.restaurant_id, role: perfil.role };
}

export async function requireAdmin(rutaActual = "/admin/platos"): Promise<SesionPanel> {
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
    .select("id, restaurant_id, role, previous_sign_in_at")
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
    lastSignInAt: user.last_sign_in_at ?? null,
    previousSignInAt: perfil.previous_sign_in_at,
  };
}
