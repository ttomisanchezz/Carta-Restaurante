import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type EscenarioDeAislamiento,
  seedTwoRestaurants,
} from "../helpers/seed-two-restaurants.ts";
import { authedClient, serviceClient } from "../helpers/supabase-clients.ts";

/**
 * Aislamiento de ESCRITURA entre restaurantes.
 *
 * Cada afirmacion negativa se confirma dos veces: lo que le contesto el cliente de A, y el
 * estado real de la fila leido despues con el cliente de servicio.
 *
 * Las dos lecturas hacen falta porque **un UPDATE o un DELETE que RLS filtra no es un
 * error**: PostgREST contesta exito con cero filas afectadas. Si el test mirara solo el
 * error, pasaria igual el dia que la policy desaparezca. Lo que prueba que no paso nada es
 * la lectura posterior.
 */

const db = serviceClient();
let escenario: EscenarioDeAislamiento;
let comoA: SupabaseClient;

beforeAll(async () => {
  escenario = await seedTwoRestaurants();
  comoA = await authedClient(escenario.ownerA.email, escenario.ownerA.password);
});

afterAll(async () => {
  await escenario.cleanup();
});

describe("update sobre un plato ajeno", () => {
  it("deja el plato de B exactamente como estaba", async () => {
    const { data: antes } = await db
      .from("dishes")
      .select("*")
      .eq("id", escenario.b.platoListoId)
      .single();

    const { error } = await comoA
      .from("dishes")
      .update({ name: "Secuestrado por A", price: 1 })
      .eq("id", escenario.b.platoListoId);

    // Sin filas que tocar no hay error: RLS filtro el update antes de que existiera.
    expect(error).toBeNull();

    const { data: despues } = await db
      .from("dishes")
      .select("*")
      .eq("id", escenario.b.platoListoId)
      .single();

    // La fila entera, no solo los campos que se intentaron pisar: incluye `updated_at`,
    // que el trigger habria movido si el UPDATE hubiera llegado a tocar la fila.
    expect(despues).toEqual(antes);
  });
});

describe("delete sobre una categoria ajena", () => {
  it("deja la categoria de B en la base", async () => {
    const { count: platosAdentro } = await db
      .from("dishes")
      .select("id", { count: "exact", head: true })
      .eq("category_id", escenario.b.categoryVaciaId);

    // Si la categoria tuviera platos, `on delete restrict` la protegeria sola y este test
    // pasaria sin que RLS hiciera nada. Vacia, lo unico que puede frenar el borrado es la policy.
    expect(platosAdentro).toBe(0);

    const { error } = await comoA.from("categories").delete().eq("id", escenario.b.categoryVaciaId);

    expect(error).toBeNull();

    const { data: sigueViva } = await db
      .from("categories")
      .select("id")
      .eq("id", escenario.b.categoryVaciaId)
      .single();

    expect(sigueViva?.id).toBe(escenario.b.categoryVaciaId);
  });
});

describe("insert de un plato en un restaurante ajeno", () => {
  it("devuelve error y no crea ninguna fila para B", async () => {
    const { count: antes } = await db
      .from("dishes")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", escenario.b.id);

    const { error } = await comoA.from("dishes").insert({
      restaurant_id: escenario.b.id,
      category_id: escenario.b.categoryId,
      name: "Plato plantado por A",
      price: 500_000,
    });

    // Un INSERT si falla fuerte: no hay fila preexistente que filtrar, asi que el `with
    // check` de la policy lo rechaza. 42501 = insufficient_privilege.
    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");

    const { count: despues } = await db
      .from("dishes")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", escenario.b.id);

    expect(despues).toBe(antes);
  });
});
