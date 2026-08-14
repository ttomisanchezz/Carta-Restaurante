import { DIAS_PARA_AVISO_DE_INACTIVIDAD } from "@/lib/auth/inactividad";

/** Aviso informativo del panel; no envia notificaciones ni bloquea ninguna accion. */
export function AvisoInactividad() {
  return (
    <aside
      role="status"
      data-testid="aviso-inactividad"
      className="mt-4 rounded-control border border-brand/40 bg-brand/10 px-4 py-3 text-small"
    >
      <span className="font-semibold">Bienvenido de nuevo.</span> Pasaron más de{" "}
      {DIAS_PARA_AVISO_DE_INACTIVIDAD} días desde tu ingreso anterior. Revisá videos, precios y
      disponibilidad antes de compartir la carta.
    </aside>
  );
}
