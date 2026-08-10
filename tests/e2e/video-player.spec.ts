import { expect, test } from "@playwright/test";

/**
 * El reproductor del plato.
 *
 * En esta suite `VIDEO_PROVIDER` es `direct` y el seed apunta a `seed/<slug>`, una ruta
 * que NO tiene archivo de video detras — solo el poster SVG. Eso no es un descuido del
 * fixture: hace que el camino de error sea el camino real y se pruebe de verdad, sin
 * mocks y sin salir a la red.
 */

const OJO_DE_BIFE = "d0000000-0000-4000-8000-000000000004";
const RUTA_PLATO = `/brasa/plato/${OJO_DE_BIFE}`;

test.describe("reproductor", () => {
  test("el poster se ve desde el principio, antes de que haya video", async ({ page }) => {
    await page.goto(RUTA_PLATO);

    const poster = page.getByTestId("poster-plato");
    await expect(poster).toBeVisible();
    // Opacidad plena: el poster no es un placeholder tapado por un cuadro negro.
    await expect(poster).toHaveCSS("opacity", "1");
  });

  test("el video arranca muteado y hay un control de sonido visible", async ({ page }) => {
    await page.goto(RUTA_PLATO);

    const video = page.getByTestId("video-plato");
    await expect(video).toHaveJSProperty("muted", true);

    // Un video que suena solo en una mesa de restaurante es una razon para cerrar la carta.
    const sonido = page.getByTestId("alternar-sonido");
    await expect(sonido).toBeVisible();
    await expect(sonido).toHaveAttribute("aria-pressed", "false");
  });

  test("el control de sonido desmutea de verdad", async ({ page }) => {
    await page.goto(RUTA_PLATO);

    await page.getByTestId("alternar-sonido").click();

    await expect(page.getByTestId("video-plato")).toHaveJSProperty("muted", false);
    await expect(page.getByTestId("alternar-sonido")).toHaveAttribute("aria-pressed", "true");
  });

  test("si el video no carga, el poster se queda y aparece el aviso con reintento", async ({
    page,
  }) => {
    await page.goto(RUTA_PLATO);

    const error = page.getByTestId("error-video");
    await expect(error).toBeVisible();
    await expect(error).toContainText("No pudimos cargar el video");
    await expect(page.getByTestId("reintentar-video")).toBeVisible();

    // Lo importante del camino de error: nunca un cuadro negro.
    await expect(page.getByTestId("poster-plato")).toHaveCSS("opacity", "1");
  });

  test("el boton de reintento vuelve a intentar", async ({ page }) => {
    await page.goto(RUTA_PLATO);
    await expect(page.getByTestId("error-video")).toBeVisible();

    await page.getByTestId("reintentar-video").click();

    // Vuelve a fallar, porque el archivo sigue sin existir — pero volvio a intentar y no
    // se quedo colgado ni rompio la pantalla.
    await expect(page.getByTestId("error-video")).toBeVisible();
    await expect(page.getByTestId("poster-plato")).toBeVisible();
  });

  test("con prefers-reduced-motion no reproduce solo y ofrece un boton de play", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(RUTA_PLATO);

    const play = page.getByTestId("reproducir-video");
    await expect(play).toBeVisible();

    // Nada de autoplay: hay gente a la que el movimiento automatico le produce nauseas.
    await expect(page.getByTestId("video-plato")).toHaveJSProperty("paused", true);
    await expect(page.getByTestId("poster-plato")).toHaveCSS("opacity", "1");
  });

  test("la grilla no pide ningun manifiesto de video", async ({ page }) => {
    const manifiestos: string[] = [];
    page.on("request", (r) => {
      if (r.url().endsWith(".m3u8")) manifiestos.push(r.url());
    });

    await page.goto("/brasa");
    await expect(page.getByTestId("tarjeta-plato")).toHaveCount(12);

    // Doce manifiestos en paralelo sobre datos moviles es la forma mas rapida de que no se
    // vea ninguno. El video se pide recien al abrir el plato.
    expect(manifiestos).toEqual([]);
  });
});
