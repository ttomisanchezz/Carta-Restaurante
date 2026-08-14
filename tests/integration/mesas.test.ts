import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type EscenarioDeAislamiento,
  seedTwoRestaurants,
} from "../helpers/seed-two-restaurants.ts";
import { anonClient, authedClient, serviceClient } from "../helpers/supabase-clients.ts";

/**
 * Mesas identificadas por QR: el token, las policies y el RPC del comensal.
 *
 * Cada `it` de este archivo corresponde a una de las frases del checkpoint A. Si una frase
 * no se puede escribir con claridad, la policy esta mal; si no se puede testear, tampoco.
 *
 * Las mesas cuelgan de los restaurantes del escenario compartido y su FK es `on delete
 * cascade`, asi que el `cleanup()` del fixture se las lleva sin codigo extra acá.
 */

let escenario: EscenarioDeAislamiento;
let db: SupabaseClient;
let comoOwnerA: SupabaseClient;
let anon: SupabaseClient;

let mesaA1 = "";
let mesaA2 = "";
let mesaB1 = "";
let mesaInactiva = "";
let mesaDeRestauranteApagado = "";

let tokenA1 = "";
let tokenB1 = "";
let tokenInactiva = "";
let tokenDeRestauranteApagado = "";

async function crearMesa(restaurantId: string, label: string, activa = true) {
  const { data, error } = await db
    .from("restaurant_tables")
    // El `token` NO se manda: lo pone el default de la columna. Que este test no lo elija
    // es parte de lo que se esta probando.
    .insert({ restaurant_id: restaurantId, label, is_active: activa })
    .select("id, token")
    .single();

  if (error || !data) throw new Error(`No pude crear la mesa ${label}: ${error?.message}`);
  return data as { id: string; token: string };
}

beforeAll(async () => {
  escenario = await seedTwoRestaurants();
  db = serviceClient();
  anon = anonClient();
  comoOwnerA = await authedClient(escenario.ownerA.email, escenario.ownerA.password);

  const a1 = await crearMesa(escenario.a.id, "Mesa 1");
  const a2 = await crearMesa(escenario.a.id, "Barra 2");
  const b1 = await crearMesa(escenario.b.id, "Mesa 1 de B");
  const inactiva = await crearMesa(escenario.a.id, "Mesa guardada", false);
  const apagado = await crearMesa(escenario.inactivo.id, "Mesa de local cerrado");

  mesaA1 = a1.id;
  mesaA2 = a2.id;
  mesaB1 = b1.id;
  mesaInactiva = inactiva.id;
  mesaDeRestauranteApagado = apagado.id;

  tokenA1 = a1.token;
  tokenB1 = b1.token;
  tokenInactiva = inactiva.token;
  tokenDeRestauranteApagado = apagado.token;
}, 60_000);

afterAll(async () => {
  await escenario.cleanup();
});

describe("el token", () => {
  it("lo genera la base, con la forma exacta del CSPRNG", () => {
    // 32 hex = 16 bytes = 128 bits. No se recorre por fuerza bruta.
    expect(tokenA1).toMatch(/^[0-9a-f]{32}$/);
  });

  it("no es derivable de la etiqueta", async () => {
    const { data } = await db
      .from("restaurant_tables")
      .select("label, token")
      .eq("restaurant_id", escenario.a.id);

    // Si la URL fuera /brasa/mesa/5 cualquiera pide desde su casa: ese es el ataque que
    // cierra el token opaco.
    for (const fila of data ?? []) {
      const token = fila.token as string;
      const etiqueta = (fila.label as string).toLowerCase().replace(/[^a-z0-9]/g, "");

      expect(token).toMatch(/^[0-9a-f]{32}$/);
      expect(token).not.toContain(etiqueta);
    }
  });

  it("no es secuencial: dos mesas seguidas no comparten casi nada", async () => {
    /*
     * `mesaA1` y `mesaA2` se crearon una atras de la otra. Con un contador o un timestamp
     * sus tokens serian casi identicos; con 128 bits de CSPRNG difieren en ~30 de las 32
     * posiciones. El umbral de 20 deja margen de sobra para que esto no sea intermitente:
     * la probabilidad de que dos tokens aleatorios coincidan en 12 posiciones o mas es
     * despreciable, y un token generado por contador no lo pasaria jamas.
     */
    const { data } = await db.from("restaurant_tables").select("token").in("id", [mesaA1, mesaA2]);

    const [uno, otro] = (data ?? []).map((f) => f.token as string);
    expect(uno).toBeDefined();
    expect(otro).toBeDefined();

    let distintos = 0;
    for (let i = 0; i < 32; i++) {
      if (uno?.[i] !== otro?.[i]) distintos++;
    }

    expect(distintos).toBeGreaterThan(20);
  });

  it("la base rechaza un token corto aunque venga con la clave de servicio", async () => {
    const { error } = await db
      .from("restaurant_tables")
      .insert({ restaurant_id: escenario.a.id, label: "Mesa falsificada", token: "5" });

    // 23514 = check_violation. El default decide de donde sale; el check impide degradarlo.
    expect(error?.code).toBe("23514");
  });
});

describe("policies de restaurant_tables", () => {
  it("un comensal anonimo no lee NI UNA fila, ni siquiera cuantas hay", async () => {
    const { data } = await anon.from("restaurant_tables").select("id, label, token");

    expect(data ?? []).toHaveLength(0);
  });

  it("el owner lee las mesas de su restaurante y ninguna de otro", async () => {
    const { data } = await comoOwnerA.from("restaurant_tables").select("id, restaurant_id");
    const ids = (data ?? []).map((f) => f.id as string);

    expect(ids).toContain(mesaA1);
    expect(ids).toContain(mesaA2);
    expect(ids).toContain(mesaInactiva);
    expect(ids).not.toContain(mesaB1);
    expect(ids).not.toContain(mesaDeRestauranteApagado);

    for (const fila of data ?? []) {
      expect(fila.restaurant_id).toBe(escenario.a.id);
    }
  });

  it("el owner no puede crear una mesa colgada de otro restaurante", async () => {
    const { error } = await comoOwnerA
      .from("restaurant_tables")
      .insert({ restaurant_id: escenario.b.id, label: "Mesa infiltrada" });

    // 42501 = insufficient_privilege, que es lo que devuelve el `with check` al rechazar.
    expect(error?.code).toBe("42501");

    const { count } = await db
      .from("restaurant_tables")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", escenario.b.id);

    expect(count).toBe(1);
  });

  it("el owner no puede renombrar la mesa de otro restaurante", async () => {
    const { data, error } = await comoOwnerA
      .from("restaurant_tables")
      .update({ label: "Robada" })
      .eq("id", mesaB1)
      .select("id");

    // RLS filtra la fila: no hay error, hay CERO filas afectadas. Por eso el `.select()`.
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);

    const { data: real } = await db
      .from("restaurant_tables")
      .select("label")
      .eq("id", mesaB1)
      .single();

    expect(real?.label).toBe("Mesa 1 de B");
  });

  it("el owner no puede mudar su propia mesa a otro restaurante", async () => {
    // Esto es lo que atrapa el `with check` del UPDATE y que el `using` solo no frenaria:
    // la fila SI es suya al entrar, el problema es como quedaria al salir.
    const { error } = await comoOwnerA
      .from("restaurant_tables")
      .update({ restaurant_id: escenario.b.id })
      .eq("id", mesaA2)
      .select("id");

    expect(error?.code).toBe("42501");

    const { data: real } = await db
      .from("restaurant_tables")
      .select("restaurant_id")
      .eq("id", mesaA2)
      .single();

    expect(real?.restaurant_id).toBe(escenario.a.id);
  });

  it("NADIE borra una mesa por PostgREST, ni su propio dueño", async () => {
    // La ausencia de policy de DELETE es la funcionalidad: un token borrado y reusado
    // apuntaria pedidos viejos a la mesa equivocada.
    const { data, error } = await comoOwnerA
      .from("restaurant_tables")
      .delete()
      .eq("id", mesaA1)
      .select("id");

    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);

    const { count } = await db
      .from("restaurant_tables")
      .select("id", { count: "exact", head: true })
      .eq("id", mesaA1);

    expect(count).toBe(1);
  });
});

describe("resolve_table: como el comensal encuentra su mesa", () => {
  it("un token valido devuelve exactamente una mesa", async () => {
    const { data, error } = await anon.rpc("resolve_table", {
      p_slug: escenario.a.slug,
      p_token: tokenA1,
    });

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]?.label).toBe("Mesa 1");
    expect(data?.[0]?.restaurant_id).toBe(escenario.a.id);
  });

  it("nunca devuelve el token de vuelta, ni el de esa mesa ni el de ninguna", async () => {
    const { data } = await anon.rpc("resolve_table", {
      p_slug: escenario.a.slug,
      p_token: tokenA1,
    });

    expect(Object.keys(data?.[0] ?? {})).not.toContain("token");
    expect(JSON.stringify(data)).not.toContain(tokenA1);
  });

  it("no devuelve el listado de mesas: una fila como maximo", async () => {
    const { data } = await anon.rpc("resolve_table", {
      p_slug: escenario.a.slug,
      p_token: tokenA1,
    });

    expect((data ?? []).length).toBeLessThanOrEqual(1);
  });

  it("un token valido bajo el slug de OTRO restaurante no resuelve", async () => {
    const { data } = await anon.rpc("resolve_table", {
      p_slug: escenario.b.slug,
      p_token: tokenA1,
    });

    expect(data ?? []).toHaveLength(0);
  });

  it("una mesa desactivada no resuelve", async () => {
    const { data } = await anon.rpc("resolve_table", {
      p_slug: escenario.a.slug,
      p_token: tokenInactiva,
    });

    expect(data ?? []).toHaveLength(0);
  });

  it("la mesa de un restaurante dado de baja no resuelve", async () => {
    const { data } = await anon.rpc("resolve_table", {
      p_slug: escenario.inactivo.slug,
      p_token: tokenDeRestauranteApagado,
    });

    expect(data ?? []).toHaveLength(0);
  });

  it("un token inexistente no resuelve", async () => {
    const { data } = await anon.rpc("resolve_table", {
      p_slug: escenario.a.slug,
      p_token: "00000000000000000000000000000000",
    });

    expect(data ?? []).toHaveLength(0);
  });

  it("todos los rechazos son indistinguibles entre si", async () => {
    // Si un atacante pudiera separar "token invalido" de "mesa apagada" tendria un oraculo
    // para ir descubriendo tokens validos.
    const casos = await Promise.all([
      anon.rpc("resolve_table", { p_slug: escenario.a.slug, p_token: tokenInactiva }),
      anon.rpc("resolve_table", { p_slug: escenario.a.slug, p_token: tokenB1 }),
      anon.rpc("resolve_table", {
        p_slug: escenario.a.slug,
        p_token: "ffffffffffffffffffffffffffffffff",
      }),
      anon.rpc("resolve_table", { p_slug: "zzz-test-no-existe", p_token: tokenA1 }),
    ]);

    for (const { data, error } of casos) {
      expect(error).toBeNull();
      expect(data ?? []).toHaveLength(0);
    }
  });
});

describe("rol de usuario", () => {
  it("acepta owner y rechaza cualquier otro rol", async () => {
    const owner = await db
      .from("profiles")
      .update({ role: "owner" })
      .eq("id", escenario.ownerB.userId);
    expect(owner.error).toBeNull();

    for (const rol of ["staff", "mostrador", "cocina", "superadmin"]) {
      const { error } = await db
        .from("profiles")
        .update({ role: rol })
        .eq("id", escenario.ownerB.userId);
      expect(error?.code).toBe("23514");
    }
  });
});

describe("calorias", () => {
  it("nacen en null y la columna las acepta", async () => {
    const { data } = await db
      .from("dishes")
      .select("calories")
      .eq("id", escenario.a.platoListoId)
      .single();

    expect(data?.calories).toBeNull();
  });

  it("un comensal anonimo lee las calorias de un plato publico", async () => {
    await db.from("dishes").update({ calories: 540 }).eq("id", escenario.a.platoListoId);

    const { data } = await anon
      .from("dishes")
      .select("calories")
      .eq("id", escenario.a.platoListoId)
      .single();

    expect(data?.calories).toBe(540);
  });

  it("no lee las de un plato que ya no podia ver: la columna hereda las policies", async () => {
    await db.from("dishes").update({ calories: 900 }).eq("id", escenario.a.platoBorradorId);

    const { data } = await anon
      .from("dishes")
      .select("calories")
      .eq("id", escenario.a.platoBorradorId)
      .maybeSingle();

    expect(data).toBeNull();
  });

  it("rechaza un valor negativo", async () => {
    const { error } = await db
      .from("dishes")
      .update({ calories: -1 })
      .eq("id", escenario.a.platoListoId);

    expect(error?.code).toBe("23514");
  });
});
