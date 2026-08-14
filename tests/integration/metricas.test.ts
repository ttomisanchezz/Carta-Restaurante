import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type EscenarioDeAislamiento,
  seedTwoRestaurants,
} from "../helpers/seed-two-restaurants.ts";
import { anonClient, authedClient, serviceClient } from "../helpers/supabase-clients.ts";

/**
 * Metricas por plato: el primer camino de ESCRITURA de un comensal anonimo.
 *
 * Cada `it` de este archivo existe para una frase concreta del diseño de la migracion. Lo
 * que se prueba no es que la metrica cuente bien —eso es lo facil— sino que la puerta que
 * se abrio para que cuente no deje pasar nada mas.
 *
 * `dish_view_events` cuelga de `dishes` y de `restaurants` con `on delete cascade`, asi que
 * el `cleanup()` del fixture se lleva los eventos sin codigo extra acá.
 */

let escenario: EscenarioDeAislamiento;
let db: SupabaseClient;
let anon: SupabaseClient;
let comoOwnerA: SupabaseClient;

/** Un token con el formato exacto que exige la columna, distinto en cada llamada. */
function tokenDeSesion(): string {
  return Array.from({ length: 32 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join(
    "",
  );
}

async function contarEventos(dishId: string): Promise<number> {
  const { count } = await db
    .from("dish_view_events")
    .select("id", { count: "exact", head: true })
    .eq("dish_id", dishId);

  return count ?? 0;
}

beforeAll(async () => {
  escenario = await seedTwoRestaurants();
  db = serviceClient();
  anon = anonClient();
  comoOwnerA = await authedClient(escenario.ownerA.email, escenario.ownerA.password);
}, 60_000);

afterAll(async () => {
  await escenario.cleanup();
});

describe("la tabla no es una puerta", () => {
  it("un anonimo no puede insertar un evento por PostgREST", async () => {
    const { error } = await anon.from("dish_view_events").insert({
      restaurant_id: escenario.a.id,
      dish_id: escenario.a.platoListoId,
      momento: "iniciado",
      session_token: tokenDeSesion(),
    });

    // Sin policy de insert y con `revoke all`, no hay por donde entrar.
    expect(error).not.toBeNull();
    expect(await contarEventos(escenario.a.platoListoId)).toBe(0);
  });

  it("un owner autenticado tampoco puede insertar a mano", async () => {
    // La unica puerta es la RPC, tambien para el dueño: una metrica que el dueño puede
    // escribir a dedo deja de ser una metrica.
    const { error } = await comoOwnerA.from("dish_view_events").insert({
      restaurant_id: escenario.a.id,
      dish_id: escenario.a.platoListoId,
      momento: "completo",
      session_token: tokenDeSesion(),
    });

    expect(error).not.toBeNull();
    expect(await contarEventos(escenario.a.platoListoId)).toBe(0);
  });

  it("un anonimo no lee ni una fila de eventos", async () => {
    await db.from("dish_view_events").insert({
      restaurant_id: escenario.a.id,
      dish_id: escenario.a.platoListoId,
      momento: "iniciado",
      session_token: tokenDeSesion(),
    });

    const { data } = await anon.from("dish_view_events").select("id, session_token");

    expect(data ?? []).toHaveLength(0);

    await db.from("dish_view_events").delete().eq("dish_id", escenario.a.platoListoId);
  });
});

describe("record_dish_views: la unica puerta", () => {
  it("registra los momentos de un plato publico", async () => {
    const sesion = tokenDeSesion();
    const { error } = await anon.rpc("record_dish_views", {
      p_dish_id: escenario.a.platoListoId,
      p_session: sesion,
      p_momentos: ["iniciado", "25", "50"],
    });

    expect(error).toBeNull();
    expect(await contarEventos(escenario.a.platoListoId)).toBe(3);

    await db.from("dish_view_events").delete().eq("session_token", sesion);
  });

  it("el restaurant_id sale del plato, no de quien llama", async () => {
    // La firma ni siquiera acepta un restaurant_id. Es la defensa contra imputarle vistas
    // al restaurante de al lado.
    const sesion = tokenDeSesion();
    await anon.rpc("record_dish_views", {
      p_dish_id: escenario.a.platoListoId,
      p_session: sesion,
      p_momentos: ["iniciado"],
    });

    const { data } = await db
      .from("dish_view_events")
      .select("restaurant_id")
      .eq("session_token", sesion);

    expect(data ?? []).toHaveLength(1);
    expect(data?.[0]?.restaurant_id).toBe(escenario.a.id);

    await db.from("dish_view_events").delete().eq("session_token", sesion);
  });

  it("reenviar el mismo lote no mueve el contador", async () => {
    // El freno principal contra "inflar los numeros apretando F5".
    const sesion = tokenDeSesion();
    const lote = {
      p_dish_id: escenario.a.platoListoId,
      p_session: sesion,
      p_momentos: ["iniciado", "25"],
    };

    await anon.rpc("record_dish_views", lote);
    await anon.rpc("record_dish_views", lote);
    await anon.rpc("record_dish_views", lote);

    expect(await contarEventos(escenario.a.platoListoId)).toBe(2);

    await db.from("dish_view_events").delete().eq("session_token", sesion);
  });

  it("un plato sin el video listo no registra nada", async () => {
    // Las mismas tres condiciones que la policy de lectura publica, no unas nuevas.
    const sesion = tokenDeSesion();
    const { error } = await anon.rpc("record_dish_views", {
      p_dish_id: escenario.a.platoBorradorId,
      p_session: sesion,
      p_momentos: ["iniciado"],
    });

    expect(error).toBeNull();
    expect(await contarEventos(escenario.a.platoBorradorId)).toBe(0);
  });

  it("un plato de un restaurante dado de baja no registra nada", async () => {
    const { error } = await anon.rpc("record_dish_views", {
      p_dish_id: escenario.inactivo.platoListoId,
      p_session: tokenDeSesion(),
      p_momentos: ["iniciado"],
    });

    expect(error).toBeNull();
    expect(await contarEventos(escenario.inactivo.platoListoId)).toBe(0);
  });

  it("un plato marcado como no disponible no registra nada", async () => {
    await db.from("dishes").update({ is_available: false }).eq("id", escenario.b.platoListoId);

    const { error } = await anon.rpc("record_dish_views", {
      p_dish_id: escenario.b.platoListoId,
      p_session: tokenDeSesion(),
      p_momentos: ["iniciado"],
    });

    expect(error).toBeNull();
    expect(await contarEventos(escenario.b.platoListoId)).toBe(0);

    await db.from("dishes").update({ is_available: true }).eq("id", escenario.b.platoListoId);
  });

  it("un id de plato que no existe no es un error, es silencio", async () => {
    // Un error acá le confirmaria a quien sondea que el id existe.
    const { error } = await anon.rpc("record_dish_views", {
      p_dish_id: "00000000-0000-0000-0000-000000000000",
      p_session: tokenDeSesion(),
      p_momentos: ["iniciado"],
    });

    expect(error).toBeNull();
  });

  it("un token con formato invalido no registra nada", async () => {
    for (const invalido of ["", "corto", "ZZZZ5678901234567890123456789012", "  "]) {
      const { error } = await anon.rpc("record_dish_views", {
        p_dish_id: escenario.a.platoListoId,
        p_session: invalido,
        p_momentos: ["iniciado"],
      });

      expect(error).toBeNull();
    }

    expect(await contarEventos(escenario.a.platoListoId)).toBe(0);
  });

  it("los momentos desconocidos se filtran y los validos igual entran", async () => {
    // Dejar que el `check` de la columna reviente convertiria entrada basura en un 500 en
    // la pantalla de un comensal que no hizo nada.
    const sesion = tokenDeSesion();
    const { error } = await anon.rpc("record_dish_views", {
      p_dish_id: escenario.a.platoListoId,
      p_session: sesion,
      p_momentos: ["iniciado", "99", "'; drop table dishes; --", "completo"],
    });

    expect(error).toBeNull();

    const { data } = await db
      .from("dish_view_events")
      .select("momento")
      .eq("session_token", sesion);

    expect((data ?? []).map((f) => f.momento).sort()).toEqual(["completo", "iniciado"]);

    await db.from("dish_view_events").delete().eq("session_token", sesion);
  });

  it("un lote vacio no rompe nada", async () => {
    const { error } = await anon.rpc("record_dish_views", {
      p_dish_id: escenario.a.platoListoId,
      p_session: tokenDeSesion(),
      p_momentos: [],
    });

    expect(error).toBeNull();
    expect(await contarEventos(escenario.a.platoListoId)).toBe(0);
  });

  it("pasado el techo por ventana, la misma sesion deja de sumar", async () => {
    /*
     * El indice unico ya hace gratis el reenvio; el techo ataca el otro lado, el script que
     * inventa eventos NUEVOS en un loop.
     *
     * Llenar la ventana necesita 120 filas de una misma sesion, y como el indice unico es
     * (dish_id, session_token, momento) un solo plato aporta 5 como maximo. Por eso el test
     * crea platos de relleno: es la unica forma de que la sesion llegue al techo sin chocar
     * antes contra el indice. Se siembran con el cliente de servicio porque lo que se esta
     * probando es la decision de la funcion, no la velocidad de PostgREST.
     */
    const sesion = tokenDeSesion();
    const momentos = ["iniciado", "25", "50", "75", "completo"];

    const { data: relleno, error: errorRelleno } = await db
      .from("dishes")
      .insert(
        Array.from({ length: 25 }, (_, i) => ({
          restaurant_id: escenario.a.id,
          category_id: escenario.a.categoryId,
          name: `Relleno de metricas ${i}`,
          description: "Existe solo para llenar la ventana del techo por sesion",
          price: 100_000,
          video_status: "ready",
          is_available: true,
          sort_order: 100 + i,
        })),
      )
      .select("id");

    expect(errorRelleno).toBeNull();
    expect(relleno ?? []).toHaveLength(25);

    // 25 platos x 5 momentos = 125 eventos, todos dentro del ultimo minuto.
    await db.from("dish_view_events").insert(
      (relleno ?? []).flatMap((plato) =>
        momentos.map((momento) => ({
          restaurant_id: escenario.a.id,
          dish_id: plato.id as string,
          momento,
          session_token: sesion,
        })),
      ),
    );

    // Ahora un evento legitimo, de un plato que esta sesion no toco todavia: el indice
    // unico no lo frena, asi que si entra es porque el techo no existe.
    const { error } = await anon.rpc("record_dish_views", {
      p_dish_id: escenario.a.platoListoId,
      p_session: sesion,
      p_momentos: ["iniciado"],
    });

    expect(error).toBeNull();
    expect(await contarEventos(escenario.a.platoListoId)).toBe(0);

    // Y la prueba de que lo que corto fue el techo y no otra cosa: la MISMA llamada, con
    // una sesion nueva y todo lo demas igual, si registra.
    const sesionLimpia = tokenDeSesion();
    await anon.rpc("record_dish_views", {
      p_dish_id: escenario.a.platoListoId,
      p_session: sesionLimpia,
      p_momentos: ["iniciado"],
    });

    expect(await contarEventos(escenario.a.platoListoId)).toBe(1);

    await db.from("dish_view_events").delete().in("session_token", [sesion, sesionLimpia]);
    await db
      .from("dishes")
      .delete()
      .in(
        "id",
        (relleno ?? []).map((p) => p.id as string),
      );
  });
});

describe("lo que ve el dueño", () => {
  it("el owner ve las metricas de su plato", async () => {
    const sesion = tokenDeSesion();
    await anon.rpc("record_dish_views", {
      p_dish_id: escenario.a.platoListoId,
      p_session: sesion,
      p_momentos: ["iniciado", "25", "50", "75", "completo"],
    });

    const { data, error } = await comoOwnerA
      .from("dish_view_metrics")
      .select("dish_id, vistas, completos, porcentaje_completo")
      .eq("dish_id", escenario.a.platoListoId)
      .single();

    expect(error).toBeNull();
    expect(data?.vistas).toBe(1);
    expect(data?.completos).toBe(1);
    expect(data?.porcentaje_completo).toBe(100);

    await db.from("dish_view_events").delete().eq("session_token", sesion);
  });

  it("una sesion que arranca y no termina baja el porcentaje, no la vista", async () => {
    const completa = tokenDeSesion();
    const abandonada = tokenDeSesion();

    await anon.rpc("record_dish_views", {
      p_dish_id: escenario.a.platoListoId,
      p_session: completa,
      p_momentos: ["iniciado", "completo"],
    });
    await anon.rpc("record_dish_views", {
      p_dish_id: escenario.a.platoListoId,
      p_session: abandonada,
      p_momentos: ["iniciado", "25"],
    });

    const { data } = await comoOwnerA
      .from("dish_view_metrics")
      .select("vistas, completos, porcentaje_completo")
      .eq("dish_id", escenario.a.platoListoId)
      .single();

    // Dos visitas, una termino: 50%. Es el numero que justifica todo el archivo.
    expect(data?.vistas).toBe(2);
    expect(data?.completos).toBe(1);
    expect(data?.porcentaje_completo).toBe(50);

    await db.from("dish_view_events").delete().in("session_token", [completa, abandonada]);
  });

  it("el owner de A no ve los conteos de B", async () => {
    const sesion = tokenDeSesion();
    await anon.rpc("record_dish_views", {
      p_dish_id: escenario.b.platoListoId,
      p_session: sesion,
      p_momentos: ["iniciado", "completo"],
    });

    // El plato de B es publico, asi que su NOMBRE ya lo puede leer cualquiera desde la
    // carta y aparecer en la vista no es una fuga. Lo que no puede cruzar la frontera son
    // los conteos, y la RLS de `dish_view_events` los deja en cero.
    const { data } = await comoOwnerA
      .from("dish_view_metrics")
      .select("vistas, completos")
      .eq("dish_id", escenario.b.platoListoId)
      .maybeSingle();

    expect(data?.vistas ?? 0).toBe(0);
    expect(data?.completos ?? 0).toBe(0);

    // Con la clave de servicio los eventos SI estan: lo que filtro fue la policy, no el
    // hecho de que no se hayan registrado.
    expect(await contarEventos(escenario.b.platoListoId)).toBe(2);

    await db.from("dish_view_events").delete().eq("session_token", sesion);
  });

  it("un anonimo no lee la vista de metricas", async () => {
    const { data, error } = await anon.from("dish_view_metrics").select("dish_id, vistas");

    // `revoke all` sobre la vista: el anonimo no llega ni a que se evalue una policy.
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });

  it("un plato sin una sola vista aparece en cero, no desaparece", async () => {
    const { data } = await comoOwnerA
      .from("dish_view_metrics")
      .select("dish_id, vistas, porcentaje_completo")
      .eq("dish_id", escenario.a.platoBorradorId)
      .maybeSingle();

    expect(data).not.toBeNull();
    expect(data?.vistas).toBe(0);
    // `null`, no 0%: no es que nadie lo termine, es que nadie lo empezo.
    expect(data?.porcentaje_completo).toBeNull();
  });
});
