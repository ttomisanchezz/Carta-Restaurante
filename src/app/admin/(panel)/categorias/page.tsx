import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { listarCategorias } from "@/server/admin/categories";
import { accionBorrarCategoria, accionCrearCategoria, accionSubirCategoria } from "./actions.ts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Categorías" };

type Props = {
  searchParams: Promise<{ error?: string; creada?: string; borrada?: string }>;
};

export default async function CategoriasPage({ searchParams }: Props) {
  const { error } = await searchParams;
  const sesion = await requireAdmin("/admin/categorias");
  const db = await createServerSupabase();

  const categorias = await listarCategorias({ db, sesion });

  return (
    <>
      <h1 className="text-h2 font-bold">Categorías</h1>

      {error ? (
        <p
          role="alert"
          data-testid="mensaje-categorias"
          className="mt-4 rounded-control border border-error/40 bg-error/10 px-4 py-3 text-small text-error"
        >
          {error}
        </p>
      ) : null}

      <form action={accionCrearCategoria} className="mt-6 flex flex-wrap items-end gap-4">
        <label className="flex flex-1 flex-col gap-2">
          <span className="text-small font-semibold">Nueva categoría</span>
          <input
            name="name"
            required
            data-testid="campo-categoria"
            className="min-h-[44px] rounded-control border border-border-strong bg-surface px-4 text-body"
          />
        </label>
        <button
          type="submit"
          data-testid="crear-categoria"
          className="min-h-[44px] rounded-control bg-brand px-4 text-small font-semibold text-on-brand"
        >
          Agregar
        </button>
      </form>

      {categorias.length === 0 ? (
        // Vacio con salida, no un cartel muerto: el formulario de arriba es el camino.
        <p className="mt-8 text-body text-text-muted">Todavía no hay categorías.</p>
      ) : (
        <ul className="mt-8 flex list-none flex-col gap-2 p-0" data-testid="lista-categorias">
          {categorias.map((categoria, indice) => (
            <li
              key={categoria.id}
              data-testid="fila-categoria"
              data-nombre={categoria.name}
              className="flex items-center justify-between gap-4 rounded-card border border-border p-4"
            >
              <div className="flex flex-col">
                <span className="text-body font-semibold">{categoria.name}</span>
                <span className="text-caption text-text-muted">
                  {categoria.platos} {categoria.platos === 1 ? "plato" : "platos"}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <form action={accionSubirCategoria}>
                  <input type="hidden" name="id" value={categoria.id} />
                  <button
                    type="submit"
                    data-testid="subir-categoria"
                    aria-label={`Subir ${categoria.name}`}
                    // La primera no se puede subir. Se deshabilita en vez de esconderse:
                    // los controles no se mueven de lugar entre filas.
                    disabled={indice === 0}
                    className="min-h-[44px] min-w-[44px] rounded-control border border-border-strong px-4 text-small font-semibold disabled:opacity-40"
                  >
                    ↑
                  </button>
                </form>

                <form action={accionBorrarCategoria}>
                  <input type="hidden" name="id" value={categoria.id} />
                  <button
                    type="submit"
                    data-testid="borrar-categoria"
                    aria-label={`Borrar ${categoria.name}`}
                    className="min-h-[44px] rounded-control border border-border-strong px-4 text-small font-semibold text-error"
                  >
                    Borrar
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
