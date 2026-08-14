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
  video_playback_id: string | null;
  video_status: string;
  category_id: string;
};

const db = serviceClient();
let platos: Plato[] = [];

beforeAll(async () => {
  const { data, error } = await db
    .from("dishes")
    .select(
      "id, name, price, pairing_text, thumbnail_url, video_playback_id, video_status, category_id",
    )
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

  it("todos traen maridaje escrito y su propio video", () => {
    for (const plato of platos) {
      expect(plato.pairing_text).not.toBeNull();
      // El maridaje en la voz del dueno es lo unico que ninguna carta en PDF tiene.
      // Los 20 caracteres son el piso que separa una frase de un placeholder.
      expect((plato.pairing_text ?? "").length).toBeGreaterThan(20);
      expect(plato.video_playback_id ?? "").not.toBe("");
    }
  });

  /**
   * El poster ya no se guarda: con `thumbnail_url` en null lo deriva el proveedor del propio
   * video, asi que la grilla en reposo muestra comida y no un grafico.
   *
   * Que la columna siga en null es una afirmacion que vale la pena: el dia que alguien le
   * cargue un `thumbnail_url` a un plato, ese plato deja de mostrar su video y vuelve al
   * poster guardado, sin que nada avise.
   */
  it("ninguno guarda poster propio: lo deriva del video", () => {
    for (const plato of platos) {
      expect(plato.thumbnail_url, `"${plato.name}" tiene thumbnail_url guardado`).toBeNull();
    }
  });

  /**
   * El respaldo del proveedor `direct`, que es el que corre en los tests y en desarrollo.
   *
   * Traduce el id a `/<id>.svg`, asi que el archivo TIENE que llamarse igual que el public
   * id. Si falta, la suite entera corre contra una grilla de imagenes rotas y los tests que
   * miran posters dejan de significar algo.
   */
  it("cada video tiene su poster de respaldo en public/, con el nombre del public id", () => {
    for (const plato of platos) {
      const ruta = join(process.cwd(), "public", `${plato.video_playback_id}.svg`);
      expect(existsSync(ruta), `falta el respaldo de "${plato.name}" en ${ruta}`).toBe(true);
    }
  });

  /**
   * Los public id viajan dentro de una URL de la CDN. Con un acento crudo, Cloudinary
   * contesta 400 y el plato queda sin video — paso de verdad con `entraña_clw2vd`.
   */
  it("ningun public id tiene caracteres fuera de ASCII", () => {
    for (const plato of platos) {
      const id = plato.video_playback_id ?? "";
      // Se listan los culpables en vez de afirmar un booleano: cuando falle, el mensaje
      // dice QUE caracter lo rompio, que es lo unico que uno quiere saber en ese momento.
      const fueraDeAscii = [...id].filter((c) => {
        const codigo = c.charCodeAt(0);
        return codigo < 32 || codigo > 126;
      });

      expect(fueraDeAscii, `"${plato.name}" usa el id "${id}"`).toEqual([]);
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

describe("roles del panel", () => {
  it("todos los perfiles son owner", async () => {
    const { data, error } = await db.from("profiles").select("id, role");

    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
    expect((data ?? []).every((perfil) => perfil.role === "owner")).toBe(true);
  });
});
