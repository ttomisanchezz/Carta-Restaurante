import { expect, test } from "@playwright/test";

/**
 * El plato a pantalla completa. Todo sale del seed de BRASA, con ids fijos.
 */

// Ojo de bife: 2890000 centavos, el primero de "De la parrilla".
const OJO_DE_BIFE = "d0000000-0000-4000-8000-000000000004";
const NO_EXISTE = "d0000000-0000-4000-8000-000000000099";

test.describe("vista de plato", () => {
  test("se llega tocando una tarjeta y la URL sola alcanza para volver a verlo", async ({
    page,
  }) => {
    await page.goto("/brasa");
    await page.getByTestId("tarjeta-plato").first().click();

    await expect(page).toHaveURL(/\/brasa\/plato\/[0-9a-f-]{36}$/);
    const url = page.url();
    const nombre = await page.locator("h1").textContent();

    // Recarga en frio: el plato es una ruta, no un estado de la grilla.
    await page.goto(url);
    await expect(page.locator("h1")).toHaveText(nombre ?? "");
  });

  test("muestra nombre, precio formateado, descripcion y maridaje", async ({ page }) => {
    await page.goto(`/brasa/plato/${OJO_DE_BIFE}`);

    await expect(page.locator("h1")).toHaveText("Ojo de bife 400g");
    await expect(page.getByTestId("precio-plato")).toHaveText("$ 28.900,00");
    await expect(page.getByText(/marmoleo parejo/)).toBeVisible();
    await expect(page.getByTestId("maridaje")).toBeVisible();
  });

  test("el maridaje va en un blockquote y con el nombre del restaurante", async ({ page }) => {
    await page.goto(`/brasa/plato/${OJO_DE_BIFE}`);

    const maridaje = page.getByTestId("maridaje");
    // Es lo unico que ninguna carta en PDF tiene: tiene que ser una cita, no un parrafo.
    expect(await maridaje.evaluate((n) => n.tagName.toLowerCase())).toBe("blockquote");
    await expect(maridaje).toContainText("Pedilo jugoso");
    await expect(maridaje).toContainText("BRASA");
  });

  test("un id que no existe responde 404", async ({ request }) => {
    const r = await request.get(`/brasa/plato/${NO_EXISTE}`);
    expect(r.status()).toBe(404);
  });

  test("un plato de otro restaurante bajo este slug responde 404", async ({ request }) => {
    // El plato existe y esta listo, pero es de otro restaurante. Que no aparezca no
    // depende de un `if`: no esta en la carta de este slug, y punto.
    const otro = await crearPlatoDeOtroRestaurante(request);
    try {
      const r = await request.get(`/brasa/plato/${otro.dishId}`);
      expect(r.status()).toBe(404);

      // Y bajo su propio slug si responde: asi el 404 de arriba es aislamiento y no una
      // fila que nunca existio.
      const propio = await request.get(`/${otro.slug}/plato/${otro.dishId}`);
      expect(propio.status()).toBe(200);
    } finally {
      await otro.limpiar();
    }
  });

  test("el control de cerrar vuelve a la carta", async ({ page }) => {
    await page.goto(`/brasa/plato/${OJO_DE_BIFE}`);
    await page.getByTestId("cerrar-plato").click();

    await expect(page).toHaveURL(/\/brasa$/);
    await expect(page.locator("h1")).toHaveText("BRASA");
  });
});

/** Monta un restaurante aparte con un plato listo. Devuelve como borrarlo. */
async function crearPlatoDeOtroRestaurante(request: import("@playwright/test").APIRequestContext) {
  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  void request;

  const slug = `zzz-test-vecino-${Math.random().toString(36).slice(2, 8)}`;
  const { data: rest } = await db
    .from("restaurants")
    .insert({ slug, name: "Parrilla vecina", is_active: true })
    .select("id")
    .single();
  const { data: cat } = await db
    .from("categories")
    .insert({ restaurant_id: rest?.id, name: "Principales", sort_order: 0 })
    .select("id")
    .single();
  const { data: plato } = await db
    .from("dishes")
    .insert({
      restaurant_id: rest?.id,
      category_id: cat?.id,
      name: "Plato del vecino",
      price: 100000,
      video_status: "ready",
      thumbnail_url: "/seed/provoleta.svg",
    })
    .select("id")
    .single();

  return {
    slug,
    dishId: plato?.id as string,
    limpiar: async () => {
      await db.from("dishes").delete().eq("restaurant_id", rest?.id);
      await db.from("categories").delete().eq("restaurant_id", rest?.id);
      await db.from("restaurants").delete().eq("id", rest?.id);
    },
  };
}
