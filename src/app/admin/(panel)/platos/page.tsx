import type { Metadata } from "next";
import { ChecklistActivacion } from "@/components/admin/checklist-activacion";
import { TablaMetricas } from "@/components/admin/tabla-metricas";
import { VideoUploader } from "@/components/admin/video-uploader";
import { requireAdmin } from "@/lib/auth/require-admin";
import { formatPrice } from "@/lib/format/price";
import { createServerSupabase } from "@/lib/supabase/server";
import { listarCategorias } from "@/server/admin/categories";
import { listarPlatos } from "@/server/admin/dishes";
import { listarMetricas } from "@/server/admin/metrics";
import {
  accionBajarPlato,
  accionConfirmarVideo,
  accionCrearPlato,
  accionDuplicarPlato,
} from "./actions.ts";

/**
 * Platos del panel: alta, duplicado y orden dentro de cada categoria.
 *
 * La subida de video llega en el paso 16; hasta entonces un plato nuevo nace en `pending`
 * y por eso no aparece en la carta publica — lo tapa la policy, no un `if` de acá.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Platos" };

type Props = {
  searchParams: Promise<{ error?: string; creado?: string; duplicado?: string }>;
};

export default async function PlatosPage({ searchParams }: Props) {
  const { error } = await searchParams;
  // Tambien acá y no solo en el layout: un refactor puede dejar de envolver esta pagina y
  // nadie se entera hasta que alguien entra sin sesion.
  const sesion = await requireAdmin("/admin/platos");
  const db = await createServerSupabase();
  const ctx = { db, sesion };

  const [categorias, platos, metricas] = await Promise.all([
    listarCategorias(ctx),
    listarPlatos(ctx),
    listarMetricas(ctx),
  ]);
  const nombreDeCategoria = new Map(categorias.map((c) => [c.id, c.name]));
  const videosListos = platos.filter((plato) => plato.video_status === "ready").length;
  const maridajesCargados = platos.filter(
    (plato) => (plato.pairing_text?.trim().length ?? 0) > 0,
  ).length;

  return (
    <>
      <h1 className="titulo-seccion text-h2">Platos</h1>

      {error ? (
        <p
          role="alert"
          data-testid="mensaje-platos"
          className="mt-4 rounded-control border border-error/40 bg-error/10 px-4 py-3 text-small text-error"
        >
          {error}
        </p>
      ) : null}

      {sesion.restaurantId !== null ? (
        <>
          <ChecklistActivacion
            total={platos.length}
            videosListos={videosListos}
            maridajesCargados={maridajesCargados}
          />
          <TablaMetricas metricas={metricas} />
        </>
      ) : null}

      {categorias.length === 0 ? (
        <p className="mt-6 text-body text-text-muted">
          Primero creá una categoría: un plato siempre vive dentro de una.
        </p>
      ) : (
        <form action={accionCrearPlato} className="mt-6 flex flex-col gap-4">
          <h2 className="text-h3 font-semibold">Nuevo plato</h2>

          <label className="flex flex-col gap-2">
            <span className="text-small font-semibold">Nombre</span>
            <input
              name="name"
              required
              data-testid="campo-plato-nombre"
              className="min-h-[44px] rounded-control border border-border-strong bg-surface px-4 text-body"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-small font-semibold">Categoría</span>
            <select
              name="category_id"
              required
              data-testid="campo-plato-categoria"
              className="min-h-[44px] rounded-control border border-border-strong bg-surface px-4 text-body"
            >
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-small font-semibold">Precio</span>
            <input
              name="price"
              required
              inputMode="decimal"
              placeholder="13500,50"
              data-testid="campo-plato-precio"
              className="min-h-[44px] rounded-control border border-border-strong bg-surface px-4 text-body"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-small font-semibold">Descripción</span>
            <input
              name="description"
              data-testid="campo-plato-descripcion"
              className="min-h-[44px] rounded-control border border-border-strong bg-surface px-4 text-body"
            />
          </label>

          <button
            type="submit"
            data-testid="crear-plato"
            className="boton-marca boton--chico self-start"
          >
            Crear
          </button>
        </form>
      )}

      {platos.length === 0 ? (
        <p className="mt-8 text-body text-text-muted">Todavía no hay platos.</p>
      ) : (
        <ul className="mt-8 flex list-none flex-col gap-2 p-0" data-testid="lista-platos">
          {platos.map((plato) => (
            <li
              key={plato.id}
              data-testid="fila-plato"
              data-nombre={plato.name}
              data-categoria={plato.category_id}
              className="flex items-center justify-between gap-4 rounded-card border border-border p-4"
            >
              <div className="flex flex-col">
                <span className="text-body font-semibold">{plato.name}</span>
                <span className="text-caption text-text-muted">
                  {nombreDeCategoria.get(plato.category_id) ?? "Sin categoría"} ·{" "}
                  {formatPrice(plato.price, "ARS")} ·{" "}
                  <span data-testid="estado-video">
                    {plato.video_status === "ready" ? "en la carta" : "sin video"}
                  </span>
                </span>
              </div>

              <div className="flex items-center gap-2">
                <VideoUploader
                  dishId={plato.id}
                  // El nombre no sirve como identificador: tiene espacios y acentos, y el
                  // publicId solo acepta [a-zA-Z0-9_/-]. El id del plato ya es unico.
                  publicIdSugerido={plato.id}
                  onConfirmar={accionConfirmarVideo}
                />

                <form action={accionBajarPlato}>
                  <input type="hidden" name="id" value={plato.id} />
                  <button
                    type="submit"
                    data-testid="bajar-plato"
                    aria-label={`Bajar ${plato.name}`}
                    className="boton-linea boton--chico min-w-[44px]"
                  >
                    ↓
                  </button>
                </form>

                <form action={accionDuplicarPlato}>
                  <input type="hidden" name="id" value={plato.id} />
                  <button
                    type="submit"
                    data-testid="duplicar-plato"
                    aria-label={`Duplicar ${plato.name}`}
                    className="boton-linea boton--chico"
                  >
                    Duplicar
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
