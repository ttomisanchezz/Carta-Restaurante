import type { Metadata } from "next";
import { QrMesa } from "@/components/admin/qr-mesa";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getSiteUrl } from "@/lib/env";
import { urlDeMesa } from "@/lib/qr/codigo-qr";
import { createServerSupabase } from "@/lib/supabase/server";
import { listarMesas, slugDeMiRestaurante } from "@/server/admin/tables";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Mesas para imprimir" };

/**
 * Una hoja con el QR de cada mesa activa, para imprimir, recortar y pegar.
 *
 * Solo las ACTIVAS: imprimir el QR de una mesa desactivada es fabricar el problema que la
 * desactivacion venia a evitar.
 *
 * En pantalla se ve como el resto del panel, oscuro. Al imprimir, `.hoja-mesas` la pasa a
 * negro sobre blanco. Eso NO es un modo claro —no hay toggle ni preferencia— es que el
 * papel no tiene retroiluminacion: imprimir el fondo carbon gasta un cartucho por hoja y
 * sale gris sucio.
 */
export default async function ImprimirMesasPage() {
  const sesion = await requireAdmin("/admin/mesas/imprimir");
  const db = await createServerSupabase();
  const ctx = { db, sesion };

  const [slug, mesas] = await Promise.all([slugDeMiRestaurante(ctx), listarMesas(ctx)]);
  const activas = mesas.filter((mesa) => mesa.is_active);
  const origen = getSiteUrl();

  if (slug === null || activas.length === 0) {
    return (
      <p className="text-body text-text-muted">
        No hay mesas activas para imprimir.{" "}
        <a href="/admin/mesas" className="enlace-panel">
          Volver a mesas
        </a>
      </p>
    );
  }

  return (
    <div className="hoja-mesas">
      <div className="sin-imprimir mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="titulo-seccion text-h2">Mesas para imprimir</h1>
        <a href="/admin/mesas" className="boton-linea boton--chico">
          Volver a mesas
        </a>
      </div>

      <ul className="grid list-none grid-cols-2 gap-6 p-0 sm:grid-cols-3">
        {activas.map((mesa) => (
          <li
            key={mesa.id}
            data-testid="mesa-imprimible"
            className="flex break-inside-avoid flex-col items-center gap-2 rounded-card border border-border p-4 text-center"
          >
            <QrMesa url={urlDeMesa(origen, slug, mesa.token)} etiqueta={mesa.label} tamano={200} />
            <span className="text-body font-semibold">{mesa.label}</span>
            <span className="text-caption text-text-muted">Escaneá para ver la carta</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
