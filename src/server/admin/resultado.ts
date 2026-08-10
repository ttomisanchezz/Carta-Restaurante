import type { SupabaseClient } from "@supabase/supabase-js";
import type { ZodError } from "zod";
import type { SesionAdmin } from "@/lib/auth/require-admin";

/**
 * La forma unica del resultado de una Server Action.
 *
 * **Nunca se lanza un string y nunca se lanza para controlar flujo.** Una excepcion que
 * cruza la frontera del servidor al cliente en Next llega al navegador como "an error
 * occurred in the Server Components render" y nada mas: el motivo real se pierde.
 *
 * El `code` es contrato y no cambia. El `message` es texto para humanos y puede cambiar,
 * asi que los tests afirman codigos, nunca mensajes.
 */

export type CodigoError =
  | "validation_error"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "provider_unavailable"
  | "internal_error";

export type DetalleDeCampo = { field: string; message: string };

export type ResultadoAccion<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: CodigoError; message: string; details?: DetalleDeCampo[] } };

/**
 * Lo que necesita una operacion de administracion para trabajar.
 *
 * Se pasa como parametro en vez de construirse adentro, y esa es la razon por la que estas
 * operaciones se pueden probar: `createServerSupabase()` importa `next/headers` y muere
 * fuera de un request, asi que un test jamas podria llamarlas si lo crearan ellas mismas.
 * Acá el test inyecta un cliente autenticado de verdad y las policies de RLS corren igual.
 */
export type ContextoAdmin = {
  db: SupabaseClient;
  sesion: SesionAdmin;
};

export function exito<T>(data: T): ResultadoAccion<T> {
  return { ok: true, data };
}

export function falla<T = never>(
  code: CodigoError,
  message: string,
  details?: DetalleDeCampo[],
): ResultadoAccion<T> {
  return { ok: false, error: details ? { code, message, details } : { code, message } };
}

/** Traduce un fallo de zod al sobre de error, con un detalle por campo. */
export function fallaDeValidacion<T = never>(error: ZodError): ResultadoAccion<T> {
  return falla<T>(
    "validation_error",
    "Revisá los datos del formulario.",
    error.issues.map((issue) => ({
      field: issue.path.join(".") || "(raiz)",
      message: issue.message,
    })),
  );
}

/**
 * Traduce un error de Postgres al codigo que corresponde.
 *
 * El choque de `slug` se detecta por el error de la base y **no preguntando antes si
 * existe**: preguntar antes es una condicion de carrera — entre el SELECT y el INSERT
 * alguien puede quedarse con el slug, y el usuario ve un 500 en vez de "ya existe".
 */
export function fallaDePostgres<T = never>(
  codigo: string | undefined,
  mensajes: { conflict?: string; forbidden?: string },
): ResultadoAccion<T> {
  // 23505 = unique_violation.
  if (codigo === "23505") {
    return falla<T>("conflict", mensajes.conflict ?? "Ese valor ya está en uso.");
  }
  // 42501 = insufficient_privilege: lo devuelve RLS cuando el `with check` rechaza la fila.
  if (codigo === "42501") {
    return falla<T>("forbidden", mensajes.forbidden ?? "No tenés permiso para hacer esto.");
  }
  return falla<T>("internal_error", "No pudimos completar la operación.");
}
