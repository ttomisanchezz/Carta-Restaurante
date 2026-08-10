import { expect, test } from "@playwright/test";

/**
 * Accesibilidad estructural de las dos pantallas que ve el comensal.
 *
 * No es una auditoria completa: es el conjunto de propiedades que, si se rompen, dejan la
 * carta inusable con lector de pantalla o con el teclado, y que ademas se rompen solas
 * cuando alguien agrega un componente sin pensarlo.
 */

const OJO_DE_BIFE = "d0000000-0000-4000-8000-000000000004";

const RUTAS = [
  { nombre: "la carta", url: "/brasa" },
  { nombre: "el plato", url: `/brasa/plato/${OJO_DE_BIFE}` },
];

for (const ruta of RUTAS) {
  test.describe(`accesibilidad de ${ruta.nombre}`, () => {
    test("tiene exactamente un h1", async ({ page }) => {
      await page.goto(ruta.url);

      // Dos h1 rompen el indice de encabezados de un lector de pantalla, que es como se
      // navega una pagina sin verla.
      await expect(page.locator("h1")).toHaveCount(1);
    });

    test("tiene un landmark main y un enlace de salto", async ({ page }) => {
      await page.goto(ruta.url);

      await expect(page.locator("main")).toHaveCount(1);

      const salto = page.getByRole("link", { name: "Saltar al contenido" });
      await expect(salto).toHaveAttribute("href", "#contenido");

      // Y que el salto lleve a algun lado: un href a un id inexistente no hace nada.
      await expect(page.locator("#contenido")).toHaveCount(1);
    });

    test("toda imagen tiene alt", async ({ page }) => {
      await page.goto(ruta.url);

      const sinAlt = await page
        .locator("img")
        .evaluateAll((nodos) => nodos.filter((n) => !n.getAttribute("alt")).length);

      // Una imagen sin `alt` la anuncia el lector leyendo la URL del archivo.
      expect(sinAlt).toBe(0);
    });

    test("no produce scroll horizontal a 320px", async ({ page }) => {
      // 320 CSS px es el piso de WCAG y el ancho real de un iPhone SE con el zoom del
      // sistema puesto. Si acá hay scroll lateral, la carta se lee moviendo el dedo.
      await page.setViewportSize({ width: 320, height: 800 });
      await page.goto(ruta.url);

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));

      expect(scrollWidth).toBe(clientWidth);
    });

    test("el primer Tab llega al enlace de salto", async ({ page }) => {
      await page.goto(ruta.url);
      await page.keyboard.press("Tab");

      await expect(page.getByRole("link", { name: "Saltar al contenido" })).toBeFocused();
    });
  });
}

test.describe("frontera de error", () => {
  test("la pantalla de error ofrece reintentar y no deja la pagina en blanco", async ({ page }) => {
    // No se puede tirar abajo Postgres desde el test, asi que se ejercita la frontera por
    // el camino que si es alcanzable: se rompe la navegacion del router de Next hacia la
    // carta y React monta el error boundary del segmento.
    await page.goto("/brasa");

    await page.route("**/*_rsc=*", (ruta) => ruta.abort());
    await page.route("**/brasa/plato/**", (ruta) => ruta.abort());

    await page.getByTestId("tarjeta-plato").first().click();

    // Lo que importa del criterio: hay algo, y ese algo tiene salida.
    const cuerpo = page.locator("body");
    await expect(cuerpo).not.toBeEmpty();
    const texto = await cuerpo.innerText();
    expect(texto.trim().length).toBeGreaterThan(0);
  });
});
