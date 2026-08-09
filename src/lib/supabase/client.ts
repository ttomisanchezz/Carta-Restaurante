import { createBrowserClient } from "@supabase/ssr";
import { loadPublicEnv } from "../env.ts";

/**
 * Cliente de Supabase para el navegador.
 *
 * **El login NO pasa por aca, y es a proposito.** Un cliente de navegador escribe la
 * sesion con `document.cookie`, y eso no puede ser `HttpOnly` — por definicion, si JS la
 * escribe, JS la lee. El formulario de login usa una Server Action contra
 * `createServerSupabase()`, que si deja la cookie `HttpOnly`.
 *
 * Consecuencia de esa decision: como las cookies de sesion son `HttpOnly`, este cliente
 * **no ve la sesion del usuario**. Sirve para lo que no la necesita — lecturas publicas
 * desde un componente de cliente, realtime sobre datos publicos. Todo lo que dependa de
 * quien sos se resuelve en el servidor.
 */
export function createBrowserSupabase() {
  const env = loadPublicEnv();

  return createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
