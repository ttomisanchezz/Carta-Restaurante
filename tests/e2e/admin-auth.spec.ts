import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "../helpers/supabase-clients.ts";

/**
 * Auth del panel: quien entra, quien no, y que pasa con el que tiene sesion pero no es
 * nadie en esta aplicacion.
 *
 * Los proyectos `mobile` y `desktop` corren este archivo dos veces. Nada de lo que se
 * afirma aca depende del ancho, y esta bien que sea asi: el guard no cambia con el
 * viewport, y correrlo en los dos cuesta segundos.
 */

/** Mismo prefijo reservado que usa el resto de la suite. Ver .claude/rules/tests.md. */
const TEST_EMAIL_PREFIX = "__test_";

function serviceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function entrar(page: import("@playwright/test").Page, email: string, password: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

test.describe("acceso al panel", () => {
  test("una peticion anonima a /admin/platos va al login con la ruta en next", async ({ page }) => {
    await page.goto("/admin/platos");

    await expect(page).toHaveURL(/\/admin\/login\?/);

    const url = new URL(page.url());
    expect(url.pathname).toBe("/admin/login");
    expect(url.searchParams.get("next")).toBe("/admin/platos");
  });

  test("con credenciales correctas entra y deja una cookie de sesion HttpOnly", async ({
    page,
    context,
  }) => {
    await page.goto("/admin/login?next=%2Fadmin%2Fplatos");
    await entrar(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    await expect(page).toHaveURL(/\/admin\/platos$/);
    await expect(page.getByRole("heading", { name: "Platos", level: 1 })).toBeVisible();
    // La cuenta administrativa ahora es el owner de BRASA, no un usuario global sin
    // restaurante, asi que recibe las herramientas de activacion de su carta.
    await expect(page.getByTestId("checklist-activacion")).toBeVisible();
    await expect(page.getByTestId("aviso-inactividad")).toHaveCount(0);

    // La cookie de sesion de Supabase se llama sb-<ref>-auth-token (puede venir partida
    // en varios trozos). Se afirma la propiedad, no el nombre exacto: el nombre depende
    // del proyecto y del troceo, HttpOnly es lo que importa.
    const cookies = await context.cookies();
    const sesion = cookies.filter((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));

    expect(sesion.length).toBeGreaterThan(0);
    for (const cookie of sesion) {
      expect(cookie.httpOnly, `la cookie ${cookie.name} tiene que ser HttpOnly`).toBe(true);
    }
  });

  test("con credenciales incorrectas vuelve al formulario sin decir cual de las dos fallo", async ({
    page,
  }) => {
    await page.goto("/admin/login");
    await entrar(page, ADMIN_EMAIL, "esta-no-es-la-contrasena");

    await expect(page.getByTestId("mensaje-login")).toHaveText("Email o contrasena incorrectos");
    // El formulario sigue ahi para reintentar.
    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/login\?/);
  });

  test("un email que no existe da exactamente el mismo mensaje", async ({ page }) => {
    // Si el mensaje fuera distinto, el login seria un oraculo para saber que direcciones
    // estan registradas.
    await page.goto("/admin/login");
    await entrar(page, `${TEST_EMAIL_PREFIX}fantasma@carta.local`, "loquesea1234");

    await expect(page.getByTestId("mensaje-login")).toHaveText("Email o contrasena incorrectos");
  });

  test("cerrar sesion vuelve al login y el panel deja de estar accesible", async ({ page }) => {
    await page.goto("/admin/login");
    await entrar(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await expect(page).toHaveURL(/\/admin\/platos$/);

    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page).toHaveURL(/\/admin\/login$/);

    // La segunda mitad del criterio: no alcanza con que redirija una vez.
    await page.goto("/admin/platos");
    await expect(page).toHaveURL(/\/admin\/login\?/);
  });
});

test.describe("sesion valida sin perfil", () => {
  let db: SupabaseClient;
  let userId = "";
  const email = `${TEST_EMAIL_PREFIX}sinperfil_${Math.random().toString(36).slice(2, 8)}@carta.local`;
  const password = "zzz-test-password-9f3a1c";

  test.beforeAll(async () => {
    db = serviceClient();
    const { data, error } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user)
      throw new Error(`no pude crear el usuario sin perfil: ${error?.message}`);
    userId = data.user.id;
    // A proposito NO se le crea la fila en `profiles`. Eso es lo que se esta probando.
  });

  test.afterAll(async () => {
    if (userId !== "") await db.auth.admin.deleteUser(userId);
  });

  test("lo echa del panel y le explica por que", async ({ page, context }) => {
    await page.goto("/admin/login");
    await entrar(page, email, password);

    // El login sale bien (el JWT es valido) y el router navega a /admin/platos. Ese
    // pedido pasa por el proxy, que ve la sesion sin perfil, la cierra y devuelve el
    // login con el motivo.
    await expect(page.getByTestId("mensaje-login")).toHaveText(
      "Tu usuario no tiene un perfil asignado",
    );
    // Nunca llego a ver el panel.
    await expect(page.getByRole("heading", { name: "Platos", level: 1 })).toHaveCount(0);

    // No se afirma la URL aca, y no es pereza: cuando el proxy corta una navegacion del
    // router de Next, la barra de direcciones se queda en /admin/platos aunque lo que se
    // renderiza sea el login. Es una rareza del router, no del guard, y el criterio habla
    // de cerrar la sesion y mostrar el texto — de la URL no dice nada.

    // "Cerrar su sesion" se comprueba por lo que significa, no por el frasco de cookies:
    // el proxy ya revoco el refresh token, asi que la credencial no vale mas. Se prueba
    // usandola. Si la sesion siguiera viva, esta carga mostraria el panel.
    await page.goto("/admin/platos");
    await expect(page).toHaveURL(/\/admin\/login\?next=/);
    await expect(page.getByRole("heading", { name: "Platos", level: 1 })).toHaveCount(0);

    // Y ademas no queda basura: esa misma carga barre la cookie muerta del navegador.
    const sesion = (await context.cookies()).filter(
      (c) => c.name.startsWith("sb-") && c.name.includes("auth-token") && c.value !== "",
    );
    expect(sesion).toHaveLength(0);
  });
});
