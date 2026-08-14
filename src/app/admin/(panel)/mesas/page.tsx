import type { Metadata } from "next";
import { FilaMesa } from "@/components/admin/fila-mesa";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getSiteUrl } from "@/lib/env";
import { urlDeMesa } from "@/lib/qr/codigo-qr";
import { createServerSupabase } from "@/lib/supabase/server";
import { listarMesas, slugDeMiRestaurante } from "@/server/admin/tables";
import { accionCambiarActivacionMesa, accionCrearMesa, accionRenombrarMesa } from "./actions.ts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Mesas" };

type Props = {
  searchParams: Promise<{ error?: string; creada?: string; renombrada?: string }>;
};

export default async function MesasPage({ searchParams }: Props) {
  const { error } = await searchParams;
  const sesion = await requireAdmin("/admin/mesas");
  const db = await createServerSupabase();
  const ctx = { db, sesion };

  const [slug, mesas] = await Promise.all([slugDeMiRestaurante(ctx), listarMesas(ctx)]);
  const origen = getSiteUrl();

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="titulo-seccion text-h2">Mesas</h1>
        {mesas.length > 0 ? (
          <a
            href="/admin/mesas/imprimir"
            data-testid="hoja-imprimible"
            className="boton-linea boton--chico"
          >
            Hoja para imprimir
          </a>
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          data-testid="mensaje-mesas"
          className="mt-4 rounded-control border border-error/40 bg-error/10 px-4 py-3 text-small text-error"
        >
          {error}
        </p>
      ) : null}

      <form action={accionCrearMesa} className="mt-6 flex flex-wrap items-end gap-4">
        <label className="flex flex-1 flex-col gap-2">
          <span className="text-small font-semibold">Nueva mesa</span>
          <input
            name="label"
            required
            maxLength={60}
            placeholder="Mesa 5"
            data-testid="campo-mesa"
            className="min-h-[44px] rounded-control border border-border-strong bg-surface px-4 text-body"
          />
        </label>
        <button type="submit" data-testid="crear-mesa" className="boton-marca boton--chico">
          Agregar
        </button>
      </form>

      {slug === null ? (
        <p className="mt-8 text-body text-text-muted">
          Tu usuario todavía no tiene un restaurante asignado.
        </p>
      ) : mesas.length === 0 ? (
        // Vacio con salida: el formulario de arriba es el camino, no un cartel muerto.
        <p className="mt-8 text-body text-text-muted">
          Todavía no hay mesas. Creá la primera y bajate su QR para pegarlo en la mesa.
        </p>
      ) : (
        <ul className="mt-8 flex list-none flex-col gap-4 p-0" data-testid="lista-mesas">
          {mesas.map((mesa) => (
            <FilaMesa
              key={mesa.id}
              mesa={mesa}
              url={urlDeMesa(origen, slug, mesa.token)}
              alRenombrar={accionRenombrarMesa}
              alCambiarActivacion={accionCambiarActivacionMesa}
            />
          ))}
        </ul>
      )}
    </>
  );
}
