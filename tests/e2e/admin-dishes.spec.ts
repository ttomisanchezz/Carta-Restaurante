import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Platos desde el panel, con un owner de verdad y su propio restaurante.
 */

const PASSWORD = "zzz-test-password-9f3a1c";

let db: SupabaseClient;
let restaurantId = "";
let categoryId = "";
let userId = "";
let email = "";
let slug = "";

test.beforeAll(async () => {
  db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  slug = `zzz-test-platos-${Math.random().toString(36).slice(2, 8)}`;
  const { data: rest } = await db
    .from("restaurants")
    .insert({ slug, name: "Parrilla de platos" })
    .select("id")
    .single();
  restaurantId = rest?.id as string;

  const { data: cat } = await db
    .from("categories")
    .insert({ restaurant_id: restaurantId, name: "Principales", sort_order: 0 })
    .select("id")
    .single();
  categoryId = cat?.id as string;

  email = `__test_platos_${Math.random().toString(36).slice(2, 8)}@carta.local`;
  const { data: usuario } = await db.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  userId = usuario?.user?.id as string;
  await db.from("profiles").insert({ id: userId, restaurant_id: restaurantId, role: "owner" });
});

test.afterAll(async () => {
  if (userId) await db.auth.admin.deleteUser(userId);
  await db.from("dishes").delete().eq("restaurant_id", restaurantId);
  await db.from("categories").delete().eq("restaurant_id", restaurantId);
  await db.from("restaurants").delete().eq("id", restaurantId);
});

async function entrar(page: import("@playwright/test").Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/admin\/platos$/);
}

async function crearPlato(page: import("@playwright/test").Page, nombre: string, precio: string) {
  await page.getByTestId("campo-plato-nombre").fill(nombre);
  await page.getByTestId("campo-plato-categoria").selectOption(categoryId);
  await page.getByTestId("campo-plato-precio").fill(precio);
  await page.getByTestId("crear-plato").click();
}

test.describe("panel de platos", () => {
  test("un precio con coma se guarda como entero en centavos", async ({ page }) => {
    await entrar(page);

    const nombre = `Con coma ${Math.random().toString(36).slice(2, 6)}`;
    await crearPlato(page, nombre, "13500,50");

    await expect(page.locator(`[data-testid='fila-plato'][data-nombre='${nombre}']`)).toBeVisible();

    const { data } = await db.from("dishes").select("price").eq("name", nombre).single();
    expect(data?.price).toBe(1_350_050);
  });

  test("un precio negativo se rechaza y no crea el plato", async ({ page }) => {
    await entrar(page);

    const nombre = `Negativo ${Math.random().toString(36).slice(2, 6)}`;
    await crearPlato(page, nombre, "-100");

    await expect(page.getByTestId("mensaje-platos")).toBeVisible();

    const { count } = await db
      .from("dishes")
      .select("id", { count: "exact", head: true })
      .eq("name", nombre);
    expect(count).toBe(0);
  });

  test("duplicar crea una copia sin video y fuera de la carta publica", async ({
    page,
    request,
  }) => {
    await entrar(page);

    const nombre = `Original ${Math.random().toString(36).slice(2, 6)}`;
    await crearPlato(page, nombre, "9000");
    const fila = page.locator(`[data-testid='fila-plato'][data-nombre='${nombre}']`);
    await expect(fila).toBeVisible();

    await fila.getByTestId("duplicar-plato").click();

    const copia = page.locator(`[data-testid='fila-plato'][data-nombre='${nombre} (copia)']`);
    await expect(copia).toBeVisible();
    await expect(copia.getByTestId("estado-video")).toHaveText("sin video");

    const { data } = await db
      .from("dishes")
      .select("price, video_status, video_playback_id")
      .eq("name", `${nombre} (copia)`)
      .single();
    expect(data?.price).toBe(900_000);
    expect(data?.video_status).toBe("pending");
    expect(data?.video_playback_id).toBeNull();

    // Y no llega a la carta: la policy exige ready. Ni el original, que tampoco tiene video.
    const publica = await request.get(`/${slug}`);
    expect(publica.status()).toBe(200);
    expect(await publica.text()).not.toContain(`${nombre} (copia)`);
  });

  test("bajar un plato lo intercambia con el siguiente de su categoria", async ({ page }) => {
    await entrar(page);

    const sufijo = Math.random().toString(36).slice(2, 6);
    await crearPlato(page, `A ${sufijo}`, "1000");
    await expect(
      page.locator(`[data-testid='fila-plato'][data-nombre='A ${sufijo}']`),
    ).toBeVisible();
    await crearPlato(page, `B ${sufijo}`, "2000");
    await expect(
      page.locator(`[data-testid='fila-plato'][data-nombre='B ${sufijo}']`),
    ).toBeVisible();

    const nombres = await page
      .getByTestId("fila-plato")
      .evaluateAll((nodos) => nodos.map((n) => n.getAttribute("data-nombre")));
    const posA = nombres.indexOf(`A ${sufijo}`);
    expect(nombres[posA + 1]).toBe(`B ${sufijo}`);

    await page
      .locator(`[data-testid='fila-plato'][data-nombre='A ${sufijo}']`)
      .getByTestId("bajar-plato")
      .click();

    // Aserción que reintenta: leer el DOM de una vez despues del submit corre antes de
    // que termine la navegacion de la Server Action.
    await expect(page.getByTestId("fila-plato").nth(posA)).toHaveAttribute(
      "data-nombre",
      `B ${sufijo}`,
    );
    await expect(page.getByTestId("fila-plato").nth(posA + 1)).toHaveAttribute(
      "data-nombre",
      `A ${sufijo}`,
    );
  });
});
