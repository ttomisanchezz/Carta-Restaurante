import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * El alta de restaurantes desde el panel, y el efecto real de dar de baja: que la carta
 * publica deje de responder.
 *
 * Todo lo que crea lleva el prefijo reservado y se borra al final.
 */

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@carta.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "carta-admin-local";

let db: SupabaseClient;
const slugsCreados: string[] = [];

function slugDePrueba(nombre: string): string {
  return `zzz-test-${nombre}-${Math.random().toString(36).slice(2, 8)}`;
}

test.beforeAll(() => {
  db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
});

test.afterAll(async () => {
  for (const slug of slugsCreados) {
    const { data } = await db.from("restaurants").select("id").eq("slug", slug).maybeSingle();
    if (!data) continue;
    await db.from("dishes").delete().eq("restaurant_id", data.id);
    await db.from("categories").delete().eq("restaurant_id", data.id);
    await db.from("restaurants").delete().eq("id", data.id);
  }
});

async function entrarComoAdmin(page: import("@playwright/test").Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/admin\/platos$/);
}

test.describe("panel de restaurantes", () => {
  test("un superadmin crea un restaurante y aparece en la lista", async ({ page }) => {
    const slug = slugDePrueba("altaui");
    slugsCreados.push(slug);

    await entrarComoAdmin(page);
    await page.goto("/admin/restaurantes");

    await page.getByTestId("campo-nombre").fill("Parrilla de prueba");
    await page.getByTestId("campo-slug").fill(slug);
    await page.getByTestId("crear-restaurante").click();

    await expect(page.getByTestId("mensaje-restaurantes")).toContainText("Restaurante creado");
    await expect(
      page.locator(`[data-testid='fila-restaurante'][data-slug='${slug}']`),
    ).toBeVisible();
  });

  test("un slug repetido muestra el conflicto y no duplica la fila", async ({ page }) => {
    const slug = slugDePrueba("dup");
    slugsCreados.push(slug);

    await entrarComoAdmin(page);
    await page.goto("/admin/restaurantes");

    await page.getByTestId("campo-nombre").fill("El primero");
    await page.getByTestId("campo-slug").fill(slug);
    await page.getByTestId("crear-restaurante").click();
    await expect(page.getByTestId("mensaje-restaurantes")).toContainText("Restaurante creado");

    await page.getByTestId("campo-nombre").fill("El segundo");
    await page.getByTestId("campo-slug").fill(slug);
    await page.getByTestId("crear-restaurante").click();

    await expect(page.getByTestId("mensaje-restaurantes")).toContainText(
      "Ya existe un restaurante",
    );

    const { count } = await db
      .from("restaurants")
      .select("id", { count: "exact", head: true })
      .eq("slug", slug);
    expect(count).toBe(1);
  });

  test("un color invalido se rechaza y el formulario dice cual campo", async ({ page }) => {
    const slug = slugDePrueba("colorui");

    await entrarComoAdmin(page);
    await page.goto("/admin/restaurantes");

    await page.getByTestId("campo-nombre").fill("Color raro");
    await page.getByTestId("campo-slug").fill(slug);
    await page.getByTestId("campo-color").fill("rojo");
    await page.getByTestId("crear-restaurante").click();

    const mensaje = page.getByTestId("mensaje-restaurantes");
    await expect(mensaje).toContainText("Revisá los datos");
    await expect(mensaje).toContainText("primary_color");

    const { count } = await db
      .from("restaurants")
      .select("id", { count: "exact", head: true })
      .eq("slug", slug);
    expect(count).toBe(0);
  });

  test("dar de baja apaga la carta publica en la siguiente carga", async ({ page, request }) => {
    const slug = slugDePrueba("baja");
    slugsCreados.push(slug);

    await entrarComoAdmin(page);
    await page.goto("/admin/restaurantes");
    await page.getByTestId("campo-nombre").fill("Se va de baja");
    await page.getByTestId("campo-slug").fill(slug);
    await page.getByTestId("crear-restaurante").click();
    await expect(page.getByTestId("mensaje-restaurantes")).toContainText("Restaurante creado");

    // Publicado: la carta existe aunque todavia no tenga platos.
    expect((await request.get(`/${slug}`)).status()).toBe(200);

    const fila = page.locator(`[data-testid='fila-restaurante'][data-slug='${slug}']`);
    await fila.getByTestId("alternar-estado").click();
    await expect(fila).toContainText("dado de baja");

    // Y acá esta el punto del test: sin el revalidatePath del slug, la carta seguiria
    // sirviendose de la cache hasta 60 segundos despues de la baja.
    expect((await request.get(`/${slug}`)).status()).toBe(404);
  });

  test("un owner no ve el formulario de alta", async ({ page }) => {
    const slug = slugDePrueba("ownerui");
    slugsCreados.push(slug);

    const { data: rest } = await db
      .from("restaurants")
      .insert({ slug, name: "Del owner" })
      .select("id")
      .single();
    const email = `__test_ownerui_${Math.random().toString(36).slice(2, 8)}@carta.local`;
    const password = "zzz-test-password-9f3a1c";
    const { data: usuario } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    await db
      .from("profiles")
      .insert({ id: usuario?.user?.id, restaurant_id: rest?.id, role: "owner" });

    try {
      await page.goto("/admin/login");
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Contraseña").fill(password);
      await page.getByRole("button", { name: "Entrar" }).click();
      // Esperar el aterrizaje NO es ceremonia: sin esto, el goto de abajo corre antes de
      // que la Server Action deje la cookie, la pagina rebota al login y el test pasaria
      // por el motivo equivocado — no hay formulario de alta porque no hay sesion.
      await expect(page).toHaveURL(/\/admin\/platos$/);

      await page.goto("/admin/restaurantes");

      await expect(page.getByTestId("crear-restaurante")).toHaveCount(0);

      // Ve el suyo y SOLO el suyo. Esto no lo garantiza RLS: la policy deja leer toda
      // fila activa, porque de eso vive la carta publica. Si el panel no filtrara,
      // cualquier owner veria la cartera de clientes entera — BRASA incluida.
      await expect(page.getByTestId("fila-restaurante")).toHaveCount(1);
      await expect(page.getByTestId("fila-restaurante")).toContainText(slug);
      await expect(page.getByText("BRASA")).toHaveCount(0);

      // Y tampoco tiene el control de publicar o dar de baja.
      await expect(page.getByTestId("alternar-estado")).toHaveCount(0);
    } finally {
      if (usuario?.user?.id) await db.auth.admin.deleteUser(usuario.user.id);
    }
  });
});
