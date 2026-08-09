import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Crea o asegura el usuario administrador. Idempotente: correrlo dos veces no cambia nada.
 *
 *   pnpm db:admin        # node --env-file=.env.local scripts/create-admin.ts
 *
 * Por que no lo hace `supabase/seed.sql`: insertar a mano en `auth.users` depende de columnas
 * internas que cambian entre versiones de Supabase. La API de administracion, no.
 *
 * Este archivo NO usa el alias `@/`. Node resuelve literal y no lee `paths` de tsconfig, asi
 * que en `scripts/` van rutas relativas con extension explicita — aca no hace falta ninguna,
 * pero la regla vale igual si algun dia importa algo del proyecto.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Credenciales del admin. Se pueden pisar por entorno, pero traen un default que funciona
 * sin configurar nada: este usuario existe para entrar al panel en desarrollo y para que los
 * specs de Playwright tengan con quien loguearse.
 */
export const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@carta.local";
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "carta-admin-local";

function abortar(mensaje: string): never {
  console.error(`create-admin: ${mensaje}`);
  process.exit(1);
}

/**
 * Busca un usuario por email recorriendo las paginas de la API de administracion.
 * No hay un `getUserByEmail`, y `listUsers` pagina de a 50 por defecto.
 */
async function buscarPorEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  const porPagina = 200;
  for (let pagina = 1; pagina <= 50; pagina++) {
    const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: porPagina });
    if (error) abortar(`no pude listar usuarios: ${error.message}`);

    const encontrado = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (encontrado) return encontrado.id;
    if (data.users.length < porPagina) return null;
  }
  return null;
}

async function main(): Promise<void> {
  if (!url || !serviceKey) {
    abortar(
      "faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY. " +
        "Se leen de .env.local, que carga `node --env-file`.",
    );
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let userId = await buscarPorEmail(admin, ADMIN_EMAIL);

  if (userId === null) {
    const { data, error } = await admin.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
    });
    if (error || !data.user) {
      abortar(`no pude crear el usuario: ${error?.message ?? "sin usuario en la respuesta"}`);
    }
    userId = data.user.id;
  } else {
    // Ya existia. Se le reafirma la contrasena para que el default documentado siempre
    // sirva, incluso si alguien la cambio a mano probando el panel.
    const { error } = await admin.auth.admin.updateUserById(userId, {
      password: ADMIN_PASSWORD,
      email_confirm: true,
    });
    if (error) abortar(`no pude actualizar el usuario: ${error.message}`);
  }

  // `upsert` y no `insert`: la fila puede existir de una corrida anterior. `restaurant_id`
  // queda en null a proposito — un superadmin no pertenece a ningun restaurante, los ve todos.
  const { error: errorPerfil } = await admin
    .from("profiles")
    .upsert({ id: userId, restaurant_id: null, role: "superadmin" }, { onConflict: "id" });
  if (errorPerfil) abortar(`no pude asegurar el perfil: ${errorPerfil.message}`);

  console.log(`admin listo: ${ADMIN_EMAIL} (superadmin)`);
}

await main();
