import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Clientes de Supabase para tests.
 *
 * NO se importa `src/lib/supabase/server.ts`: ese modulo usa `next/headers` y muere
 * fuera de un request de Next. Los tests construyen sus propios clientes.
 *
 * `tests/setup.ts` ya verifico que las variables existan y que TEST_DB_PROJECT_REF
 * coincida con el proyecto, asi que aca se leen sin volver a validar.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;

/**
 * Prefijos reservados. TODA fila que cree un test lleva uno, y toda limpieza filtra por el.
 *
 * Son DOS y no uno, y el motivo lo encontro una corrida real: el constraint del slug es
 * `^[a-z0-9-]{2,40}$` y **no acepta guion bajo**, asi que `__test_` es imposible ahi.
 * Aflojar ese constraint para que entre un prefijo de tests seria al reves de como se
 * hace: el slug es la URL publica del restaurante y los guiones bajos en URLs son mala
 * practica. Se cambia el prefijo, no la regla de produccion.
 *
 * `zzz-test-` cumple el patron y ademas ordena ultimo, asi que si alguna vez queda una
 * fila colgada aparece al final de cualquier listado en vez de perderse en el medio.
 */
export const TEST_SLUG_PREFIX = "zzz-test-";
export const TEST_EMAIL_PREFIX = "__test_";

/** Cliente anonimo: sujeto a las policies de RLS, igual que el navegador del comensal. */
export function anonClient(): SupabaseClient {
  return createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Cliente de servicio: SALTEA RLS.
 *
 * Solo para montar y desmontar datos de prueba, y para comprobar el estado real de
 * la base cuando un test afirma que algo NO se ve. Nunca para probar lo que ve un
 * usuario: eso se prueba con `anonClient()` o `authedClient()`.
 */
export function serviceClient(): SupabaseClient {
  return createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Slug unico con el prefijo reservado, para que dos corridas no choquen.
 * El resultado siempre cumple `^[a-z0-9-]{2,40}$`: se descarta cualquier otro caracter.
 */
export function testSlug(nombre: string): string {
  const sufijo = Math.random().toString(36).slice(2, 8);
  const limpio = nombre.toLowerCase().replace(/[^a-z0-9-]/g, "");
  return `${TEST_SLUG_PREFIX}${limpio}-${sufijo}`.slice(0, 40);
}

/** Email unico con el prefijo reservado. `auth.users` no tiene constraint de formato. */
export function testEmail(nombre: string): string {
  const sufijo = Math.random().toString(36).slice(2, 8);
  return `${TEST_EMAIL_PREFIX}${nombre}_${sufijo}@carta.local`.toLowerCase();
}

/**
 * Borra TODO lo que dejo un test, filtrando siempre por el prefijo reservado.
 *
 * El `like` no es cosmetico: esta base es la misma donde vive la demo BRASA. Un
 * `delete` sin filtro aca borra la demo de ventas.
 */
export async function limpiarFilasDeTest(): Promise<void> {
  const db = serviceClient();
  const { data: restaurantes } = await db
    .from("restaurants")
    .select("id")
    .like("slug", `${TEST_SLUG_PREFIX}%`);

  for (const { id } of restaurantes ?? []) {
    // Orden inverso a las dependencias: dishes antes que categories, porque
    // category_id es ON DELETE RESTRICT.
    await db.from("dishes").delete().eq("restaurant_id", id);
    await db.from("categories").delete().eq("restaurant_id", id);
    await db.from("restaurants").delete().eq("id", id);
  }
}
