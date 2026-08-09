import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/require-admin";

/**
 * Platos del panel.
 *
 * Hoy es el destino del login y poco mas: el CRUD completo llega en E3-T3. Existe desde
 * el paso 7 porque es la ruta que el guard tiene que proteger, y no se puede probar una
 * cerradura sin puerta.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Platos",
};

export default async function PlatosPage() {
  // Tambien aca, no solo en el layout. Un layout puede dejar de envolver esta pagina con
  // un refactor y nadie se entera hasta que alguien entra sin sesion.
  const sesion = await requireAdmin("/admin/platos");

  return (
    <>
      <h1 className="text-h2 font-bold">Platos</h1>
      <p className="mt-2 text-small text-text-muted">
        {sesion.restaurantId === null
          ? "Sos superadmin: vas a poder elegir el restaurante desde acá."
          : "Acá vas a administrar los platos de tu carta."}
      </p>
    </>
  );
}
