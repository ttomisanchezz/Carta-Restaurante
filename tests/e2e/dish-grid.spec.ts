import { expect, test } from "@playwright/test";

/**
 * La grilla de BRASA: doce posters, ningun video, y el filtro por categoria.
 *
 * Todo sale del seed, asi que este archivo no crea ni borra nada.
 */

test.describe("grilla de platos", () => {
  test("renderiza las 12 tarjetas, cada una con su poster medido y descrito", async ({ page }) => {
    await page.goto("/brasa");

    const tarjetas = page.getByTestId("tarjeta-plato");
    await expect(tarjetas).toHaveCount(12);

    const imagenes = page.locator("[data-testid='tarjeta-plato'] img");
    await expect(imagenes).toHaveCount(12);

    // `width` y `height` en el HTML reservan el espacio antes de que baje la imagen: sin
    // eso la grilla salta cuando cargan los posters y el comensal toca el plato que no era.
    const atributos = await imagenes.evaluateAll((nodos) =>
      nodos.map((n) => ({
        alt: n.getAttribute("alt") ?? "",
        width: n.getAttribute("width"),
        height: n.getAttribute("height"),
      })),
    );

    for (const img of atributos) {
      expect(img.alt.length).toBeGreaterThan(0);
      expect(img.width).not.toBeNull();
      expect(img.height).not.toBeNull();
    }
  });

  test("el poster de cada tarjeta se ve, aunque haya video encima", async ({ page }) => {
    // Este test reemplaza a uno que exigia CERO videos en la grilla. La regla cambio a
    // pedido: ahora la grilla reproduce. Lo que no cambio es el motivo por el que aquella
    // regla existia, asi que lo que se afirma ahora es el freno, no la ausencia.
    await page.goto("/brasa");

    // El poster esta desde el principio en las doce, reproduzcan o no.
    await expect(page.getByTestId("poster-tarjeta")).toHaveCount(12);
    await expect(page.getByTestId("poster-tarjeta").first()).toBeVisible();
  });

  test("no reproduce las doce a la vez", async ({ page }) => {
    await page.goto("/brasa");
    await expect(page.getByTestId("tarjeta-plato")).toHaveCount(12);
    // Tiempo para que el observador arranque lo que esta en pantalla.
    await page.waitForTimeout(3000);

    const reproduciendo = await page.evaluate(
      () => [...document.querySelectorAll("video")].filter((v) => !v.paused).length,
    );

    // El limite del componente es 3. Que sea 0 tambien es valido: en un navegador sin los
    // codecs, o si los videos no cargan, el poster se queda y eso es lo correcto.
    expect(reproduciendo).toBeLessThanOrEqual(3);
  });

  test("la primera fila se pide con prioridad y el resto perezoso", async ({ page }) => {
    await page.goto("/brasa");

    const cargas = await page
      .locator("[data-testid='tarjeta-plato'] img")
      .evaluateAll((nodos) => nodos.map((n) => n.getAttribute("loading")));

    // Dos columnas: las dos primeras son la primera fila.
    expect(cargas.slice(0, 2)).toEqual(["eager", "eager"]);
    expect(cargas.slice(2).every((c) => c === "lazy")).toBe(true);
  });

  test("un chip de categoria deja solo sus platos y se marca como actual", async ({ page }) => {
    await page.goto("/brasa");

    const chips = page.getByTestId("chip-categoria");
    // "Todo" mas las cuatro categorias del seed.
    await expect(chips).toHaveCount(5);

    const deLaParrilla = chips.filter({ hasText: "De la parrilla" });
    await deLaParrilla.click();

    await expect(deLaParrilla).toHaveAttribute("aria-current", "true");
    // Cuatro platos en esa categoria del seed, y ninguno mas.
    await expect(page.getByTestId("tarjeta-plato")).toHaveCount(4);
    await expect(page.getByText("Ojo de bife 400g")).toBeVisible();
    await expect(page.getByText("Flan mixto")).toHaveCount(0);

    // Y solo un chip puede ser el actual a la vez.
    await expect(page.locator("[data-testid='chip-categoria'][aria-current='true']")).toHaveCount(
      1,
    );
  });

  test("volver a Todo devuelve las 12", async ({ page }) => {
    await page.goto("/brasa");

    await page.getByTestId("chip-categoria").filter({ hasText: "Postres" }).click();
    await expect(page.getByTestId("tarjeta-plato")).toHaveCount(2);

    await page.getByTestId("chip-categoria").filter({ hasText: "Todo" }).click();
    await expect(page.getByTestId("tarjeta-plato")).toHaveCount(12);
  });

  test("el precio sale formateado con el contrato del proyecto", async ({ page }) => {
    await page.goto("/brasa");

    // El ojo de bife son 2890000 centavos.
    await expect(page.getByText("$ 28.900,00")).toBeVisible();
  });
});
