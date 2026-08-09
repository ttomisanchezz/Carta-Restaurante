import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * La carta publica: la pantalla que se abre al escanear el QR de la mesa.
 *
 * BRASA sale del seed y no se toca. Los dos casos de borde —restaurante apagado y
 * restaurante sin platos listos— necesitan filas propias, que se crean con el prefijo
 * reservado y se borran al final.
 */

const PREFIJO = "zzz-test-";

function serviceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function slugDePrueba(nombre: string): string {
  return `${PREFIJO}${nombre}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Inserta y devuelve la fila, o revienta con el motivo.
 *
 * Sin esto cada insert deja un `data` que puede ser null y el montaje se llena de `?.` y
 * de `as`. Peor: si el insert falla, el test seguiria hasta romperse dos pantallas mas
 * adelante con un error que no dice nada.
 */
async function insertarUno(
  consulta: PromiseLike<{ data: { id: string } | null; error: { message: string } | null }>,
  que: string,
): Promise<{ id: string }> {
  const { data, error } = await consulta;
  if (error || !data) throw new Error(`no pude crear ${que}: ${error?.message ?? "sin fila"}`);
  return data;
}

let db: SupabaseClient;
const creados: string[] = [];
let slugApagado = "";
let slugSinPlatos = "";

test.beforeAll(async () => {
  db = serviceClient();

  // Apagado: existe, tiene un plato listo, pero `is_active` en false.
  slugApagado = slugDePrueba("apagado");
  const apagado = await insertarUno(
    db
      .from("restaurants")
      .insert({ slug: slugApagado, name: "Cerrado por reformas", is_active: false })
      .select("id")
      .single(),
    "el restaurante apagado",
  );
  const catApagado = await insertarUno(
    db
      .from("categories")
      .insert({ restaurant_id: apagado.id, name: "Principales", sort_order: 0 })
      .select("id")
      .single(),
    "la categoria del apagado",
  );
  await db.from("dishes").insert({
    restaurant_id: apagado.id,
    category_id: catApagado.id,
    name: "Plato que nadie ve",
    price: 100000,
    video_status: "ready",
  });
  creados.push(apagado.id);

  // Al aire, pero sin ningun plato en `ready`: la carta esta vacia, no rota.
  slugSinPlatos = slugDePrueba("sinplatos");
  const sinPlatos = await insertarUno(
    db
      .from("restaurants")
      .insert({ slug: slugSinPlatos, name: "Parrilla que abre pronto", is_active: true })
      .select("id")
      .single(),
    "el restaurante sin platos",
  );
  const catSinPlatos = await insertarUno(
    db
      .from("categories")
      .insert({ restaurant_id: sinPlatos.id, name: "Principales", sort_order: 0 })
      .select("id")
      .single(),
    "la categoria del que no tiene platos",
  );
  await db.from("dishes").insert({
    restaurant_id: sinPlatos.id,
    category_id: catSinPlatos.id,
    name: "Todavia sin video",
    price: 100000,
    video_status: "pending",
  });
  creados.push(sinPlatos.id);
});

test.afterAll(async () => {
  for (const id of creados) {
    await db.from("dishes").delete().eq("restaurant_id", id);
    await db.from("categories").delete().eq("restaurant_id", id);
    await db.from("restaurants").delete().eq("id", id);
  }
});

test.describe("carta publica", () => {
  test("responde 200 y el nombre ya viene en el HTML del servidor", async ({ page, request }) => {
    // Se pide el HTML crudo, sin navegador: si el nombre esta aca, esta antes de que
    // corra un solo script de cliente. Con `page.goto` no se podria distinguir.
    const crudo = await request.get("/brasa");
    expect(crudo.status()).toBe(200);
    expect(await crudo.text()).toContain("BRASA");

    const respuesta = await page.goto("/brasa");
    expect(respuesta?.status()).toBe(200);
  });

  test("emite exactamente un h1 y un title con el nombre", async ({ page }) => {
    await page.goto("/brasa");

    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toHaveText("BRASA");
    await expect(page).toHaveTitle(/BRASA/);
  });

  test("un slug que no existe responde 404 y muestra la pantalla, sin excepcion", async ({
    page,
    request,
  }) => {
    const crudo = await request.get("/no-existe");
    expect(crudo.status()).toBe(404);

    await page.goto("/no-existe");
    await expect(page.getByRole("heading", { name: "No encontramos esta carta" })).toBeVisible();
    // Una excepcion sin atrapar en Next se ve como el overlay de error o un 500.
    expect(await page.locator("body").innerText()).not.toContain("Application error");
  });

  test("un restaurante dado de baja responde 404", async ({ request }) => {
    const crudo = await request.get(`/${slugApagado}`);
    expect(crudo.status()).toBe(404);
  });

  test("un restaurante sin platos listos responde 200 y avisa", async ({ page, request }) => {
    const crudo = await request.get(`/${slugSinPlatos}`);
    expect(crudo.status()).toBe(200);

    await page.goto(`/${slugSinPlatos}`);
    await expect(page.getByText("Estamos preparando la carta")).toBeVisible();
    // El nombre sigue estando: vacio no es lo mismo que roto.
    await expect(page.locator("h1")).toHaveText("Parrilla que abre pronto");
  });
});
