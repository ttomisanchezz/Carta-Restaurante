import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  borrarCategoria,
  crearCategoria,
  listarCategorias,
  subirCategoria,
} from "@/server/admin/categories";
import type { ContextoAdmin } from "@/server/admin/resultado";
import {
  type EscenarioDeAislamiento,
  seedTwoRestaurants,
} from "../helpers/seed-two-restaurants.ts";
import { authedClient, serviceClient } from "../helpers/supabase-clients.ts";

/**
 * Categorias del panel, con clientes autenticados y las policies puestas.
 */

const db = serviceClient();
let escenario: EscenarioDeAislamiento;
let comoA: ContextoAdmin;
let comoB: ContextoAdmin;

beforeAll(async () => {
  escenario = await seedTwoRestaurants();

  comoA = {
    db: await authedClient(escenario.ownerA.email, escenario.ownerA.password),
    sesion: { userId: escenario.ownerA.userId, restaurantId: escenario.a.id, role: "owner" },
  };
  comoB = {
    db: await authedClient(escenario.ownerB.email, escenario.ownerB.password),
    sesion: { userId: escenario.ownerB.userId, restaurantId: escenario.b.id, role: "owner" },
  };
});

afterAll(async () => {
  await escenario.cleanup();
});

describe("crear categoria", () => {
  it("la crea en el restaurante de la sesion, no en el que diga el formulario", async () => {
    const resultado = await crearCategoria({ name: "Entradas nuevas" }, comoA);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    const { data } = await db
      .from("categories")
      .select("restaurant_id")
      .eq("id", resultado.data.id)
      .single();

    expect(data?.restaurant_id).toBe(escenario.a.id);
  });

  it("mandar restaurant_id en el formulario es un error de validacion, no una fuga", async () => {
    // `.strict()`: el campo ni siquiera se ignora en silencio. Si aparece, algo anda mal
    // en el formulario y conviene enterarse.
    const resultado = await crearCategoria(
      { name: "Intento de fuga", restaurant_id: escenario.b.id },
      comoA,
    );

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.code).toBe("validation_error");
  });

  it("rechaza un nombre vacio", async () => {
    const resultado = await crearCategoria({ name: "   " }, comoA);

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.code).toBe("validation_error");
  });
});

describe("borrar categoria", () => {
  it("con platos adentro devuelve conflict y dice cuantos son", async () => {
    // La categoria del escenario tiene exactamente 2 platos: el listo y el borrador.
    const resultado = await borrarCategoria({ id: escenario.a.categoryId }, comoA);

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error.code).toBe("conflict");
      // El numero tiene que estar en el mensaje: "no se puede" sin decir cuantos ni cuales
      // deja al usuario adivinando.
      expect(resultado.error.message).toContain("2");
    }

    const { data } = await db
      .from("categories")
      .select("id")
      .eq("id", escenario.a.categoryId)
      .maybeSingle();
    expect(data?.id).toBe(escenario.a.categoryId);
  });

  it("sin platos adentro borra exactamente esa fila", async () => {
    const creada = await crearCategoria({ name: "Para borrar" }, comoA);
    expect(creada.ok).toBe(true);
    if (!creada.ok) return;

    const antes = await listarCategorias(comoA);
    const resultado = await borrarCategoria({ id: creada.data.id }, comoA);
    expect(resultado.ok).toBe(true);

    const despues = await listarCategorias(comoA);
    expect(despues).toHaveLength(antes.length - 1);
    expect(despues.map((c) => c.id)).not.toContain(creada.data.id);
  });

  it("la categoria de otro restaurante da not_found y sigue existiendo", async () => {
    // `not_found` y no `forbidden`: confirmar que existe ya seria contar de mas.
    const resultado = await borrarCategoria({ id: escenario.b.categoryVaciaId }, comoA);

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.code).toBe("not_found");

    const { data } = await db
      .from("categories")
      .select("id")
      .eq("id", escenario.b.categoryVaciaId)
      .maybeSingle();
    expect(data?.id).toBe(escenario.b.categoryVaciaId);
  });
});

describe("reordenar categorias", () => {
  it("subir la segunda la intercambia con la primera y ningun orden se repite", async () => {
    const antes = await listarCategorias(comoA);
    expect(antes.length).toBeGreaterThanOrEqual(2);

    const primera = antes[0];
    const segunda = antes[1];

    const resultado = await subirCategoria({ id: segunda.id }, comoA);
    expect(resultado.ok).toBe(true);

    const despues = await listarCategorias(comoA);
    expect(despues[0].id).toBe(segunda.id);
    expect(despues[1].id).toBe(primera.id);

    // Un empate en sort_order haria que el orden dependa del planificador de Postgres.
    const ordenes = despues.map((c) => c.sort_order);
    expect(new Set(ordenes).size).toBe(ordenes.length);
  });

  it("subir la primera no cambia nada y no es un error", async () => {
    const antes = await listarCategorias(comoA);

    const resultado = await subirCategoria({ id: antes[0].id }, comoA);

    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.data.movida).toBe(false);

    const despues = await listarCategorias(comoA);
    expect(despues.map((c) => c.id)).toEqual(antes.map((c) => c.id));
  });

  it("no se puede reordenar la categoria de otro restaurante", async () => {
    const antesDeB = await listarCategorias(comoB);

    const resultado = await subirCategoria({ id: escenario.b.categoryVaciaId }, comoA);

    // A ni siquiera puede leerla, asi que para el no existe.
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.code).toBe("not_found");

    const despuesDeB = await listarCategorias(comoB);
    expect(despuesDeB.map((c) => c.id)).toEqual(antesDeB.map((c) => c.id));
  });
});

describe("listar categorias", () => {
  it("cuenta los platos de cada una", async () => {
    const categorias = await listarCategorias(comoA);
    const principal = categorias.find((c) => c.id === escenario.a.categoryId);

    expect(principal?.platos).toBe(2);
  });

  it("no incluye las de otro restaurante", async () => {
    const categorias = await listarCategorias(comoA);
    const ids = categorias.map((c) => c.id);

    expect(ids).not.toContain(escenario.b.categoryId);
    expect(ids).not.toContain(escenario.b.categoryVaciaId);
  });
});
