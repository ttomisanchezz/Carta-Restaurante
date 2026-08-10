import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  bajarPlato,
  crearPlato,
  duplicarPlato,
  listarPlatos,
  parsearPrecioACentavos,
} from "@/server/admin/dishes";
import type { ContextoAdmin } from "@/server/admin/resultado";
import {
  type EscenarioDeAislamiento,
  seedTwoRestaurants,
} from "../helpers/seed-two-restaurants.ts";
import { anonClient, authedClient, serviceClient } from "../helpers/supabase-clients.ts";

const db = serviceClient();
let escenario: EscenarioDeAislamiento;
let comoA: ContextoAdmin;

beforeAll(async () => {
  escenario = await seedTwoRestaurants();
  comoA = {
    db: await authedClient(escenario.ownerA.email, escenario.ownerA.password),
    sesion: { userId: escenario.ownerA.userId, restaurantId: escenario.a.id, role: "owner" },
  };
});

afterAll(async () => {
  await escenario.cleanup();
});

describe("parseo de precio", () => {
  it("la coma es el decimal y el punto separa miles", () => {
    expect(parsearPrecioACentavos("13500,50")).toBe(1_350_050);
    expect(parsearPrecioACentavos("13.500,50")).toBe(1_350_050);
    expect(parsearPrecioACentavos("13500")).toBe(1_350_000);
  });

  it("sin coma, un punto con uno o dos digitos detras es decimal", () => {
    // Es lo que sale de teclear en un teclado numerico.
    expect(parsearPrecioACentavos("13500.50")).toBe(1_350_050);
    expect(parsearPrecioACentavos("13500.5")).toBe(1_350_050);
  });

  it("sin coma, un punto con tres digitos detras separa miles", () => {
    // `13.500` son trece mil quinientos, no trece con medio.
    expect(parsearPrecioACentavos("13.500")).toBe(1_350_000);
  });

  it("devuelve null con lo que no es un precio", () => {
    expect(parsearPrecioACentavos("gratis")).toBeNull();
    expect(parsearPrecioACentavos("")).toBeNull();
    expect(parsearPrecioACentavos(null)).toBeNull();
  });
});

describe("crear plato", () => {
  it("guarda 13500,50 como el entero 1350050", async () => {
    const resultado = await crearPlato(
      { category_id: escenario.a.categoryId, name: "Con coma", price: "13500,50" },
      comoA,
    );

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    const { data } = await db.from("dishes").select("price").eq("id", resultado.data.id).single();
    expect(data?.price).toBe(1_350_050);
    expect(Number.isInteger(data?.price)).toBe(true);
  });

  it("rechaza un precio negativo y no inserta nada", async () => {
    const { count: antes } = await db
      .from("dishes")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", escenario.a.id);

    const resultado = await crearPlato(
      { category_id: escenario.a.categoryId, name: "Precio negativo", price: "-100" },
      comoA,
    );

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.code).toBe("validation_error");

    const { count: despues } = await db
      .from("dishes")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", escenario.a.id);
    expect(despues).toBe(antes);
  });

  it("una categoria de otro restaurante da not_found y no inserta nada", async () => {
    const { count: antes } = await db
      .from("dishes")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", escenario.b.id);

    const resultado = await crearPlato(
      { category_id: escenario.b.categoryId, name: "Plato colado", price: "1000" },
      comoA,
    );

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.code).toBe("not_found");

    const { count: despues } = await db
      .from("dishes")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", escenario.b.id);
    expect(despues).toBe(antes);
  });
});

describe("duplicar plato", () => {
  it("crea una fila nueva con los mismos datos pero sin video", async () => {
    const { data: original } = await db
      .from("dishes")
      .select("category_id, price, description")
      .eq("id", escenario.a.platoListoId)
      .single();

    const resultado = await duplicarPlato({ id: escenario.a.platoListoId }, comoA);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    const { data: copia } = await db
      .from("dishes")
      .select("category_id, price, description, video_status, video_playback_id")
      .eq("id", resultado.data.id)
      .single();

    expect(copia?.category_id).toBe(original?.category_id);
    expect(copia?.price).toBe(original?.price);
    expect(copia?.description).toBe(original?.description);
    // Sin video propio: copiar el playback id haria que dos platos distintos mostraran
    // el mismo video.
    expect(copia?.video_status).toBe("pending");
    expect(copia?.video_playback_id).toBeNull();
  });

  it("el duplicado no aparece en la carta publica hasta tener su video", async () => {
    const resultado = await duplicarPlato({ id: escenario.a.platoListoId }, comoA);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    const anon = anonClient();
    const { data } = await anon.from("dishes").select("id").eq("id", resultado.data.id);

    // No lo tapa un `if` de la aplicacion: lo tapa la policy, que exige ready.
    expect(data).toEqual([]);
  });

  it("no se puede duplicar el plato de otro restaurante", async () => {
    const { count: antes } = await db
      .from("dishes")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", escenario.b.id);

    const resultado = await duplicarPlato({ id: escenario.b.platoListoId }, comoA);

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.code).toBe("not_found");

    const { count: despues } = await db
      .from("dishes")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", escenario.b.id);
    expect(despues).toBe(antes);
  });
});

describe("reordenar platos", () => {
  it("bajar un plato lo intercambia con el siguiente de su categoria", async () => {
    const antes = (await listarPlatos(comoA)).filter(
      (p) => p.category_id === escenario.a.categoryId,
    );
    expect(antes.length).toBeGreaterThanOrEqual(2);

    const primero = antes[0];
    const segundo = antes[1];

    const resultado = await bajarPlato({ id: primero.id }, comoA);
    expect(resultado.ok).toBe(true);

    const despues = (await listarPlatos(comoA)).filter(
      (p) => p.category_id === escenario.a.categoryId,
    );
    expect(despues[0].id).toBe(segundo.id);
    expect(despues[1].id).toBe(primero.id);
  });

  it("bajar el ultimo no cambia nada y no es un error", async () => {
    const platos = (await listarPlatos(comoA)).filter(
      (p) => p.category_id === escenario.a.categoryId,
    );
    const ultimo = platos[platos.length - 1];

    const resultado = await bajarPlato({ id: ultimo.id }, comoA);

    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.data.movido).toBe(false);

    const despues = (await listarPlatos(comoA)).filter(
      (p) => p.category_id === escenario.a.categoryId,
    );
    expect(despues.map((p) => p.id)).toEqual(platos.map((p) => p.id));
  });

  it("no se puede reordenar el plato de otro restaurante", async () => {
    const { data: antes } = await db
      .from("dishes")
      .select("sort_order")
      .eq("id", escenario.b.platoListoId)
      .single();

    const resultado = await bajarPlato({ id: escenario.b.platoListoId }, comoA);

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.code).toBe("not_found");

    const { data: despues } = await db
      .from("dishes")
      .select("sort_order")
      .eq("id", escenario.b.platoListoId)
      .single();
    expect(despues?.sort_order).toBe(antes?.sort_order);
  });
});
