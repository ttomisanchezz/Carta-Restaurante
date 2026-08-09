import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type EscenarioDeAislamiento,
  seedTwoRestaurants,
} from "../helpers/seed-two-restaurants.ts";
import { anonClient, authedClient } from "../helpers/supabase-clients.ts";

/**
 * Aislamiento de LECTURA entre restaurantes.
 *
 * Todo se lee con el cliente del usuario, nunca con el de servicio: el de servicio saltea
 * RLS y responderia que si a todo. Aca la respuesta del cliente ES el resultado.
 */

let escenario: EscenarioDeAislamiento;
let comoA: SupabaseClient;
let comoB: SupabaseClient;
const anon = anonClient();

beforeAll(async () => {
  escenario = await seedTwoRestaurants();
  comoA = await authedClient(escenario.ownerA.email, escenario.ownerA.password);
  comoB = await authedClient(escenario.ownerB.email, escenario.ownerB.password);
});

afterAll(async () => {
  await escenario.cleanup();
});

describe("listado de platos del owner", () => {
  it("ve lo propio y lo publico del escenario, y exactamente nada mas", async () => {
    const { data, error } = await comoA.from("dishes").select("id");

    expect(error).toBeNull();

    // Se filtra a los platos del escenario a proposito: desde el paso 6 la rama publica
    // tambien hace visibles los 12 de BRASA, y este test no habla de esos.
    const delEscenario = [
      escenario.a.platoListoId,
      escenario.a.platoBorradorId,
      escenario.b.platoListoId,
      escenario.b.platoBorradorId,
      escenario.inactivo.platoListoId,
      escenario.inactivo.platoBorradorId,
    ];
    const visibles = new Set(
      (data ?? []).map((fila) => fila.id).filter((id) => delEscenario.includes(id)),
    );

    // Igualdad de conjuntos, no un "no contiene": asi el test nombra las TRES cosas a la
    // vez — que A ve lo suyo, que ve el plato listo de B porque esa es la carta publica, y
    // que no ve nada mas. Lo que queda afuera es lo que mide el aislamiento: el borrador
    // de B y los dos platos del restaurante dado de baja.
    expect(visibles).toEqual(
      new Set([escenario.a.platoListoId, escenario.a.platoBorradorId, escenario.b.platoListoId]),
    );
  });

  it("si devuelve los platos propios, incluido el borrador", async () => {
    // Sin esto el test de arriba pasaria con una lista vacia.
    const { data, error } = await comoA
      .from("dishes")
      .select("id")
      .eq("restaurant_id", escenario.a.id);

    expect(error).toBeNull();
    const ids = (data ?? []).map((fila) => fila.id);
    expect(ids).toContain(escenario.a.platoListoId);
    expect(ids).toContain(escenario.a.platoBorradorId);
  });
});

describe("plato ajeno pedido por id", () => {
  it("el borrador de B le devuelve cero filas al owner de A, no un error", async () => {
    const { data, error } = await comoA
      .from("dishes")
      .select("id")
      .eq("id", escenario.b.platoBorradorId);

    // RLS filtra, no rechaza: la respuesta correcta es una lista vacia. Un 403 le contaria
    // al que pregunta que la fila existe.
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("ese mismo borrador si lo ve su propio owner", async () => {
    // Prueba que el cero de arriba es aislamiento y no una fila que no existe.
    const { data, error } = await comoB
      .from("dishes")
      .select("id")
      .eq("id", escenario.b.platoBorradorId);

    expect(error).toBeNull();
    expect(data).toEqual([{ id: escenario.b.platoBorradorId }]);
  });

  it("el plato LISTO de B si lo ve el owner de A, y es a proposito", async () => {
    // No es una fuga: es la carta publica. Si algun dia esta afirmacion se cae, se rompio
    // la lectura anonima del menu, que es el producto.
    const { data, error } = await comoA
      .from("dishes")
      .select("id")
      .eq("id", escenario.b.platoListoId);

    expect(error).toBeNull();
    expect(data).toEqual([{ id: escenario.b.platoListoId }]);
  });
});

describe("restaurante dado de baja", () => {
  it("el anonimo no ve ninguno de sus platos, ni el que esta listo", async () => {
    const { data, error } = await anon
      .from("dishes")
      .select("id")
      .eq("restaurant_id", escenario.inactivo.id);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
