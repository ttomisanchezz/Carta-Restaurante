import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { loadPublicEnv } from "../env.ts";

/**
 * Cliente anonimo puro, para la carta publica.
 *
 * Es distinto de `createServerSupabase()` en una sola cosa que importa mucho: **no toca
 * cookies**. `cookies()` marca el render como dinamico, y una ruta dinamica no se puede
 * revalidar cada 60 segundos — la carta publica pasaria a consultar Postgres en cada
 * escaneo de QR de cada mesa. Con este cliente, `export const revalidate = 60` funciona.
 *
 * Sigue siendo la clave ANON, o sea que las policies de RLS deciden que filas salen. Lo
 * que se pierde al no leer cookies es solo la identidad: un owner logueado ve la carta
 * publica igual que un comensal, que es exactamente lo que se quiere en esta pantalla.
 */
export function createAnonSupabase(): SupabaseClient {
  const env = loadPublicEnv();

  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Cliente de Supabase para el servidor, con la sesion en cookies.
 *
 * Usa la clave ANON, no la de servicio: las policies de RLS tienen que ejecutarse. El
 * JWT del usuario viaja en la cookie y es lo unico que hace que `auth.uid()` devuelva algo.
 *
 * **Importa `next/headers`, asi que muere fuera de un request.** Jamas lo importes desde
 * un test ni desde un script: esos construyen su propio cliente
 * (`tests/helpers/supabase-clients.ts`).
 */
export async function createServerSupabase() {
  const env = loadPublicEnv();
  const cookieStore = await cookies();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            // `httpOnly` forzado: por defecto @supabase/ssr las escribe legibles desde
            // JavaScript, y una cookie de sesion legible por JS es una cookie de sesion
            // robable con un solo XSS. Nada del panel lee la sesion desde el navegador.
            cookieStore.set(name, value, { ...options, httpOnly: true });
          }
        } catch {
          // Llamado desde un Server Component, que no puede escribir cookies. No es un
          // error: `proxy.ts` ya refresco la sesion antes de que llegara el render.
          // Si esto se tragara un fallo real, la sesion simplemente no se renovaria y
          // el usuario volveria al login — nunca queda a medias.
        }
      },
    },
  });
}
