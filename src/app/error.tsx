"use client";

import { PantallaDeError } from "@/components/ui/pantalla-de-error";

/**
 * Frontera de error de toda la aplicacion: lo que no atrapa una frontera mas cercana.
 *
 * No reemplaza a `src/app/[slug]/error.tsx` — Next usa siempre la mas cercana al segmento
 * que fallo, y la de la carta puede hablarle al comensal en sus terminos. Esta es la red
 * de abajo, para el panel y para cualquier ruta futura.
 */
export default function ErrorGlobal({ reset }: { error: Error; reset: () => void }) {
  return (
    <PantallaDeError
      titulo="Algo salió mal"
      detalle="Tuvimos un problema para mostrar esta pantalla. Probá de nuevo."
      reset={reset}
    />
  );
}
