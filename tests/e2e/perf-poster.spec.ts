import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Presupuesto del poster sobre red lenta.
 *
 * Corre en el proyecto `slow-4g` de playwright.config.ts, que lo aisla del resto. El
 * throttling lo aplica el propio spec por CDP: Playwright no tiene una API de red lenta,
 * y sin throttling este test mide la velocidad del disco local y no dice nada.
 *
 * Por que importa: el primer poster visible ES la metrica del producto. Un comensal con
 * una mesa, hambre y datos moviles no espera cuatro segundos mirando gris.
 */

const KBPS_400 = (400 * 1000) / 8;
const LATENCIA_MS = 300;
const PRESUPUESTO_DECODE_MS = 4000;
const PRESUPUESTO_BYTES_POR_POSTER = 60 * 1024;

test("el primer poster se decodifica en menos de 4 segundos a 400 kbps", async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: LATENCIA_MS,
    downloadThroughput: KBPS_400,
    uploadThroughput: KBPS_400,
  });

  const arranque = Date.now();
  // `commit` y no el `load` por defecto: lo que mide el criterio es cuando el comensal ve
  // el primer poster, no cuando termino de bajar hasta el ultimo script. Esperar `load`
  // metria en la cuenta todo el JavaScript de hidratacion, que llega despues del pixel y
  // no lo bloquea — el `<img>` viaja en el HTML del servidor con fetchpriority alta.
  await page.goto("/brasa", { waitUntil: "commit" });

  // `decode()` y no `load`: lo que le importa al ojo es cuando el pixel esta listo para
  // pintarse, no cuando termino de bajar el byte.
  await page
    .locator("[data-testid='tarjeta-plato'] img")
    .first()
    .evaluate(async (img) => {
      const imagen = img as HTMLImageElement;
      if (!imagen.complete) {
        await new Promise((r) => {
          imagen.addEventListener("load", r, { once: true });
          imagen.addEventListener("error", r, { once: true });
        });
      }
      await imagen.decode().catch(() => undefined);
    });

  const transcurrido = Date.now() - arranque;
  console.log(`[medicion] primer poster en /brasa a 400 kbps: ${transcurrido} ms`);
  expect(transcurrido).toBeLessThan(PRESUPUESTO_DECODE_MS);
});

/**
 * El mismo presupuesto, pero sobre la ruta de mesa: la carta CON carrito y polling encima.
 *
 * Es la que de verdad importa, porque es la que abre el comensal al escanear el QR, y es la
 * que Fase 2 hizo mas pesada: suma el proveedor de carrito, la barra, el bloque de estado y
 * un `setInterval`. Ademas dejo de ser una ruta revalidada cada 60s para pasar a
 * `force-dynamic`, asi que cada carga resuelve la cuenta contra Postgres antes de responder.
 *
 * Se mide contra BRASA —12 platos reales, posters reales— con una mesa temporal que se borra
 * al terminar. Medir contra un restaurante de prueba con dos platos daria un numero lindo y
 * mentiroso.
 */
test.describe("la ruta de mesa", () => {
  let db: SupabaseClient;
  let tableId = "";
  let token = "";

  test.beforeAll(async () => {
    db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE_KEY as string,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data: brasa } = await db.from("restaurants").select("id").eq("slug", "brasa").single();

    const { data: mesa } = await db
      .from("restaurant_tables")
      .insert({ restaurant_id: brasa?.id, label: "zzz-test-perf" })
      .select("id, token")
      .single();

    tableId = mesa?.id as string;
    token = mesa?.token as string;
  });

  test.afterAll(async () => {
    // Con la clave de servicio, que saltea RLS: la tabla no tiene policy de delete.
    if (tableId) await db.from("restaurant_tables").delete().eq("id", tableId);
  });

  test("el primer poster se decodifica en menos de 4 segundos a 400 kbps", async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: LATENCIA_MS,
      downloadThroughput: KBPS_400,
      uploadThroughput: KBPS_400,
    });

    const arranque = Date.now();
    await page.goto(`/brasa/mesa/${token}`, { waitUntil: "commit" });

    await page
      .locator("[data-testid='tarjeta-plato'] img")
      .first()
      .evaluate(async (img) => {
        const imagen = img as HTMLImageElement;
        if (!imagen.complete) {
          await new Promise((r) => {
            imagen.addEventListener("load", r, { once: true });
            imagen.addEventListener("error", r, { once: true });
          });
        }
        await imagen.decode().catch(() => undefined);
      });

    const transcurrido = Date.now() - arranque;
    console.log(`[medicion] primer poster en /brasa/mesa/<token> a 400 kbps: ${transcurrido} ms`);
    expect(transcurrido).toBeLessThan(PRESUPUESTO_DECODE_MS);
  });
});

test("ningun poster de la grilla pasa de 60 KB", async ({ page }) => {
  const pesos = new Map<string, number>();

  /**
   * Se filtra por lo que las tarjetas piden DE VERDAD, no por una carpeta.
   *
   * Antes miraba `/seed/`, que era donde vivian los posters guardados. Ya no hay posters
   * guardados: `thumbnail_url` es null y el poster lo deriva el proveedor del propio video
   * — un `.jpg` de Cloudinary en produccion, el `.svg` de respaldo con el proveedor
   * `direct`. Un filtro por carpeta no encontraba ninguno de los dos y el test pasaba
   * midiendo cero posters, que es la peor forma de estar en verde.
   */
  const esPoster = (url: string) => /\.(svg|jpg|jpeg|webp|avif|png)(\?|$)/.test(url);

  page.on("response", async (respuesta) => {
    const url = respuesta.url();
    if (!esPoster(url)) return;
    const cuerpo = await respuesta.body().catch(() => null);
    if (cuerpo) pesos.set(url, cuerpo.length);
  });

  await page.goto("/brasa");
  await expect(page.getByTestId("tarjeta-plato")).toHaveCount(12);
  // Los posters perezosos no bajan hasta que entran en pantalla; se fuerza el recorrido
  // para medir los doce y no solo los dos de la primera fila.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForLoadState("networkidle");

  expect(pesos.size).toBeGreaterThan(0);
  for (const [url, bytes] of pesos) {
    expect(bytes, `${url} pesa ${bytes} bytes`).toBeLessThan(PRESUPUESTO_BYTES_POR_POSTER);
  }
});
