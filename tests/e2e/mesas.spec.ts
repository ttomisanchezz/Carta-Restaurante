import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Mesas identificadas por QR, de punta a punta: el panel del dueño y lo que ve el comensal.
 *
 * El escenario se monta con el cliente de servicio y se borra al final. BRASA no se toca.
 */

const PASSWORD = "zzz-test-password-9f3a1c";

let db: SupabaseClient;
let restaurantId = "";
let slug = "";
let ownerId = "";
let ownerEmail = "";
/** Una mesa creada por fuera del panel, para las pruebas del lado del comensal. */
let tokenDeMesa = "";

test.beforeAll(async () => {
  db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  slug = `zzz-test-mesas-${Math.random().toString(36).slice(2, 8)}`;
  const { data: rest } = await db
    .from("restaurants")
    .insert({ slug, name: "Parrilla de mesas" })
    .select("id")
    .single();
  restaurantId = rest?.id as string;

  const { data: cat } = await db
    .from("categories")
    .insert({ restaurant_id: restaurantId, name: "Principales", sort_order: 0 })
    .select("id")
    .single();

  // `ready` y disponible: es la unica forma de que el plato entre por la rama publica de la
  // policy y aparezca en la carta que ve el comensal.
  await db.from("dishes").insert({
    restaurant_id: restaurantId,
    category_id: cat?.id,
    name: "Entraña de prueba",
    price: 1_500_000,
    calories: 720,
    video_status: "ready",
    is_available: true,
    sort_order: 0,
  });

  const { data: mesa } = await db
    .from("restaurant_tables")
    .insert({ restaurant_id: restaurantId, label: "Mesa 9" })
    .select("token")
    .single();
  tokenDeMesa = mesa?.token as string;

  ownerEmail = `__test_mesas_${Math.random().toString(36).slice(2, 8)}@carta.local`;
  const { data: owner } = await db.auth.admin.createUser({
    email: ownerEmail,
    password: PASSWORD,
    email_confirm: true,
  });
  ownerId = owner?.user?.id as string;
  await db.from("profiles").insert({ id: ownerId, restaurant_id: restaurantId, role: "owner" });
});

test.afterAll(async () => {
  if (ownerId) await db.auth.admin.deleteUser(ownerId);
  // `restaurant_tables` cae sola: su FK es ON DELETE CASCADE.
  await db.from("dishes").delete().eq("restaurant_id", restaurantId);
  await db.from("categories").delete().eq("restaurant_id", restaurantId);
  await db.from("restaurants").delete().eq("id", restaurantId);
});

async function entrar(page: import("@playwright/test").Page, email: string) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  // Esperar el aterrizaje: sin esto la navegacion siguiente corre sin cookie de sesion.
  await expect(page).toHaveURL(/\/admin\/platos$/);
  await page.goto("/admin/mesas");
}

test.describe("panel de mesas", () => {
  test("el owner crea una mesa y le sale su QR y su URL completa", async ({ page }) => {
    await entrar(page, ownerEmail);

    const nombre = `Mesa ${Math.random().toString(36).slice(2, 6)}`;
    await page.getByTestId("campo-mesa").fill(nombre);
    await page.getByTestId("crear-mesa").click();

    const fila = page.locator(`[data-testid='fila-mesa'][data-etiqueta='${nombre}']`);
    await expect(fila).toBeVisible();
    await expect(fila.getByTestId("qr-mesa")).toBeVisible();
    // La URL va en texto y completa: es lo que permite probar la mesa a mano.
    await expect(fila).toContainText(`/${slug}/mesa/`);
    await expect(fila.getByTestId("descargar-qr")).toBeVisible();
  });

  test("desactivar una mesa la deja en la lista, marcada, sin borrarla", async ({ page }) => {
    await entrar(page, ownerEmail);

    const nombre = `Mesa ${Math.random().toString(36).slice(2, 6)}`;
    await page.getByTestId("campo-mesa").fill(nombre);
    await page.getByTestId("crear-mesa").click();

    const fila = page.locator(`[data-testid='fila-mesa'][data-etiqueta='${nombre}']`);
    await expect(fila).toBeVisible();
    await fila.getByTestId("cambiar-activacion-mesa").click();

    const desactivada = page.locator(
      `[data-testid='fila-mesa'][data-etiqueta='${nombre}'][data-activa='no']`,
    );
    await expect(desactivada).toBeVisible();
    await expect(desactivada).toContainText("Inactiva");
  });

  test("renombrar no cambia la URL: el QR pegado a la mesa sigue sirviendo", async ({ page }) => {
    await entrar(page, ownerEmail);

    const nombre = `Mesa ${Math.random().toString(36).slice(2, 6)}`;
    await page.getByTestId("campo-mesa").fill(nombre);
    await page.getByTestId("crear-mesa").click();

    const fila = page.locator(`[data-testid='fila-mesa'][data-etiqueta='${nombre}']`);
    await expect(fila).toBeVisible();
    const urlAntes = await fila.locator("code").innerText();

    const nuevoNombre = `${nombre} bis`;
    await fila.getByTestId("campo-renombrar-mesa").fill(nuevoNombre);
    await fila.getByTestId("renombrar-mesa").click();

    const renombrada = page.locator(`[data-testid='fila-mesa'][data-etiqueta='${nuevoNombre}']`);
    await expect(renombrada).toBeVisible();
    expect(await renombrada.locator("code").innerText()).toBe(urlAntes);
  });
});

test.describe("la carta del comensal", () => {
  test("un token valido abre la carta con el indicador de mesa", async ({ page }) => {
    const respuesta = await page.goto(`/${slug}/mesa/${tokenDeMesa}`);

    expect(respuesta?.status()).toBe(200);
    await expect(page.getByTestId("indicador-mesa")).toHaveText("Mesa 9");
    await expect(page.getByText("Entraña de prueba")).toBeVisible();
  });

  test("un token inexistente da 404, no la carta generica", async ({ page }) => {
    const respuesta = await page.goto(`/${slug}/mesa/00000000000000000000000000000000`);

    // El silencio es lo que hace perder tiempo: cae a 404, no a la carta sin mesa.
    expect(respuesta?.status()).toBe(404);
    await expect(page.getByTestId("indicador-mesa")).toHaveCount(0);
  });

  test("un token con forma invalida da 404", async ({ page }) => {
    const respuesta = await page.goto(`/${slug}/mesa/5`);

    expect(respuesta?.status()).toBe(404);
  });

  test("la carta sin mesa sigue funcionando igual que antes", async ({ page }) => {
    const respuesta = await page.goto(`/${slug}`);

    expect(respuesta?.status()).toBe(200);
    await expect(page.getByText("Entraña de prueba")).toBeVisible();
    // Sin mesa no hay indicador: la ruta vieja no cambio.
    await expect(page.getByTestId("indicador-mesa")).toHaveCount(0);
  });
});
