import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { limpiarFilasDeTest, serviceClient, testSlug } from "../helpers/supabase-clients.ts";

/**
 * El esquema, contra la base real.
 *
 * Afirma PROPIEDADES por entidad, nunca un conteo de tablas: "hay 4 tablas" se
 * desactualiza el dia que el esquema crece; "cada entidad del modelo responde" no.
 *
 * Todo lo que se crea aca lleva el prefijo `__test_` y se borra en afterAll.
 */

const db = serviceClient();
let restaurantId = "";
let categoryId = "";

beforeAll(async () => {
  const { data, error } = await db
    .from("restaurants")
    .insert({ slug: testSlug("schema"), name: "Restaurante de prueba" })
    .select("id")
    .single();
  expect(error).toBeNull();
  restaurantId = data?.id as string;

  const { data: cat, error: catError } = await db
    .from("categories")
    .insert({ restaurant_id: restaurantId, name: "Categoria de prueba", sort_order: 0 })
    .select("id")
    .single();
  expect(catError).toBeNull();
  categoryId = cat?.id as string;
});

afterAll(async () => {
  await limpiarFilasDeTest();
});

describe("entidades del modelo", () => {
  it.each(["restaurants", "categories", "dishes", "profiles"])(
    "la entidad %s responde sin error",
    async (tabla) => {
      const { error } = await db.from(tabla).select("id").limit(1);

      expect(error).toBeNull();
    },
  );
});

describe("precios como enteros", () => {
  it("devuelve 1350000 exactamente, sin pasar por float", async () => {
    const { data, error } = await db
      .from("dishes")
      .insert({
        restaurant_id: restaurantId,
        category_id: categoryId,
        name: "Plato caro",
        price: 1_350_000,
      })
      .select("id, price")
      .single();

    expect(error).toBeNull();
    expect(data?.price).toBe(1_350_000);
    expect(Number.isInteger(data?.price)).toBe(true);

    const { data: releido } = await db
      .from("dishes")
      .select("price")
      .eq("id", data?.id as string)
      .single();
    expect(releido?.price).toBe(1_350_000);
  });

  it("rechaza un precio negativo", async () => {
    const { error } = await db.from("dishes").insert({
      restaurant_id: restaurantId,
      category_id: categoryId,
      name: "Plato imposible",
      price: -1,
    });

    expect(error).not.toBeNull();
  });
});

describe("constraint de primary_color", () => {
  it("rechaza un color que no es hex y no cambia la cantidad de filas", async () => {
    const { count: antes } = await db
      .from("restaurants")
      .select("id", { count: "exact", head: true });

    const { error } = await db
      .from("restaurants")
      .insert({ slug: testSlug("color"), name: "Color invalido", primary_color: "rojo" });

    expect(error).not.toBeNull();
    // 23514 = check_violation. Afirmamos el codigo, no el texto del mensaje:
    // el texto cambia entre versiones de Postgres.
    expect(error?.code).toBe("23514");

    const { count: despues } = await db
      .from("restaurants")
      .select("id", { count: "exact", head: true });
    expect(despues).toBe(antes);
  });

  it("acepta un hex de 6 digitos", async () => {
    const { data, error } = await db
      .from("restaurants")
      .insert({ slug: testSlug("okcolor"), name: "Color valido", primary_color: "#123ABC" })
      .select("primary_color")
      .single();

    expect(error).toBeNull();
    expect(data?.primary_color).toBe("#123ABC");
  });
});

describe("borrado de categoria con platos", () => {
  it("se bloquea, y la categoria y sus platos siguen en la base", async () => {
    const { data: plato } = await db
      .from("dishes")
      .insert({
        restaurant_id: restaurantId,
        category_id: categoryId,
        name: "Plato que bloquea",
        price: 1000,
      })
      .select("id")
      .single();

    const { error } = await db.from("categories").delete().eq("id", categoryId);

    expect(error).not.toBeNull();
    // 23503 = foreign_key_violation, que es lo que produce ON DELETE RESTRICT.
    expect(error?.code).toBe("23503");

    const { data: categoriaViva } = await db
      .from("categories")
      .select("id")
      .eq("id", categoryId)
      .single();
    expect(categoriaViva?.id).toBe(categoryId);

    const { data: platoVivo } = await db
      .from("dishes")
      .select("id")
      .eq("id", plato?.id as string)
      .single();
    expect(platoVivo?.id).toBe(plato?.id);
  });
});

describe("valores por defecto", () => {
  it("un plato nuevo arranca en video_status pending y disponible", async () => {
    const { data, error } = await db
      .from("dishes")
      .insert({
        restaurant_id: restaurantId,
        category_id: categoryId,
        name: "Plato por defecto",
        price: 500,
      })
      .select("video_status, is_available, description")
      .single();

    expect(error).toBeNull();
    expect(data?.video_status).toBe("pending");
    expect(data?.is_available).toBe(true);
    expect(data?.description).toBe("");
  });

  it("rechaza un video_status fuera del conjunto permitido", async () => {
    const { error } = await db.from("dishes").insert({
      restaurant_id: restaurantId,
      category_id: categoryId,
      name: "Estado invalido",
      price: 500,
      video_status: "listo",
    });

    expect(error?.code).toBe("23514");
  });
});
