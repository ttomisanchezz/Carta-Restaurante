import { expect, test } from "@playwright/test";

/**
 * El shell: sin scroll horizontal en ningun ancho, y navegable con teclado.
 *
 * Los anchos NO se fijan aca: los proyectos `mobile` (375px) y `desktop` (1440px)
 * de playwright.config.ts corren este mismo archivo dos veces. Asi los criterios 4
 * y 5 quedan cubiertos sin duplicar el test.
 */

test.describe("shell", () => {
  test("no produce scroll horizontal", async ({ page }) => {
    await page.goto("/");

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));

    expect(scrollWidth).toBe(clientWidth);
  });

  test("el primer Tab enfoca el enlace de salto y lo hace visible", async ({ page }) => {
    await page.goto("/");
    // Sin clic previo: el criterio habla de la pagina RECIEN CARGADA. Un clic moveria
    // el punto de partida de la tabulacion y el test dejaria de probar lo que dice.
    await page.keyboard.press("Tab");

    const enlace = page.getByRole("link", { name: "Saltar al contenido" });

    await expect(enlace).toBeFocused();
    await expect(enlace).toBeVisible();

    // Visible de verdad: fuera de pantalla mientras no tiene foco, dentro cuando lo tiene.
    const caja = await enlace.boundingBox();
    expect(caja).not.toBeNull();
    expect(caja?.x ?? -1).toBeGreaterThanOrEqual(0);
  });

  test("el enlace de salto lleva al contenido principal", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("main#contenido")).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Saltar al contenido" })).toHaveAttribute(
      "href",
      "#contenido",
    );
  });

  test("el tema oscuro ya viene en el HTML del servidor", async ({ page }) => {
    await page.goto("/");

    // El fondo se resuelve al token, no a blanco: no hay destello de tema claro.
    // `--color-bg` es el carbon calido #14100D. Cuando cambie la paleta, cambia acá.
    const fondo = await page.evaluate(() =>
      getComputedStyle(document.body).backgroundColor.replace(/\s/g, ""),
    );

    expect(fondo).toBe("rgb(20,16,13)");
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
  });
});
