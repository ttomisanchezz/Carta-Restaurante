import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceClient, testEmail, testSlug } from "./supabase-clients.ts";

/**
 * Escenario de aislamiento: dos restaurantes que no comparten absolutamente nada.
 *
 * Cada uno con su categoria, DOS platos y un usuario `owner` con su fila en `profiles`.
 * Todo se crea con el cliente de servicio, que saltea RLS: montar el escenario no es lo que
 * se esta probando, y montarlo por la puerta de RLS seria probar el montaje.
 *
 * **No toca los datos de BRASA.** Todo lleva los prefijos reservados y `cleanup()` borra
 * exactamente los ids que creo, nunca por patron y nunca sin `where`.
 *
 * ## Por que cada restaurante tiene DOS platos
 *
 * La policy `dishes_select` tiene una rama publica deliberada: todo plato `ready` y
 * disponible de un restaurante activo lo lee cualquiera, porque esa es exactamente la
 * carta que escanea el comensal. El owner de A no es la excepcion — ve el plato listo de
 * B por la misma puerta que lo ve un anonimo, y eso es correcto.
 *
 * Entonces un plato `ready` no sirve para medir aislamiento: seria visible con o sin fuga.
 * El que lo mide es el BORRADOR (`video_status: 'pending'`), que no entra por la rama
 * publica y solo se alcanza por `restaurant_id = current_restaurant_id()`. Si el owner de
 * A ve el borrador de B, la frontera se rompio.
 */

type Opciones = { activo: boolean };

/** Contrasena de usuarios efimeros de test. No protege nada: los usuarios se borran al terminar. */
const PASSWORD_DE_TEST = "zzz-test-password-9f3a1c";

export type RestauranteDePrueba = {
  id: string;
  slug: string;
  categoryId: string;
  /**
   * Una segunda categoria, SIN platos adentro.
   *
   * Existe para que el test de borrado cruzado mida RLS y nada mas. `categoryId` tiene
   * platos, y `dishes.category_id` es `on delete restrict`: un intento de borrarla se
   * frenaria por la foreign key aunque las policies estuvieran abiertas de par en par, y
   * el test pasaria por el motivo equivocado. Esta no tiene esa red debajo.
   */
  categoryVaciaId: string;
  /** `ready` + disponible: entra por la rama publica de la policy, lo ve cualquiera. */
  platoListoId: string;
  /** `pending`: fuera de la rama publica. Solo su propio owner deberia verlo. */
  platoBorradorId: string;
};

export type OwnerDePrueba = {
  userId: string;
  email: string;
  password: string;
};

export type EscenarioDeAislamiento = {
  /** Restaurante A, activo. Su owner es el que intenta cruzar la frontera en los tests. */
  a: RestauranteDePrueba;
  /** Restaurante B, activo. La victima: nada de lo suyo puede moverse desde A. */
  b: RestauranteDePrueba;
  /**
   * Un tercero, INACTIVO, con su plato en `ready`.
   *
   * El fixture se llama "dos restaurantes" porque dos son los que se aislan entre si. Este
   * existe para una afirmacion distinta, que necesita su propia fila: que el anonimo no ve
   * la carta de un restaurante dado de baja. No se puede reusar B para eso sin apagarlo, y
   * apagarlo debilitaria todos los demas tests.
   */
  inactivo: RestauranteDePrueba;
  ownerA: OwnerDePrueba;
  ownerB: OwnerDePrueba;
  cleanup: () => Promise<void>;
};

async function crearRestaurante(
  db: SupabaseClient,
  nombre: string,
  { activo }: Opciones,
): Promise<RestauranteDePrueba> {
  const { data: restaurante, error } = await db
    .from("restaurants")
    .insert({ slug: testSlug(nombre), name: `Restaurante ${nombre}`, is_active: activo })
    .select("id, slug")
    .single();
  if (error) throw new Error(`No pude crear el restaurante ${nombre}: ${error.message}`);

  const { data: categorias, error: errorCategoria } = await db
    .from("categories")
    .insert([
      { restaurant_id: restaurante.id, name: `Principales de ${nombre}`, sort_order: 0 },
      { restaurant_id: restaurante.id, name: `Vacia de ${nombre}`, sort_order: 1 },
    ])
    .select("id, sort_order");
  if (errorCategoria || !categorias) {
    throw new Error(
      `No pude crear las categorias de ${nombre}: ${errorCategoria?.message ?? "sin filas"}`,
    );
  }

  const categoria = categorias.find((c) => c.sort_order === 0);
  const categoriaVacia = categorias.find((c) => c.sort_order === 1);
  if (!categoria || !categoriaVacia) {
    throw new Error(`Faltan categorias en el escenario de ${nombre}`);
  }

  const { data: platos, error: errorPlatos } = await db
    .from("dishes")
    .insert([
      {
        restaurant_id: restaurante.id,
        category_id: categoria.id,
        name: `Plato listo de ${nombre}`,
        description: `El que sale en la carta de ${nombre}`,
        price: 1_250_000,
        video_status: "ready",
        is_available: true,
        sort_order: 0,
      },
      {
        restaurant_id: restaurante.id,
        category_id: categoria.id,
        name: `Borrador de ${nombre}`,
        description: `Todavia sin video, no sale en la carta de ${nombre}`,
        price: 990_000,
        video_status: "pending",
        is_available: true,
        sort_order: 1,
      },
    ])
    .select("id, video_status");
  if (errorPlatos || !platos) {
    throw new Error(
      `No pude crear los platos de ${nombre}: ${errorPlatos?.message ?? "sin filas"}`,
    );
  }

  const listo = platos.find((p) => p.video_status === "ready");
  const borrador = platos.find((p) => p.video_status === "pending");
  if (!listo || !borrador) throw new Error(`Faltan platos en el escenario de ${nombre}`);

  return {
    id: restaurante.id,
    slug: restaurante.slug,
    categoryId: categoria.id,
    categoryVaciaId: categoriaVacia.id,
    platoListoId: listo.id,
    platoBorradorId: borrador.id,
  };
}

async function crearOwner(
  db: SupabaseClient,
  restaurantId: string,
  nombre: string,
): Promise<OwnerDePrueba> {
  const email = testEmail(nombre);

  // `email_confirm: true` evita depender de la configuracion de confirmacion del proyecto:
  // el usuario nace confirmado y puede hacer signInWithPassword en la linea siguiente.
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: PASSWORD_DE_TEST,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`No pude crear el usuario ${nombre}: ${error?.message ?? "sin usuario"}`);
  }

  const { error: errorPerfil } = await db
    .from("profiles")
    .insert({ id: data.user.id, restaurant_id: restaurantId, role: "owner" });
  if (errorPerfil) {
    throw new Error(`No pude crear el perfil de ${nombre}: ${errorPerfil.message}`);
  }

  return { userId: data.user.id, email, password: PASSWORD_DE_TEST };
}

export async function seedTwoRestaurants(): Promise<EscenarioDeAislamiento> {
  const db = serviceClient();

  const a = await crearRestaurante(db, "aaa", { activo: true });
  const b = await crearRestaurante(db, "bbb", { activo: true });
  const inactivo = await crearRestaurante(db, "apagado", { activo: false });

  const ownerA = await crearOwner(db, a.id, "ownera");
  const ownerB = await crearOwner(db, b.id, "ownerb");

  const cleanup = async (): Promise<void> => {
    // Borrar el usuario arrastra su fila de `profiles` (on delete cascade).
    for (const { userId } of [ownerA, ownerB]) {
      await db.auth.admin.deleteUser(userId);
    }

    // Por id, nunca por patron. Y dishes antes que categories: category_id es RESTRICT.
    for (const { id } of [a, b, inactivo]) {
      await db.from("dishes").delete().eq("restaurant_id", id);
      await db.from("categories").delete().eq("restaurant_id", id);
      await db.from("restaurants").delete().eq("id", id);
    }
  };

  return { a, b, inactivo, ownerA, ownerB, cleanup };
}
