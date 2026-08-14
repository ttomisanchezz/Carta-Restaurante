import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authedClient, serviceClient, testEmail, testSlug } from "../helpers/supabase-clients.ts";

const PASSWORD = "zzz-test-password-9f3a1c";
const db = serviceClient();
let userId = "";
let restaurantId = "";
let email = "";

beforeAll(async () => {
  email = testEmail("inactividad");
  const { data: restaurante, error: errorRestaurante } = await db
    .from("restaurants")
    .insert({ slug: testSlug("inactividad"), name: "Restaurante inactividad" })
    .select("id")
    .single();
  if (errorRestaurante) throw errorRestaurante;
  restaurantId = restaurante.id;

  const { data: usuario, error: errorUsuario } = await db.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (errorUsuario || !usuario.user) throw errorUsuario ?? new Error("Usuario no creado");
  userId = usuario.user.id;

  const { error: errorPerfil } = await db
    .from("profiles")
    .insert({ id: userId, restaurant_id: restaurantId, role: "owner" });
  if (errorPerfil) throw errorPerfil;
});

afterAll(async () => {
  if (userId) await db.auth.admin.deleteUser(userId);
  if (restaurantId) await db.from("restaurants").delete().eq("id", restaurantId);
});

describe("inicio anterior", () => {
  it("el trigger conserva last_sign_in_at antes de que el login actual lo reemplace", async () => {
    await authedClient(email, PASSWORD);
    const { data: trasPrimerLogin } = await db.auth.admin.getUserById(userId);
    const primerIngreso = trasPrimerLogin.user?.last_sign_in_at;
    expect(primerIngreso).toBeTruthy();

    await authedClient(email, PASSWORD);

    const { data: perfil } = await db
      .from("profiles")
      .select("previous_sign_in_at")
      .eq("id", userId)
      .single();
    expect(Date.parse(perfil?.previous_sign_in_at ?? "")).toBe(Date.parse(primerIngreso ?? ""));
  });
});
