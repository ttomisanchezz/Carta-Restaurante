import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { listarRestaurantes } from "@/server/admin/restaurants";
import { accionCambiarEstado, accionCrearRestaurante } from "./actions.ts";

/**
 * Restaurantes del panel. Alta y baja, solo para superadmin.
 *
 * Un owner que llegue acá ve su propio restaurante y nada mas — eso lo decide RLS, no un
 * `if` de esta pagina.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Restaurantes" };

const MENSAJES: Record<string, string> = {
  conflict: "Ya existe un restaurante con ese slug.",
  validation_error: "Revisá los datos del formulario.",
  forbidden: "No tenés permiso para hacer eso.",
  not_found: "No encontramos ese restaurante.",
  internal_error: "No pudimos completar la operación.",
};

type Props = {
  searchParams: Promise<{ error?: string; campos?: string; creado?: string; estado?: string }>;
};

export default async function RestaurantesPage({ searchParams }: Props) {
  const { error, campos, creado } = await searchParams;
  const sesion = await requireAdmin("/admin/restaurantes");
  const db = await createServerSupabase();

  const restaurantes = await listarRestaurantes({ db, sesion });
  const esSuperadmin = sesion.role === "superadmin";

  return (
    <>
      <h1 className="titulo-seccion text-h2">Restaurantes</h1>

      {error ? (
        <p
          role="alert"
          data-testid="mensaje-restaurantes"
          className="mt-4 rounded-control border border-error/40 bg-error/10 px-4 py-3 text-small text-error"
        >
          {MENSAJES[error] ?? MENSAJES.internal_error}
          {campos ? ` (${campos})` : ""}
        </p>
      ) : null}

      {creado ? (
        <p
          role="status"
          data-testid="mensaje-restaurantes"
          className="mt-4 rounded-control border border-success/40 bg-success/10 px-4 py-3 text-small text-success"
        >
          Restaurante creado.
        </p>
      ) : null}

      {esSuperadmin ? (
        <form action={accionCrearRestaurante} className="mt-6 flex flex-col gap-4">
          <h2 className="text-h3 font-semibold">Nuevo restaurante</h2>

          <label className="flex flex-col gap-2">
            <span className="text-small font-semibold">Nombre</span>
            <input
              name="name"
              required
              data-testid="campo-nombre"
              className="min-h-[44px] rounded-control border border-border-strong bg-surface px-4 text-body"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-small font-semibold">Slug</span>
            <input
              name="slug"
              required
              data-testid="campo-slug"
              // Sin `pattern` en el HTML a proposito: el navegador bloquearia el envio y el
              // servidor nunca veria la entrada invalida. La validacion de verdad es la de
              // zod mas el check de la base, y tiene que poder ejercitarse.
              className="min-h-[44px] rounded-control border border-border-strong bg-surface px-4 text-body"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-small font-semibold">Color de marca</span>
            <input
              name="primary_color"
              defaultValue="#E15A2B"
              data-testid="campo-color"
              className="min-h-[44px] rounded-control border border-border-strong bg-surface px-4 text-body"
            />
          </label>

          <button
            type="submit"
            data-testid="crear-restaurante"
            className="boton-marca boton--chico self-start"
          >
            Crear
          </button>
        </form>
      ) : null}

      <ul className="mt-8 flex list-none flex-col gap-2 p-0" data-testid="lista-restaurantes">
        {restaurantes.map((r) => (
          <li
            key={r.id}
            data-testid="fila-restaurante"
            data-slug={r.slug}
            className="flex items-center justify-between gap-4 rounded-card border border-border p-4"
          >
            <div className="flex flex-col">
              <span className="text-body font-semibold">{r.name}</span>
              <span className="text-caption text-text-muted">
                /{r.slug} · {r.is_active ? "publicado" : "dado de baja"}
              </span>
            </div>

            {esSuperadmin ? (
              <form action={accionCambiarEstado}>
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="is_active" value={r.is_active ? "false" : "true"} />
                <button
                  type="submit"
                  data-testid="alternar-estado"
                  className="boton-linea boton--chico"
                >
                  {r.is_active ? "Dar de baja" : "Publicar"}
                </button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}
