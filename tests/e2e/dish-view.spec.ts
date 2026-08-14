import { expect, test } from "@playwright/test";

/**
 * El plato a pantalla completa. Todo sale del seed de BRASA, con ids fijos.
 */

// Ojo de bife: 2890000 centavos, el primero de "De la parrilla".
const OJO_DE_BIFE = "d0000000-0000-4000-8000-000000000004";
const NO_EXISTE = "d0000000-0000-4000-8000-000000000099";

test.describe("vista de plato", () => {
  test("una tarjeta abre el modal sin cambiar la URL y la ruta directa sigue disponible", async ({
    page,
  }) => {
    await page.goto("/brasa");
    const urlCarta = page.url();
    const tarjeta = page.getByTestId("tarjeta-plato").first();
    const nombre = await tarjeta.getAttribute("data-nombre");

    await tarjeta.click();

    await expect(page).toHaveURL(urlCarta);
    const modal = page.getByTestId("modal-plato");
    await expect(modal).toBeVisible();
    await expect(modal.getByRole("heading", { level: 2 })).toHaveText(nombre ?? "");

    await page.getByTestId("cerrar-modal-plato").click();
    await expect(modal).toHaveCount(0);

    // La ruta individual no depende del estado del modal y sigue abriendo en frio.
    await page.goto(`/brasa/plato/${OJO_DE_BIFE}`);
    await expect(page.locator("h1")).toHaveText("Ojo de bife 400g");
  });

  test("un toque sobre el video de la tarjeta llega al enlace y abre el plato", async ({
    page,
  }) => {
    await page.goto("/brasa");
    const tarjeta = page.getByTestId("tarjeta-plato").first();
    const medio = tarjeta.locator(".tarjeta-medio");

    // En Safari movil un <video> puede consumir el toque aunque no tenga controles. El
    // medio completo es decorativo y no debe ser el destino del puntero.
    await expect(medio).toHaveCSS("pointer-events", "none");
    await tarjeta.locator("a").click({ position: { x: 20, y: 20 } });

    await expect(page.getByTestId("modal-plato")).toBeVisible();
  });

  test("cada tarjeta expone la direccion real del plato, para poder compartirla", async ({
    page,
  }) => {
    /*
     * Esto ya se rompio una vez: la tarjeta paso a ser un `<button>` y el modal siguio
     * funcionando, asi que ningun test se puso en rojo — pero la ruta del plato quedo sin
     * un solo enlace que llevara a ella. El comensal perdio "copiar direccion" y "abrir en
     * pestaña nueva", y el plato dejo de ser algo que se le pueda mandar a alguien.
     *
     * Por eso se afirma el `href` y no el comportamiento del click: el click ya lo cubre el
     * test de arriba, y lo que se perdio aquella vez fue exactamente este atributo.
     */
    await page.goto("/brasa");

    const enlace = page.getByTestId("tarjeta-plato").first().locator("a");
    await expect(enlace).toHaveAttribute("href", /^\/brasa\/plato\/[0-9a-f-]{36}$/);

    // Y la direccion que publica no es decorativa: abierta en frio muestra el plato.
    const href = await enlace.getAttribute("href");
    await page.goto(href ?? "");
    await expect(page.locator("h1")).toBeVisible();
  });

  test("al abrir el modal libera el video de la tarjeta de origen", async ({ page }) => {
    await page.goto("/brasa");
    const tarjeta = page.getByTestId("tarjeta-plato").first();
    const videoOrigen = tarjeta.getByTestId("video-tarjeta");

    // Fuente y toque en la misma tarea: el IntersectionObserver no alcanza a liberar la
    // fuente de prueba antes de que el modal sea quien tenga que hacerlo.
    //
    // El control de la tarjeta es un `<a>` y no un `<button>`: el plato tiene que seguir
    // siendo una direccion que se pueda copiar y mandar. Un `.click()` programatico llega
    // sin modificadores y con `button` en 0, que es justo el caso que el handler intercepta
    // para abrir el modal en vez de navegar.
    await tarjeta.evaluate((elemento) => {
      elemento.querySelector("video")?.setAttribute("src", "/clip-prueba.mp4");
      elemento.querySelector("a")?.click();
    });

    await expect(page.getByTestId("modal-plato")).toBeVisible();
    await expect(videoOrigen).not.toHaveAttribute("src", /.+/);
    await expect(videoOrigen).toHaveJSProperty("paused", true);
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
