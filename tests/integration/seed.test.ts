import { existsSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { serviceClient } from "../helpers/supabase-clients.ts";

/**
 * BRASA, la demo de ventas.
 *
 * No es data de prueba: `/brasa` es la pantalla que se le muestra a un restaurante candidato.
 * Un plato sin poster o sin maridaje es una reunion perdida, y de eso se ocupa este archivo.
 *
 * No crea ni borra nada. BRASA la siembra `supabase/seed.sql` via `pnpm db:push`.
 */

const BRASA_ID = "b0000000-0000-4000-8000-000000000001";

type Plato = {
  id: string;
  name: string;
  price: number;
  pairing_text: string | null;
  thumbnail_url: string | null;
  video_status: string;
  category_id: string;
};

const db = serviceClient();
let platos: Plato[] = [];

beforeAll(async () => {
  const { data, error } = await db
    .from("dishes")
    .select("id, name, price, pairing_text, thumbnail_url, video_status, category_id")
    .eq("restaurant_id", BRASA_ID)
    .order("sort_order");

  expect(error).toBeNull();
  platos = (data ?? []) as Plato[];
});

describe("el restaurante", () => {
  it("existe exactamente uno con slug brasa, activo y con el color de marca", async () => {
    const { data, error } = await db
      .from("restaurants")
      .select("id, is_active, primary_color, currency")
      .eq("slug", "brasa");

    expect(error).toBeNull();
    // Exactamente uno: es lo que prueba que el seed es idempotente y no duplica la demo
    // cada vez que corre `pnpm db:push`.
    expect(data).toHaveLength(1);
    expect(data?.[0].id).toBe(BRASA_ID);
    expect(data?.[0].is_active).toBe(true);
    expect(data?.[0].primary_color).toBe("#E15A2B");
    expect(data?.[0].currency).toBe("ARS");
  });
});

describe("las categorias", () => {
  it("son 4 y ninguna comparte sort_order con otra", async () => {
    const { data, error } = await db
      .from("categories")
      .select("id, name, sort_order")
      .eq("restaurant_id", BRASA_ID);

    expect(error).toBeNull();
    expect(data).toHaveLength(4);

    const ordenes = (data ?? []).map((c) => c.sort_order);
    // Un empate en sort_order hace que el orden de la carta dependa del planificador de
    // Postgres, o sea que cambia solo entre cargas.
    expect(new Set(ordenes).size).toBe(ordenes.length);
  });
});

describe("los platos", () => {
  it("son 12, todos listos y con precio positivo", () => {
    expect(platos).toHaveLength(12);

    for (const plato of platos) {
      // Un plato que no esta `ready` no aparece en la carta publica: lo tapa la propia
      // policy de RLS. En la demo eso seria un plato invisible.
      expect(plato.video_status).toBe("ready");
      expect(plato.price).toBeGreaterThan(0);
      expect(Number.isInteger(plato.price)).toBe(true);
    }
  });

  it("todos traen maridaje escrito y poster propio", () => {
    for (const plato of platos) {
      expect(plato.pairing_text).not.toBeNull();
      // El maridaje en la voz del dueno es lo unico que ninguna carta en PDF tiene.
      // Los 20 caracteres son el piso que separa una frase de un placeholder.
      expect((plato.pairing_text ?? "").length).toBeGreaterThan(20);
      expect(plato.thumbnail_url ?? "").toMatch(/^\/seed\//);
    }
  });

  it("cada poster existe de verdad en public/", () => {
    for (const plato of platos) {
      // El seed tiene que funcionar sin red: si el SVG no esta en disco, la grilla sale
      // rota y el test de presupuesto de bytes del paso 17 no significa nada.
      const ruta = join(process.cwd(), "public", (plato.thumbnail_url ?? "").replace(/^\//, ""));
      expect(existsSync(ruta), `falta el poster de "${plato.name}" en ${ruta}`).toBe(true);
    }
  });

  it("reparte los 12 platos entre las 4 categorias, sin ninguna vacia", () => {
    const porCategoria = new Set(platos.map((p) => p.category_id));
    expect(porCategoria.size).toBe(4);
  });

  it("conserva los acentos y las enes del castellano", () => {
    // El copy de la demo pasa por la CLI de Supabase, Postgres y PostgREST. Si alguna capa
    // rompe UTF-8, el candidato ve "Entra?a fina" en la reunion.
    const nombres = platos.map((p) => p.name);
    expect(nombres).toContain("Entraña fina");
    expect(nombres).toContain("Champiñones al ajillo");
    expect(nombres).toContain("Mollejas al limón");
  });
});

describe("el usuario administrador", () => {
  it("hay exactamente un superadmin", async () => {
    const { data, error } = await db
      .from("profiles")
      .select("id, restaurant_id")
      .eq("role", "superadmin");

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    // Un superadmin no pertenece a ningun restaurante: los ve todos.
    expect(data?.[0].restaurant_id).toBeNull();
  });
});
