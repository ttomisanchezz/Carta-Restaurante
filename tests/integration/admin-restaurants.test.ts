import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SesionAdmin } from "@/lib/auth/require-admin";
import { cambiarEstadoRestaurante, crearRestaurante } from "@/server/admin/restaurants";
import type { ContextoAdmin } from "@/server/admin/resultado";
import {
  type EscenarioDeAislamiento,
  seedTwoRestaurants,
} from "../helpers/seed-two-restaurants.ts";
import { authedClient, serviceClient, testSlug } from "../helpers/supabase-clients.ts";

/**
 * El alta de restaurantes, contra la base real y con las policies puestas.
 *
 * Los clientes son AUTENTICADOS, no el de servicio: si esto corriera con la clave de
 * servicio, RLS no se aplicaria y el test diria que si a todo. El contexto se inyecta —por
 * eso `src/server/admin/**` recibe el cliente en vez de construirlo— y asi se puede probar
 * codigo que en produccion vive detras de `next/headers`.
 */

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@carta.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "carta-admin-local";

const db = serviceClient();
let escenario: EscenarioDeAislamiento;
let comoSuperadmin: ContextoAdmin;
let comoOwner: ContextoAdmin;
const creados: string[] = [];

async function contarRestaurantes(slug: string): Promise<number> {
  const { count } = await db
    .from("restaurants")
    .select("id", { count: "exact", head: true })
    .eq("slug", slug);
  return count ?? 0;
}

beforeAll(async () => {
  escenario = await seedTwoRestaurants();

  const clienteAdmin: SupabaseClient = await authedClient(ADMIN_EMAIL, ADMIN_PASSWORD);
  const { data: perfil } = await db
    .from("profiles")
    .select("id, restaurant_id, role")
    .eq("role", "superadmin")
    .single();

  comoSuperadmin = {
    db: clienteAdmin,
    sesion: {
      userId: perfil?.id as string,
      restaurantId: perfil?.restaurant_id ?? null,
      role: "superadmin",
    } satisfies SesionAdmin,
  };

  comoOwner = {
    db: await authedClient(escenario.ownerA.email, escenario.ownerA.password),
    sesion: { userId: escenario.ownerA.userId, restaurantId: escenario.a.id, role: "owner" },
  };
});

afterAll(async () => {
  for (const id of creados) {
    await db.from("dishes").delete().eq("restaurant_id", id);
    await db.from("categories").delete().eq("restaurant_id", id);
    await db.from("restaurants").delete().eq("id", id);
  }
  await escenario.cleanup();
});

describe("crear restaurante", () => {
  it("un superadmin con datos validos crea exactamente una fila", async () => {
    const slug = testSlug("alta");

    const resultado = await crearRestaurante(
      { slug, name: "Parrilla nueva", primary_color: "#123ABC" },
      comoSuperadmin,
    );

    expect(resultado.ok).toBe(true);
    if (resultado.ok) creados.push(resultado.data.id);

    expect(await contarRestaurantes(slug)).toBe(1);
  });

  it("un slug repetido da conflict y no inserta nada", async () => {
    const slug = testSlug("repe");

    const primero = await crearRestaurante({ slug, name: "El primero" }, comoSuperadmin);
    expect(primero.ok).toBe(true);
    if (primero.ok) creados.push(primero.data.id);

    const segundo = await crearRestaurante({ slug, name: "El segundo" }, comoSuperadmin);

    expect(segundo.ok).toBe(false);
    if (!segundo.ok) expect(segundo.error.code).toBe("conflict");

    // Sigue habiendo uno solo: el conflicto no dejo una fila a medias.
    expect(await contarRestaurantes(slug)).toBe(1);
  });

  it("un color que no es hex da validation_error nombrando el campo", async () => {
    const slug = testSlug("color");

    const resultado = await crearRestaurante(
      { slug, name: "Color raro", primary_color: "rojo" },
      comoSuperadmin,
    );

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error.code).toBe("validation_error");
      // El detalle nombra el campo: sin eso el formulario no sabe donde pintar el error.
      expect(resultado.error.details?.map((d) => d.field)).toContain("primary_color");
    }

    expect(await contarRestaurantes(slug)).toBe(0);
  });

  it("un owner no puede crear restaurantes", async () => {
    const slug = testSlug("intruso");

    const resultado = await crearRestaurante({ slug, name: "No deberia existir" }, comoOwner);

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.code).toBe("forbidden");

    expect(await contarRestaurantes(slug)).toBe(0);
  });

  it("el owner recibe forbidden aunque los datos sean invalidos", async () => {
    // La autorizacion se resuelve ANTES de validar: contestarle "el color es inválido" a
    // quien no tiene permiso le confirma que campos tiene el formulario.
    const resultado = await crearRestaurante(
      { slug: "MAYUSCULAS INVALIDAS", name: "", primary_color: "rojo" },
      comoOwner,
    );

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.code).toBe("forbidden");
  });

  it("rechaza campos que no estan en el esquema", async () => {
    // `.strict()`: si el formulario manda `is_active` o `id`, no se cuela hasta la base.
    const resultado = await crearRestaurante(
      { slug: testSlug("extra"), name: "Con basura", is_active: false },
      comoSuperadmin,
    );

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.code).toBe("validation_error");
  });
});

describe("dar de baja un restaurante", () => {
  it("el superadmin lo apaga y la fila queda con is_active en false", async () => {
    const slug = testSlug("baja");
    const creado = await crearRestaurante({ slug, name: "Se va de baja" }, comoSuperadmin);
    expect(creado.ok).toBe(true);
    if (!creado.ok) return;
    creados.push(creado.data.id);

    const resultado = await cambiarEstadoRestaurante(
      { id: creado.data.id, is_active: false },
      comoSuperadmin,
    );

    expect(resultado.ok).toBe(true);

    const { data } = await db
      .from("restaurants")
      .select("is_active")
      .eq("id", creado.data.id)
      .single();
    expect(data?.is_active).toBe(false);
  });

  it("un owner no puede apagar el restaurante de otro", async () => {
    const resultado = await cambiarEstadoRestaurante(
      { id: escenario.b.id, is_active: false },
      comoOwner,
    );

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.code).toBe("forbidden");

    const { data } = await db
      .from("restaurants")
      .select("is_active")
      .eq("id", escenario.b.id)
      .single();
    expect(data?.is_active).toBe(true);
  });
});
