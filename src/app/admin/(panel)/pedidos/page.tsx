import type { Metadata } from "next";
import { ColaPedidos } from "@/components/admin/cola-pedidos";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { listarPedidos } from "@/server/admin/orders";
import {
  accionCancelar,
  accionCerrarMesa,
  accionConfirmar,
  accionEntregar,
  accionListarPedidos,
  accionRechazar,
} from "./actions.ts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Pedidos" };

/**
 * La cola de pedidos del owner.
 *
 * El primer render trae los datos desde el servidor —la pantalla arranca llena, no vacia
 * con un spinner— y a partir de ahi el componente de cliente la mantiene fresca.
 */
export default async function PedidosPage() {
  const sesion = await requireAdmin("/admin/pedidos");
  const db = await createServerSupabase();
  const ctx = { db, sesion };

  const [mesas, restaurante] = await Promise.all([
    listarPedidos(ctx),
    db.from("restaurants").select("currency").eq("id", sesion.restaurantId).maybeSingle(),
  ]);

  return (
    <>
      <h1 className="titulo-seccion text-h2">Pedidos</h1>

      <ColaPedidos
        inicial={mesas}
        currency={(restaurante.data?.currency as string | undefined) ?? "ARS"}
        acciones={{
          listar: accionListarPedidos,
          confirmar: accionConfirmar,
          rechazar: accionRechazar,
          entregar: accionEntregar,
          cancelar: accionCancelar,
          cerrarMesa: accionCerrarMesa,
        }}
      />
    </>
  );
}
