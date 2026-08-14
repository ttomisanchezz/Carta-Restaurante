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

/**
 * Lee una variable de entorno tratando la CADENA VACIA como ausente.
 *
 * No es purismo: es el bug que tuvo el CI rojo. GitHub Actions, cuando un `secrets.X` no
 * existe, no deja la variable sin definir — la exporta como `""`. Y `??` solo cae al valor
 * por defecto con `null` o `undefined`, asi que la cadena vacia le ganaba al default y la
 * suite intentaba autenticarse con un email vacio: `missing email or phone`.
 *
 * Local nunca lo mostro, porque ahi la variable directamente no existe y `??` si funciona.
 */
function delEntornoODefault(nombre: string, porDefecto: string): string {
  const valor = process.env[nombre];
  return valor === undefined || valor.trim() === "" ? porDefecto : valor;
}

/**
 * El administrador con el que se autentican los tests.
 *
 * Los defaults son los mismos que usa `scripts/create-admin.ts` para crearlo, asi que un
 * proyecto recien montado con `pnpm db:admin` funciona sin configurar nada. Si tu admin
 * tiene otras credenciales, poné `ADMIN_EMAIL` y `ADMIN_PASSWORD` en `.env.local` (y como
 * secrets del repo, si querés lo mismo en CI).
 */
export const ADMIN_EMAIL = delEntornoODefault("ADMIN_EMAIL", "owner@carta.local");
export const ADMIN_PASSWORD = delEntornoODefault("ADMIN_PASSWORD", "carta-owner-local");

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
 * Cliente autenticado como un usuario concreto. Usa la clave ANON, igual que el navegador:
 * lo unico que cambia respecto de `anonClient()` es que lleva el JWT del usuario, que es
 * lo que hace que `auth.uid()` devuelva algo y las policies lo dejen ver sus propias filas.
 *
 * Con `persistSession: false` la sesion vive en memoria, en esta instancia y nada mas: dos
 * llamadas a esta funcion son dos usuarios distintos sin pisarse.
 */
export async function authedClient(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`No se pudo autenticar al usuario de prueba ${email}: ${error.message}`);
  }

  return client;
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

  await limpiarUsuariosDeTest();
}

/**
 * Borra los usuarios de `auth.users` con el prefijo reservado.
 *
 * Va aparte de las filas de contenido porque `auth.users` no se toca por PostgREST: hay
 * que ir por la API de admin, una llamada por usuario. Borrar el usuario arrastra su fila
 * de `profiles` (`on delete cascade`).
 *
 * Sin esto los usuarios de cada corrida se acumulan para siempre en un proyecto compartido.
 */
export async function limpiarUsuariosDeTest(): Promise<void> {
  const db = serviceClient();
  const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });

  for (const usuario of data?.users ?? []) {
    // El filtro por prefijo es la unica proteccion: en esta base tambien viven
    // los usuarios reales del panel.
    if (usuario.email?.startsWith(TEST_EMAIL_PREFIX)) {
      await db.auth.admin.deleteUser(usuario.id);
    }
  }
}
