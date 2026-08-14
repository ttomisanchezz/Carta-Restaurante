import { expect, type Page, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * El recorrido completo de un pedido: el comensal pide y el owner confirma, marca listo,
 * entrega y cierra la mesa desde las dos vistas operativas.
 *
 * El escenario se monta con el cliente de servicio y se borra al final. BRASA no se toca.
 */

const PASSWORD = "zzz-test-password-9f3a1c";

let db: SupabaseClient;
let restaurantId = "";
let slug = "";
let tokenMesa = "";
const usuarios: Record<string, { id: string; email: string }> = {};

async function crearUsuario(role: string) {
  const email = `__test_ped_${role}_${Math.random().toString(36).slice(2, 8)}@carta.local`;
  const { data } = await db.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  const id = data?.user?.id as string;
  await db.from("profiles").insert({ id, restaurant_id: restaurantId, role });
  usuarios[role] = { id, email };
}

test.beforeAll(async () => {
  db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  slug = `zzz-test-ped-${Math.random().toString(36).slice(2, 8)}`;
  const { data: rest } = await db
    .from("restaurants")
    .insert({ slug, name: "Parrilla de pedidos" })
    .select("id")
    .single();
  restaurantId = rest?.id as string;

  const { data: cat } = await db
    .from("categories")
    .insert({ restaurant_id: restaurantId, name: "Principales", sort_order: 0 })
    .select("id")
    .single();

  await db.from("dishes").insert({
    restaurant_id: restaurantId,
    category_id: cat?.id,
    name: "Ojo de bife de prueba",
    price: 1_800_000,
    video_status: "ready",
    is_available: true,
    sort_order: 0,
  });

  const { data: mesa } = await db
    .from("restaurant_tables")
    .insert({ restaurant_id: restaurantId, label: "Mesa 3" })
    .select("token")
    .single();
  tokenMesa = mesa?.token as string;

  await crearUsuario("owner");
});

test.afterAll(async () => {
  const { data: sesiones } = await db
    .from("table_sessions")
    .select("id")
    .eq("restaurant_id", restaurantId);
  for (const { id } of sesiones ?? []) {
    const { data: tandas } = await db.from("orders").select("id").eq("session_id", id);
    for (const t of tandas ?? []) await db.from("order_items").delete().eq("order_id", t.id);
    await db.from("orders").delete().eq("session_id", id);
  }
  await db.from("table_sessions").delete().eq("restaurant_id", restaurantId);

  for (const { id } of Object.values(usuarios)) await db.auth.admin.deleteUser(id);
  await db.from("dishes").delete().eq("restaurant_id", restaurantId);
  await db.from("categories").delete().eq("restaurant_id", restaurantId);
  await db.from("restaurants").delete().eq("id", restaurantId);
});

async function entrar(page: Page, role: string, destino: string) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(usuarios[role]?.email as string);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  // El aterrizaje concreto, no `/admin/`: ese patron matchea `/admin/login`, o sea la URL
  // en la que ya estabamos, y la asercion pasaria al instante — dejando que la navegacion
  // siguiente corra sin la cookie de sesion puesta.
  await expect(page).toHaveURL(/\/admin\/platos$/);
  await page.goto(destino);
}

/** El comensal abre su mesa, agrega el plato desde el detalle y manda la tanda. */
async function pedirDesdeLaMesa(page: Page) {
  await page.goto(`/${slug}/mesa/${tokenMesa}`);
  await page.getByText("Ojo de bife de prueba").first().click();
  await page.getByTestId("agregar-al-pedido").click();
  await expect(page.getByTestId("barra-carrito")).toBeVisible();
  await page.getByTestId("enviar-pedido").click();
  await expect(page.getByTestId("aviso-pedido")).toBeVisible();
}

test.describe("el comensal pide", () => {
  test("agrega desde el detalle y su tanda queda esperando confirmación", async ({ page }) => {
    await pedirDesdeLaMesa(page);

    const tanda = page.locator("[data-testid='tanda'][data-secuencia='1']");
    await expect(tanda).toBeVisible();
    await expect(tanda).toHaveAttribute("data-estado", "pendiente");
    // El total de la sesion aparece con el precio del SERVIDOR.
    await expect(page.getByTestId("total-sesion")).toContainText("18.000,00");
  });

  test("la carta pública no tiene carrito ni botón de pedir", async ({ page }) => {
    await page.goto(`/${slug}`);
    await page.getByText("Ojo de bife de prueba").first().click();

    await expect(page.getByTestId("agregar-al-pedido")).toHaveCount(0);
    await expect(page.getByTestId("barra-carrito")).toHaveCount(0);
  });
});

test.describe("el owner controla todo el flujo", () => {
  test("el recorrido entero: confirmar, listo, entregar y cerrar", async ({ page }) => {
    await pedirDesdeLaMesa(page);

    // --- el owner confirma ---
    await entrar(page, "owner", "/admin/pedidos");
    const mesa = page.locator("[data-testid='mesa-abierta'][data-mesa='Mesa 3']");
    await expect(mesa).toBeVisible();
    await mesa.getByTestId("confirmar-tanda").first().click();
    await expect(mesa.locator("[data-testid='tanda-panel'][data-estado='cocina']")).toBeVisible();

    // --- el mismo owner usa la vista de cocina y lo marca listo ---
    await page.goto("/admin/cocina");
    const enCocina = page.locator("[data-testid='tanda-cocina'][data-mesa='Mesa 3']");
    await expect(enCocina).toBeVisible();
    await enCocina.getByTestId("marcar-listo").click();
    await expect(enCocina).toHaveCount(0);

    // --- el owner entrega y cierra ---
    await page.goto("/admin/pedidos");
    const mesaOtraVez = page.locator("[data-testid='mesa-abierta'][data-mesa='Mesa 3']");
    await mesaOtraVez.getByTestId("entregar-tanda").first().click();
    await expect(
      mesaOtraVez.locator("[data-testid='tanda-panel'][data-estado='entregado']"),
    ).toBeVisible();

    await mesaOtraVez.getByTestId("cerrar-mesa").click();
    await expect(page.locator("[data-testid='mesa-abierta'][data-mesa='Mesa 3']")).toHaveCount(0);

    // --- y la mesa arranca limpia para el proximo comensal ---
    await page.goto(`/${slug}/mesa/${tokenMesa}`);
    await expect(page.getByTestId("estado-pedidos")).toHaveCount(0);
  });

  test("la pantalla de cocina no muestra un solo precio", async ({ page }) => {
    await pedirDesdeLaMesa(page);

    await entrar(page, "owner", "/admin/pedidos");
    const mesa = page.locator("[data-testid='mesa-abierta'][data-mesa='Mesa 3']");
    // Esperar la fila ANTES de apretar. Sin esto el click puede caer sobre el HTML del
    // servidor antes de que React hidrate, y se pierde en silencio: el boton esta ahi, el
    // handler todavia no.
    await expect(mesa).toBeVisible();
    await mesa.getByTestId("confirmar-tanda").first().click();
    // Y confirmar que la transicion ocurrio, en vez de suponerlo y fallar tres pasos mas
    // adelante con un mensaje que no dice nada.
    await expect(mesa.locator("[data-testid='tanda-panel'][data-estado='cocina']")).toBeVisible();

    await page.goto("/admin/cocina");
    await expect(page.locator("[data-testid='tanda-cocina']").first()).toBeVisible();

    // El precio del plato es 18.000,00. Ni el texto ni el HTML de la pantalla lo contienen.
    const texto = await page.locator("body").innerText();
    expect(texto).not.toContain("18.000");
    expect(texto).not.toContain("$");
  });

  test("el rechazo con nota le llega al comensal", async ({ page }) => {
    await pedirDesdeLaMesa(page);

    await entrar(page, "owner", "/admin/pedidos");
    const mesa = page.locator("[data-testid='mesa-abierta'][data-mesa='Mesa 3']");
    await expect(mesa).toBeVisible();

    page.once("dialog", (dialogo) => dialogo.accept("Se nos acabó el ojo de bife"));
    await mesa.getByTestId("rechazar-tanda").first().click();
    await expect(
      mesa.locator("[data-testid='tanda-panel'][data-estado='rechazado']"),
    ).toBeVisible();

    await page.goto(`/${slug}/mesa/${tokenMesa}`);
    await expect(page.getByTestId("motivo-rechazo").first()).toContainText("Se nos acabó");
    // Lo rechazado no se cobra.
    await expect(page.getByTestId("total-sesion")).toContainText("0,00");
  });
});
