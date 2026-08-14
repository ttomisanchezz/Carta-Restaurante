import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SesionAdmin } from "@/lib/auth/require-admin";
import type { ContextoAdmin } from "@/server/admin/resultado";
import {
  cambiarActivacionMesa,
  crearMesa,
  listarMesas,
  renombrarMesa,
  slugDeMiRestaurante,
} from "@/server/admin/tables";
import {
  type EscenarioDeAislamiento,
  seedTwoRestaurants,
} from "../helpers/seed-two-restaurants.ts";
import { authedClient, serviceClient } from "../helpers/supabase-clients.ts";

/**
 * Las operaciones de `/admin/mesas`, con RLS de verdad debajo.
 *
 * El contexto se inyecta con un cliente autenticado real, no con un mock: probar esto
 * contra una base simulada afirmaria que el mock coincide con el mock, y lo que hay que
 * verificar es justamente que las policies corren.
 */

let escenario: EscenarioDeAislamiento;
let db: SupabaseClient;
let comoOwnerA: SupabaseClient;

function contexto(sesion: Partial<SesionAdmin> = {}): ContextoAdmin {
  return {
    db: comoOwnerA,
    sesion: {
      userId: escenario.ownerA.userId,
      restaurantId: escenario.a.id,
      role: "owner",
      ...sesion,
    },
  };
}

beforeAll(async () => {
  escenario = await seedTwoRestaurants();
  db = serviceClient();
  comoOwnerA = await authedClient(escenario.ownerA.email, escenario.ownerA.password);
}, 60_000);

afterAll(async () => {
  await escenario.cleanup();
});

describe("crearMesa", () => {
  it("crea la mesa y la base le pone un token opaco", async () => {
    const resultado = await crearMesa({ label: "Mesa 7" }, contexto());

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    const { data } = await db
      .from("restaurant_tables")
      .select("label, token, is_active, restaurant_id")
      .eq("id", resultado.data.id)
      .single();

    expect(data?.label).toBe("Mesa 7");
    expect(data?.token).toMatch(/^[0-9a-f]{32}$/);
    expect(data?.is_active).toBe(true);
    expect(data?.restaurant_id).toBe(escenario.a.id);
  });

  it("un nombre vacio no llega a la base", async () => {
    const resultado = await crearMesa({ label: "   " }, contexto());

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.code).toBe("validation_error");
  });

  it("mandar restaurant_id desde el formulario es un error, no una fuga", async () => {
    // El esquema es `.strict()`: aceptarlo seria confiarle al navegador la respuesta a
    // "de quien es esto".
    const resultado = await crearMesa(
      { label: "Mesa infiltrada", restaurant_id: escenario.b.id },
      contexto(),
    );

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.code).toBe("validation_error");
  });
});

describe("renombrarMesa", () => {
  it("cambia la etiqueta y NO toca el token", async () => {
    // Es lo que hace que renombrar sea seguro: los QR ya impresos y pegados a las mesas
    // siguen resolviendo a la misma fila.
    const creada = await crearMesa({ label: "Mesa vieja" }, contexto());
    expect(creada.ok).toBe(true);
    if (!creada.ok) return;

    const { data: antes } = await db
      .from("restaurant_tables")
      .select("token")
      .eq("id", creada.data.id)
      .single();

    const resultado = await renombrarMesa({ id: creada.data.id, label: "Mesa nueva" }, contexto());
    expect(resultado.ok).toBe(true);

    const { data: despues } = await db
      .from("restaurant_tables")
      .select("label, token")
      .eq("id", creada.data.id)
      .single();

    expect(despues?.label).toBe("Mesa nueva");
    expect(despues?.token).toBe(antes?.token);
  });

  it("la mesa de otro restaurante no existe para vos", async () => {
    const { data: ajena } = await db
      .from("restaurant_tables")
      .insert({ restaurant_id: escenario.b.id, label: "Mesa de B" })
      .select("id")
      .single();

    const resultado = await renombrarMesa({ id: ajena?.id, label: "Robada" }, contexto());

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    // `not_found` y no `forbidden`: confirmar que existe ya seria contar de mas.
    expect(resultado.error.code).toBe("not_found");
  });
});

describe("cambiarActivacionMesa", () => {
  it("desactiva y reactiva la misma fila, sin borrar nada", async () => {
    const creada = await crearMesa({ label: "Mesa de paso" }, contexto());
    expect(creada.ok).toBe(true);
    if (!creada.ok) return;

    const apagada = await cambiarActivacionMesa({ id: creada.data.id, activa: "no" }, contexto());
    expect(apagada.ok).toBe(true);

    const { data: tras } = await db
      .from("restaurant_tables")
      .select("is_active, token")
      .eq("id", creada.data.id)
      .single();
    expect(tras?.is_active).toBe(false);

    const prendida = await cambiarActivacionMesa({ id: creada.data.id, activa: "si" }, contexto());
    expect(prendida.ok).toBe(true);

    const { data: final } = await db
      .from("restaurant_tables")
      .select("is_active, token")
      .eq("id", creada.data.id)
      .single();

    expect(final?.is_active).toBe(true);
    // La fila es la MISMA: desactivar no es borrar y volver a crear.
    expect(final?.token).toBe(tras?.token);
  });
});

describe("listarMesas", () => {
  it("devuelve solo las del restaurante de la sesion", async () => {
    const mesas = await listarMesas(contexto());

    expect(mesas.length).toBeGreaterThan(0);

    const { data: ajenas } = await db
      .from("restaurant_tables")
      .select("id")
      .eq("restaurant_id", escenario.b.id);

    const idsAjenos = new Set((ajenas ?? []).map((f) => f.id as string));
    for (const mesa of mesas) {
      expect(idsAjenos.has(mesa.id)).toBe(false);
    }
  });
});

describe("slugDeMiRestaurante", () => {
  it("es el slug con el que se arma la URL del QR", async () => {
    expect(await slugDeMiRestaurante(contexto())).toBe(escenario.a.slug);
  });

  it("es null si el usuario no tiene restaurante", async () => {
    expect(await slugDeMiRestaurante(contexto({ restaurantId: null }))).toBeNull();
  });
});
