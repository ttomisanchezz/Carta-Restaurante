import type { Metadata } from "next";
import { ColaCocina } from "@/components/admin/cola-cocina";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { colaDeCocina } from "@/server/admin/orders";
import { accionColaDeCocina, accionMarcarListo } from "./actions.ts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Cocina" };

/**
 * Vista operativa de cocina dentro del flujo completo del owner.
 */
export default async function CocinaPage() {
  const sesion = await requireAdmin("/admin/cocina");
  const db = await createServerSupabase();

  const tandas = await colaDeCocina({ db, sesion });

  return (
    <>
      <h1 className="titulo-seccion text-h1">Cocina</h1>

      <ColaCocina
        inicial={tandas}
        acciones={{ listar: accionColaDeCocina, marcarListo: accionMarcarListo }}
      />
    </>
  );
}
