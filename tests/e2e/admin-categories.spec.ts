import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Categorias desde el panel, con un owner de verdad.
 *
 * El escenario se monta con el cliente de servicio y se borra al final. Los datos de BRASA
 * no se tocan.
 */

const PASSWORD = "zzz-test-password-9f3a1c";

let db: SupabaseClient;
let restaurantId = "";
let userId = "";
let email = "";
/** Categoria con EXACTAMENTE 3 platos, para el mensaje de borrado bloqueado. */
let categoriaConTres = "";

test.beforeAll(async () => {
  db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const slug = `zzz-test-cats-${Math.random().toString(36).slice(2, 8)}`;
  const { data: rest } = await db
    .from("restaurants")
    .insert({ slug, name: "Parrilla de categorías" })
    .select("id")
    .single();
  restaurantId = rest?.id as string;

  const { data: cat } = await db
    .from("categories")
    .insert({ restaurant_id: restaurantId, name: "Con tres platos", sort_order: 0 })
    .select("id")
    .single();
  categoriaConTres = cat?.id as string;

  await db.from("dishes").insert(
    [1, 2, 3].map((n) => ({
      restaurant_id: restaurantId,
      category_id: categoriaConTres,
      name: `Plato ${n}`,
      price: 100000,
      sort_order: n,
    })),
  );

  email = `__test_cats_${Math.random().toString(36).slice(2, 8)}@carta.local`;
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
  // Esperar el aterrizaje: sin esto la navegacion siguiente corre sin cookie de sesion.
  await expect(page).toHaveURL(/\/admin\/platos$/);
  await page.goto("/admin/categorias");
}

test.describe("panel de categorias", () => {
  test("el owner crea una categoria y aparece en la lista", async ({ page }) => {
    await entrar(page);

    const nombre = `Postres ${Math.random().toString(36).slice(2, 6)}`;
    await page.getByTestId("campo-categoria").fill(nombre);
    await page.getByTestId("crear-categoria").click();

    await expect(
      page.locator(`[data-testid='fila-categoria'][data-nombre='${nombre}']`),
    ).toBeVisible();

    // Y se creo en SU restaurante, no en otro.
    const { data } = await db
      .from("categories")
      .select("restaurant_id")
      .eq("name", nombre)
      .single();
    expect(data?.restaurant_id).toBe(restaurantId);
  });

  test("borrar una categoria con platos se bloquea y dice cuantos son", async ({ page }) => {
    await entrar(page);

    const fila = page.locator("[data-testid='fila-categoria'][data-nombre='Con tres platos']");
    await fila.getByTestId("borrar-categoria").click();

    const mensaje = page.getByTestId("mensaje-categorias");
    await expect(mensaje).toBeVisible();
    // El numero importa: "no se puede" sin decir cuantos deja al usuario adivinando.
    await expect(mensaje).toContainText("3");

    // Y sigue ahi.
    await expect(
      page.locator("[data-testid='fila-categoria'][data-nombre='Con tres platos']"),
    ).toBeVisible();
  });

  test("borrar una categoria vacia la saca de la lista", async ({ page }) => {
    await entrar(page);

    const nombre = `Vacia ${Math.random().toString(36).slice(2, 6)}`;
    await page.getByTestId("campo-categoria").fill(nombre);
    await page.getByTestId("crear-categoria").click();

    const fila = page.locator(`[data-testid='fila-categoria'][data-nombre='${nombre}']`);
    await expect(fila).toBeVisible();

    await fila.getByTestId("borrar-categoria").click();
    await expect(fila).toHaveCount(0);
  });

  test("subir la segunda la intercambia con la primera", async ({ page }) => {
    await entrar(page);

    const nombre = `Segunda ${Math.random().toString(36).slice(2, 6)}`;
    await page.getByTestId("campo-categoria").fill(nombre);
    await page.getByTestId("crear-categoria").click();

    // Esperar la fila antes de leer la lista. Sin esto se lee el DOM viejo, el nombre no
    // esta todavia y el indice da -1.
    await expect(
      page.locator(`[data-testid='fila-categoria'][data-nombre='${nombre}']`),
    ).toBeVisible();

    const nombresAntes = await page
      .getByTestId("fila-categoria")
      .evaluateAll((nodos) => nodos.map((n) => n.getAttribute("data-nombre")));
    const posicion = nombresAntes.indexOf(nombre);
    expect(posicion).toBeGreaterThan(0);

    await page
      .locator(`[data-testid='fila-categoria'][data-nombre='${nombre}']`)
      .getByTestId("subir-categoria")
      .click();

    // Aserción que reintenta, no una lectura puntual: `evaluateAll` devuelve el DOM tal
    // como esta en ese instante, y si la navegacion del reordenamiento todavia no
    // termino se lee el orden viejo y el test falla por una carrera, no por un bug.
    await expect(page.getByTestId("fila-categoria").nth(posicion - 1)).toHaveAttribute(
      "data-nombre",
      nombre,
    );

    const nombresDespues = await page
      .getByTestId("fila-categoria")
      .evaluateAll((nodos) => nodos.map((n) => n.getAttribute("data-nombre")));
    // Intercambio, no insercion: la que estaba arriba bajo justo un lugar.
    expect(nombresDespues[posicion]).toBe(nombresAntes[posicion - 1]);
  });

  test("la primera no se puede subir y el control esta deshabilitado", async ({ page }) => {
    await entrar(page);

    const primera = page.getByTestId("fila-categoria").first();
    // Deshabilitado, no escondido: los controles no se mueven de lugar entre filas.
    await expect(primera.getByTestId("subir-categoria")).toBeDisabled();
  });
});
