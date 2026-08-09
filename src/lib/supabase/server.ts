import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { loadPublicEnv } from "../env.ts";

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
