import { beforeAll, describe, expect, it } from "vitest";
import { anonClient, serviceClient } from "../helpers/supabase-clients.ts";

/**
 * RLS habilitado y con policies, contra la base real.
 *
 * Afirma PROPIEDADES por entidad, no un conteo de tablas: `rls_status()` devuelve
 * todas las tablas de `public`, y ese conjunto crece con el esquema. Lo que no puede
 * cambiar es que cada entidad del modelo tenga RLS prendido y al menos una policy.
 *
 * No crea ninguna fila, asi que no hay nada que limpiar.
 */

/** Las cuatro entidades del modelo. Mismo conjunto que afirma schema.test.ts. */
const ENTIDADES_DEL_MODELO = ["restaurants", "categories", "dishes", "profiles"] as const;

type FilaRlsStatus = {
  table_name: string;
  rls_enabled: boolean;
  policy_count: number;
};

const db = serviceClient();
const anon = anonClient();

/** Una sola llamada a `rls_status()`, indexada por tabla, para no ir 8 veces a la base. */
const porTabla = new Map<string, FilaRlsStatus>();

beforeAll(async () => {
  const { data, error } = await db.rpc("rls_status");

  expect(error).toBeNull();
  for (const fila of (data ?? []) as FilaRlsStatus[]) {
    porTabla.set(fila.table_name, fila);
  }
});

describe("rls_status con el cliente de servicio", () => {
  it.each(ENTIDADES_DEL_MODELO)("la entidad %s aparece en el diagnostico", (tabla) => {
    expect(porTabla.has(tabla)).toBe(true);
  });

  it.each(ENTIDADES_DEL_MODELO)("la entidad %s tiene RLS habilitado", (tabla) => {
    expect(porTabla.get(tabla)?.rls_enabled).toBe(true);
  });

  it.each(ENTIDADES_DEL_MODELO)("la entidad %s tiene al menos una policy", (tabla) => {
    // bigint de Postgres: PostgREST lo puede serializar como numero o como texto.
    expect(Number(porTabla.get(tabla)?.policy_count)).toBeGreaterThanOrEqual(1);
  });
});

describe("rls_status con el cliente anonimo", () => {
  it("devuelve error y ningun dato", async () => {
    const { data, error } = await anon.rpc("rls_status");

    // La funcion tiene `revoke all ... from anon` y `grant execute ... to service_role`.
    // No se afirma el codigo ni el mensaje: segun la version, PostgREST contesta
    // permiso denegado o funcion inexistente, y ambas cumplen el requisito.
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });
});

describe("profiles con el cliente anonimo", () => {
  it("devuelve cero filas, no un error", async () => {
    const { data, error } = await anon.from("profiles").select("id");

    // La policy es `id = auth.uid()`: para el anonimo `auth.uid()` es null, asi que no
    // matchea ninguna fila. RLS filtra, no rechaza — por eso la
    // respuesta correcta es una lista vacia y NO un error.
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
