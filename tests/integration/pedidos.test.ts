import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type EscenarioDeAislamiento,
  seedTwoRestaurants,
} from "../helpers/seed-two-restaurants.ts";
import { anonClient, authedClient, serviceClient } from "../helpers/supabase-clients.ts";

/**
 * Pedidos por mesa: el RPC del comensal y la maquina de estados controlada por el owner.
 *
 * Cada `it` corresponde a una de las frases del checkpoint A o a una de las mediciones del
 * cierre. Todo se mide contra la base real para ejercitar RLS y los triggers.
 */

let escenario: EscenarioDeAislamiento;
let db: SupabaseClient;
let anon: SupabaseClient;

let mesaA = { id: "", token: "" };
let mesaB = { id: "", token: "" };
let mesaAuto = { id: "", token: "" };

let comoOwnerA: SupabaseClient;

async function crearMesa(restaurantId: string, label: string) {
  const { data, error } = await db
    .from("restaurant_tables")
    .insert({ restaurant_id: restaurantId, label })
    .select("id, token")
    .single();
  if (error || !data) throw new Error(`no pude crear ${label}: ${error?.message}`);
  return { id: data.id as string, token: data.token as string };
}

/**
 * Corre el reloj de los pedidos de una mesa hacia atras.
 *
 * `create_order` tiene un limite de frecuencia real —una tanda cada 5 segundos, cinco por
 * minuto— y un test que manda dos seguidas lo choca de frente. Esto simula que paso el
 * tiempo en vez de dormir de verdad: un `sleep` de 5 segundos por caso convertiria esta
 * suite en varios minutos de espera para no medir nada nuevo.
 */
async function simularQuePasoElTiempo(tableId: string) {
  await db
    .from("orders")
    .update({ created_at: new Date(Date.now() - 5 * 60_000).toISOString() })
    .eq("table_id", tableId);
}

async function pedir(token: string, items: { dish_id: string; quantity: number }[]) {
  return anon.rpc("create_order", { p_table_token: token, p_items: items });
}

beforeAll(async () => {
  escenario = await seedTwoRestaurants();
  db = serviceClient();
  anon = anonClient();

  mesaA = await crearMesa(escenario.a.id, "Mesa A1");
  mesaB = await crearMesa(escenario.b.id, "Mesa B1");
  mesaAuto = await crearMesa(escenario.a.id, "Mesa auto");

  comoOwnerA = await authedClient(escenario.ownerA.email, escenario.ownerA.password);
}, 90_000);

afterAll(async () => {
  // Las tandas y sesiones cuelgan de los restaurantes del fixture, pero sus FK son RESTRICT
  // a proposito, asi que hay que sacarlas antes de que `cleanup()` borre los restaurantes.
  const { data: sesiones } = await db
    .from("table_sessions")
    .select("id")
    .in("restaurant_id", [escenario.a.id, escenario.b.id, escenario.inactivo.id]);

  for (const { id } of sesiones ?? []) {
    const { data: tandas } = await db.from("orders").select("id").eq("session_id", id);
    for (const tanda of tandas ?? []) {
      await db.from("order_items").delete().eq("order_id", tanda.id);
    }
    await db.from("orders").delete().eq("session_id", id);
    await db.from("table_sessions").delete().eq("id", id);
  }

  await escenario.cleanup();
});

describe("create_order: el precio lo pone el servidor", () => {
  it("un precio adulterado desde el cliente no cambia un centavo", async () => {
    // MEDICION 1. Se llama al RPC en crudo, con un `price` en el payload — que es lo que
    // haria un cliente adulterado. Nuestro zod lo rechazaria antes, pero eso no prueba
    // nada: lo que hay que probar es que la BASE no lo lee.
    const { data, error } = await pedir(mesaA.token, [
      { dish_id: escenario.a.platoListoId, quantity: 2, price: 1 } as never,
    ]);

    expect(error).toBeNull();
    expect(data).not.toBeNull();

    const { data: guardado } = await db
      .from("order_items")
      .select("price_snapshot, quantity, name_snapshot")
      .eq("dish_id", escenario.a.platoListoId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const { data: plato } = await db
      .from("dishes")
      .select("price, name")
      .eq("id", escenario.a.platoListoId)
      .single();

    expect(guardado?.price_snapshot).toBe(plato?.price);
    expect(guardado?.price_snapshot).not.toBe(1);
    // Y el nombre tambien sale de la fila real, no del cliente.
    expect(guardado?.name_snapshot).toBe(plato?.name);

    await simularQuePasoElTiempo(mesaA.id);
  });

  it("un plato de OTRO restaurante se rechaza y no deja nada a medias", async () => {
    // MEDICION 2.
    const { error } = await pedir(mesaA.token, [
      { dish_id: escenario.b.platoListoId, quantity: 1 },
    ]);

    expect(error?.code).toBe("CT003");

    // Y no quedo una tanda huerfana: la transaccion se fue entera.
    const { data } = await db
      .from("order_items")
      .select("id")
      .eq("dish_id", escenario.b.platoListoId);
    expect(data ?? []).toHaveLength(0);
  });

  it("un plato que no esta en la carta publica no se puede pedir", async () => {
    // El borrador (`video_status: 'pending'`) no se ve en la carta, asi que tampoco se pide.
    const { error } = await pedir(mesaA.token, [
      { dish_id: escenario.a.platoBorradorId, quantity: 1 },
    ]);

    expect(error?.code).toBe("CT003");
  });

  it("una mesa que no existe no abre sesion", async () => {
    const { error } = await pedir("00000000000000000000000000000000", [
      { dish_id: escenario.a.platoListoId, quantity: 1 },
    ]);

    expect(error?.code).toBe("CT001");
  });

  it("rechaza cantidades absurdas y pedidos vacios", async () => {
    const casos = [
      [{ dish_id: escenario.a.platoListoId, quantity: 0 }],
      [{ dish_id: escenario.a.platoListoId, quantity: 21 }],
      [{ dish_id: escenario.a.platoListoId, quantity: 1.5 }],
      [],
    ];

    for (const items of casos) {
      const { error } = await pedir(mesaA.token, items);
      expect(error?.code).toBe("CT002");
    }
  });

  it("corta a la sexta tanda del mismo minuto", async () => {
    /*
     * El limite es por MINUTO y no un intervalo minimo entre tandas, y la diferencia
     * importa: en una mesa hay cuatro personas con cuatro telefonos, y dos pidiendo con
     * tres segundos de diferencia es el caso normal. Lo que hay que frenar es la
     * inundacion, no al comensal apurado.
     */
    const mesa = await crearMesa(escenario.a.id, "Mesa frecuencia");

    for (let i = 0; i < 5; i++) {
      const { error } = await pedir(mesa.token, [
        { dish_id: escenario.a.platoListoId, quantity: 1 },
      ]);
      expect(error).toBeNull();
    }

    const sexta = await pedir(mesa.token, [{ dish_id: escenario.a.platoListoId, quantity: 1 }]);
    expect(sexta.error?.code).toBe("CT004");

    // Y pasado el minuto vuelve a aceptar.
    await simularQuePasoElTiempo(mesa.id);
    const despues = await pedir(mesa.token, [{ dish_id: escenario.a.platoListoId, quantity: 1 }]);
    expect(despues.error).toBeNull();
  });
});

describe("sesiones y numeracion", () => {
  it("dos tandas seguidas comparten sesion y se numeran 1 y 2", async () => {
    // MEDICION 3. Mesa propia para arrancar de cero.
    const mesa = await crearMesa(escenario.a.id, "Mesa secuencia");

    const uno = await pedir(mesa.token, [{ dish_id: escenario.a.platoListoId, quantity: 1 }]);
    await simularQuePasoElTiempo(mesa.id);
    const dos = await pedir(mesa.token, [{ dish_id: escenario.a.platoListoId, quantity: 1 }]);

    expect(uno.error).toBeNull();
    expect(dos.error).toBeNull();
    expect((uno.data as { sequence: number }).sequence).toBe(1);
    expect((dos.data as { sequence: number }).sequence).toBe(2);

    const { data: sesiones } = await db.from("table_sessions").select("id").eq("table_id", mesa.id);
    expect(sesiones ?? []).toHaveLength(1);
  });

  it("dos tandas CONCURRENTES abren una sola sesion", async () => {
    // MEDICION 4. Es el caso que ataja el indice unico parcial: sin el, las dos
    // transacciones leen "no hay sesion abierta" y las dos insertan una.
    const mesa = await crearMesa(escenario.a.id, "Mesa concurrente");

    const [uno, dos] = await Promise.all([
      pedir(mesa.token, [{ dish_id: escenario.a.platoListoId, quantity: 1 }]),
      pedir(mesa.token, [{ dish_id: escenario.a.platoListoId, quantity: 2 }]),
    ]);

    expect(uno.error).toBeNull();
    expect(dos.error).toBeNull();

    const { data: sesiones } = await db.from("table_sessions").select("id").eq("table_id", mesa.id);
    expect(sesiones ?? []).toHaveLength(1);

    // Y los numeros de tanda no chocaron: son 1 y 2, en algun orden.
    const secuencias = [
      (uno.data as { sequence: number }).sequence,
      (dos.data as { sequence: number }).sequence,
    ].sort();
    expect(secuencias).toEqual([1, 2]);
  });

  it("cerrar la mesa y volver a pedir abre una sesion nueva desde la tanda 1", async () => {
    // MEDICION 8. Es lo que evita que el comensal de mañana herede la cuenta de anoche.
    const mesa = await crearMesa(escenario.a.id, "Mesa que cierra");

    const primera = await pedir(mesa.token, [{ dish_id: escenario.a.platoListoId, quantity: 1 }]);
    expect((primera.data as { sequence: number }).sequence).toBe(1);

    const { data: abierta } = await db
      .from("table_sessions")
      .select("id")
      .eq("table_id", mesa.id)
      .is("closed_at", null)
      .single();

    const cierre = await comoOwnerA
      .from("table_sessions")
      .update({ closed_at: new Date().toISOString(), closed_by: escenario.ownerA.userId })
      .eq("id", abierta?.id)
      .select("id");
    expect(cierre.data ?? []).toHaveLength(1);

    await simularQuePasoElTiempo(mesa.id);
    const segunda = await pedir(mesa.token, [{ dish_id: escenario.a.platoListoId, quantity: 1 }]);

    expect((segunda.data as { sequence: number }).sequence).toBe(1);

    const { data: todas } = await db.from("table_sessions").select("id").eq("table_id", mesa.id);
    expect(todas ?? []).toHaveLength(2);
  });

  it("una sesion cerrada no se puede reabrir", async () => {
    const mesa = await crearMesa(escenario.a.id, "Mesa reabrir");
    await pedir(mesa.token, [{ dish_id: escenario.a.platoListoId, quantity: 1 }]);

    const { data: abierta } = await db
      .from("table_sessions")
      .select("id")
      .eq("table_id", mesa.id)
      .single();

    await comoOwnerA
      .from("table_sessions")
      .update({ closed_at: new Date().toISOString() })
      .eq("id", abierta?.id);

    const reapertura = await comoOwnerA
      .from("table_sessions")
      .update({ closed_at: null })
      .eq("id", abierta?.id)
      .select("id");

    expect(reapertura.data ?? []).toHaveLength(0);
  });
});

describe("order_flow", () => {
  it("en 'auto', la tanda 1 entra a cocina y la 2 queda pendiente", async () => {
    // MEDICION 5. La regla del negocio: todo agregado lo mira una persona, siempre.
    await db.from("restaurants").update({ order_flow: "auto" }).eq("id", escenario.a.id);

    const uno = await pedir(mesaAuto.token, [{ dish_id: escenario.a.platoListoId, quantity: 1 }]);
    await simularQuePasoElTiempo(mesaAuto.id);
    const dos = await pedir(mesaAuto.token, [{ dish_id: escenario.a.platoListoId, quantity: 1 }]);

    expect((uno.data as { status: string }).status).toBe("cocina");
    expect((dos.data as { status: string }).status).toBe("pendiente");

    await db.from("restaurants").update({ order_flow: "manual" }).eq("id", escenario.a.id);
  });

  it("en 'manual', hasta la tanda 1 espera confirmacion", async () => {
    const mesa = await crearMesa(escenario.a.id, "Mesa manual");
    const uno = await pedir(mesa.token, [{ dish_id: escenario.a.platoListoId, quantity: 1 }]);

    expect((uno.data as { status: string }).status).toBe("pendiente");
  });
});

describe("acceso del owner", () => {
  it("un comensal anonimo no lee ni una fila de las tres tablas", async () => {
    for (const tabla of ["orders", "order_items", "table_sessions"]) {
      const { data } = await anon.from(tabla).select("id");
      expect(data ?? []).toHaveLength(0);
    }
  });

  it("el owner ve los items con su precio", async () => {
    const { data, error } = await comoOwnerA
      .from("order_items")
      .select("price_snapshot, name_snapshot");

    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
    expect(data?.every((item) => Number.isInteger(item.price_snapshot))).toBe(true);
  });

  it("kitchen_queue no devuelve ninguna columna de dinero", async () => {
    const mesa = await crearMesa(escenario.a.id, "Mesa cocina");
    const creado = await pedir(mesa.token, [{ dish_id: escenario.a.platoListoId, quantity: 3 }]);
    expect(creado.error).toBeNull();

    const { data: tanda } = await db.from("orders").select("id").eq("table_id", mesa.id).single();
    await comoOwnerA.from("orders").update({ status: "cocina" }).eq("id", tanda?.id);

    const { data, error } = await comoOwnerA.rpc("kitchen_queue");
    expect(error).toBeNull();

    const fila = (data as { items: unknown[] }[]).find((f) => f.items.length > 0);
    expect(fila).toBeDefined();

    const items = (fila?.items ?? []) as Record<string, unknown>[];
    const claves = Object.keys(items[0] ?? {});
    expect(claves).toContain("name");
    expect(claves).toContain("quantity");
    expect(claves).not.toContain("price");
    expect(claves).not.toContain("subtotal");
    // Ni el JSON entero menciona un precio.
    expect(JSON.stringify(data)).not.toContain("price");
  });

  it("el owner recorre pendiente -> cocina -> listo -> entregado", async () => {
    const mesa = await crearMesa(escenario.a.id, "Mesa transiciones");
    await pedir(mesa.token, [{ dish_id: escenario.a.platoListoId, quantity: 1 }]);

    const { data: tanda } = await db.from("orders").select("id").eq("table_id", mesa.id).single();
    const id = tanda?.id as string;

    const confirmar = await comoOwnerA
      .from("orders")
      .update({ status: "cocina" })
      .eq("id", id)
      .select("id");
    expect(confirmar.data ?? []).toHaveLength(1);

    const listo = await comoOwnerA
      .from("orders")
      .update({ status: "listo" })
      .eq("id", id)
      .select("id");
    expect(listo.data ?? []).toHaveLength(1);

    const entregar = await comoOwnerA
      .from("orders")
      .update({ status: "entregado" })
      .eq("id", id)
      .select("id");
    expect(entregar.data ?? []).toHaveLength(1);

    const { data: final } = await db.from("orders").select("status").eq("id", id).single();
    expect(final?.status).toBe("entregado");
  });

  it("el trigger frena un salto ilegal aunque lo intente el owner", async () => {
    const mesa = await crearMesa(escenario.a.id, "Mesa salto");
    await pedir(mesa.token, [{ dish_id: escenario.a.platoListoId, quantity: 1 }]);

    const { data: tanda } = await db.from("orders").select("id").eq("table_id", mesa.id).single();

    // `pendiente -> entregado` no existe en la maquina de estados.
    const { error } = await comoOwnerA
      .from("orders")
      .update({ status: "entregado" })
      .eq("id", tanda?.id);

    expect(error?.code).toBe("23514");
  });

  it("rechazar sin motivo no entra en la base", async () => {
    const mesa = await crearMesa(escenario.a.id, "Mesa rechazo");
    await pedir(mesa.token, [{ dish_id: escenario.a.platoListoId, quantity: 1 }]);

    const { data: tanda } = await db.from("orders").select("id").eq("table_id", mesa.id).single();

    const { error } = await comoOwnerA
      .from("orders")
      .update({ status: "rechazado" })
      .eq("id", tanda?.id);

    expect(error?.code).toBe("23514");
  });

  it("nadie borra una tanda ni una sesion por PostgREST", async () => {
    const { data: tanda } = await db.from("orders").select("id").limit(1).single();

    const borrado = await comoOwnerA.from("orders").delete().eq("id", tanda?.id).select("id");
    expect(borrado.data ?? []).toHaveLength(0);

    const { data: sigue } = await db.from("orders").select("id").eq("id", tanda?.id);
    expect(sigue ?? []).toHaveLength(1);
  });
});

describe("get_session_status", () => {
  it("no devuelve nada de otra mesa", async () => {
    // MEDICION 7.
    const { data: enA } = await anon.rpc("get_session_status", { p_table_token: mesaA.token });
    await simularQuePasoElTiempo(mesaB.id);
    await pedir(mesaB.token, [{ dish_id: escenario.b.platoListoId, quantity: 1 }]);
    const { data: enB } = await anon.rpc("get_session_status", { p_table_token: mesaB.token });

    expect(enA).not.toBeNull();
    expect(enB).not.toBeNull();

    expect((enA as { table_label: string }).table_label).toBe("Mesa A1");
    expect((enB as { table_label: string }).table_label).toBe("Mesa B1");

    // El nombre del plato de B no aparece en la respuesta de A, ni al reves.
    const { data: platoB } = await db
      .from("dishes")
      .select("name")
      .eq("id", escenario.b.platoListoId)
      .single();
    expect(JSON.stringify(enA)).not.toContain(platoB?.name as string);
  });

  it("una mesa sin sesion abierta devuelve null", async () => {
    const mesa = await crearMesa(escenario.a.id, "Mesa limpia");
    const { data } = await anon.rpc("get_session_status", { p_table_token: mesa.token });

    expect(data).toBeNull();
  });

  it("un token invalido devuelve null, igual que una mesa sin sesion", async () => {
    const { data } = await anon.rpc("get_session_status", {
      p_table_token: "ffffffffffffffffffffffffffffffff",
    });

    expect(data).toBeNull();
  });

  it("el total no cuenta lo rechazado", async () => {
    const mesa = await crearMesa(escenario.a.id, "Mesa total");
    await pedir(mesa.token, [{ dish_id: escenario.a.platoListoId, quantity: 1 }]);
    await simularQuePasoElTiempo(mesa.id);
    await pedir(mesa.token, [{ dish_id: escenario.a.platoListoId, quantity: 1 }]);

    const { data: tandas } = await db
      .from("orders")
      .select("id, sequence")
      .eq("table_id", mesa.id)
      .order("sequence");

    const antes = await anon.rpc("get_session_status", { p_table_token: mesa.token });
    const totalAntes = (antes.data as { total: number }).total;

    await comoOwnerA
      .from("orders")
      .update({ status: "rechazado", rejected_reason: "Se acabó" })
      .eq("id", tandas?.[1]?.id);

    const despues = await anon.rpc("get_session_status", { p_table_token: mesa.token });
    const totalDespues = (despues.data as { total: number }).total;

    expect(totalDespues).toBe(totalAntes / 2);
  });
});
