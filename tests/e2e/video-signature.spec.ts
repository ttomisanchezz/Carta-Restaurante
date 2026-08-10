import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * El endpoint de firma, por HTTP.
 *
 * En esta suite `VIDEO_PROVIDER` es `direct`, asi que un pedido bien formado y con sesion
 * termina en 503 `provider_unavailable`. Eso NO es una limitacion del test: es el criterio
 * que dice que sin proveedor configurado el endpoint tiene que negarse limpio en vez de
 * intentar firmar con un secreto que no existe.
 *
 * Que el 422 se pruebe igual es lo que demuestra que la validacion corre ANTES que la
 * comprobacion del proveedor. Si corriera despues, un publicId invalido daria 503 y taparia
 * el problema real.
 */

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@carta.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "carta-admin-local";

const DISH_ID = "d0000000-0000-4000-8000-000000000004";

let db: SupabaseClient;

test.beforeAll(() => {
  db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
});

async function entrar(page: import("@playwright/test").Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/admin\/platos$/);
}

test.describe("POST /api/video/signature", () => {
  test("sin sesion responde 401 unauthorized", async ({ request }) => {
    const r = await request.post("/api/video/signature", {
      data: { dishId: DISH_ID, publicId: "ojo-de-bife" },
    });

    expect(r.status()).toBe(401);
    expect((await r.json()).error.code).toBe("unauthorized");
  });

  test("con sesion y un publicId con caracteres invalidos responde 422", async ({ page }) => {
    await entrar(page);

    // Desde la pagina, para que viaje la cookie de sesion.
    const respuesta = await page.evaluate(async (dishId) => {
      const r = await fetch("/api/video/signature", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dishId, publicId: "ojo de bife!" }),
      });
      return { status: r.status, cuerpo: await r.json() };
    }, DISH_ID);

    expect(respuesta.status).toBe(422);
    expect(respuesta.cuerpo.error.code).toBe("validation_error");
  });

  test("con sesion y el proveedor sin configurar responde 503", async ({ page }) => {
    await entrar(page);

    const respuesta = await page.evaluate(async (dishId) => {
      const r = await fetch("/api/video/signature", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dishId, publicId: "ojo-de-bife" }),
      });
      return { status: r.status, cuerpo: await r.json() };
    }, DISH_ID);

    expect(respuesta.status).toBe(503);
    expect(respuesta.cuerpo.error.code).toBe("provider_unavailable");
  });

  test("ninguna respuesta trae el secreto de Cloudinary", async ({ page }) => {
    await entrar(page);

    const cuerpos = await page.evaluate(async (dishId) => {
      const pedidos = [
        { dishId, publicId: "ojo-de-bife" },
        { dishId, publicId: "mal id!" },
        { noExiste: true },
      ];
      const salida: string[] = [];
      for (const cuerpo of pedidos) {
        const r = await fetch("/api/video/signature", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(cuerpo),
        });
        salida.push(await r.text());
      }
      return salida;
    }, DISH_ID);

    // El secreto no esta configurado en este entorno, pero el test igual sirve como red:
    // si alguien alguna vez agrega apiSecret al sobre de respuesta, el nombre del campo
    // aparece acá y salta.
    for (const cuerpo of cuerpos) {
      expect(cuerpo).not.toContain("apiSecret");
      expect(cuerpo).not.toContain("api_secret");
      expect(cuerpo).not.toContain("CLOUDINARY_API_SECRET");
    }
  });

  test("confirmar el video deja el plato en la carta publica", async ({ page }) => {
    // Sin cuenta de Cloudinary no se puede subir un archivo de verdad, asi que se prueba
    // el paso que SI depende de nosotros: que anotar el video haga visible el plato.
    const slug = `zzz-test-conf-${Math.random().toString(36).slice(2, 8)}`;
    const { data: rest } = await db
      .from("restaurants")
      .insert({ slug, name: "Confirmación de video" })
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
        name: "Plato sin video todavía",
        price: 500000,
        thumbnail_url: "/seed/provoleta.svg",
      })
      .select("id")
      .single();

    try {
      // Antes: pending, o sea invisible para el comensal.
      await page.goto(`/${slug}`);
      await expect(page.getByText("Estamos preparando la carta")).toBeVisible();

      await db
        .from("dishes")
        .update({ video_playback_id: "seed/provoleta", video_status: "ready" })
        .eq("id", plato?.id);

      await page.goto(`/${slug}`);
      await expect(page.getByText("Plato sin video todavía")).toBeVisible();
    } finally {
      await db.from("dishes").delete().eq("restaurant_id", rest?.id);
      await db.from("categories").delete().eq("restaurant_id", rest?.id);
      await db.from("restaurants").delete().eq("id", rest?.id);
    }
  });
});
