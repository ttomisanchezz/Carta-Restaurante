import { describe, expect, it } from "vitest";
import { loadServerEnv, serverEnvSchema } from "../../src/lib/env.ts";

/**
 * Parsea objetos FIJOS, nunca `process.env`. Un test que lee el entorno real
 * afirma cosas sobre la maquina que lo corre, no sobre el codigo.
 */

const supabaseCompleto = {
  NEXT_PUBLIC_SUPABASE_URL: "https://ejemplo.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-de-prueba",
  SUPABASE_SERVICE_ROLE_KEY: "service-de-prueba",
};

describe("serverEnvSchema", () => {
  it("falla y nombra la variable cuando falta NEXT_PUBLIC_SUPABASE_URL", () => {
    const { NEXT_PUBLIC_SUPABASE_URL: _omitida, ...sinUrl } = supabaseCompleto;

    const resultado = serverEnvSchema.safeParse(sinUrl);

    expect(resultado.success).toBe(false);
    if (resultado.success) return;
    const rutas = resultado.error.issues.map((i) => i.path.join("."));
    expect(rutas).toContain("NEXT_PUBLIC_SUPABASE_URL");
  });

  it("parsea con solo las tres de Supabase y aplica VIDEO_PROVIDER=direct", () => {
    const resultado = serverEnvSchema.safeParse(supabaseCompleto);

    expect(resultado.success).toBe(true);
    if (!resultado.success) return;
    expect(resultado.data.VIDEO_PROVIDER).toBe("direct");
    expect(resultado.data.CLOUDINARY_UPLOAD_FOLDER).toBe("carta/dev");
    expect(resultado.data.CLOUDINARY_API_KEY).toBeUndefined();
  });

  it("rechaza un VIDEO_PROVIDER que no es direct ni cloudinary", () => {
    const resultado = serverEnvSchema.safeParse({ ...supabaseCompleto, VIDEO_PROVIDER: "bunny" });

    expect(resultado.success).toBe(false);
  });
});

describe("loadServerEnv", () => {
  it("devuelve el entorno parseado desde el objeto que recibe", () => {
    const env = loadServerEnv(supabaseCompleto);

    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("https://ejemplo.supabase.co");
    expect(env.VIDEO_PROVIDER).toBe("direct");
  });

  it("lanza nombrando cada variable que falta", () => {
    expect(() => loadServerEnv({})).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });
});
