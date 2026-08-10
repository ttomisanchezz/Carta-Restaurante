"use client";

import { PantallaDeError } from "@/components/ui/pantalla-de-error";

/**
 * Frontera de error de la carta.
 *
 * Cubre el caso que importa: la consulta a la base fallo. No es que el restaurante no
 * exista —eso es un 404 y tiene su propia pantalla— sino que no pudimos preguntar. El
 * comensal tiene una mesa, hambre y treinta segundos de paciencia: un boton que reintenta
 * vale mas que una explicacion.
 */
export default function ErrorDeCarta({ reset }: { error: Error; reset: () => void }) {
  return (
    <PantallaDeError
      titulo="No pudimos cargar la carta"
      detalle="Puede ser un problema momentáneo de conexión. Probá de nuevo en unos segundos."
      reset={reset}
    />
  );
}
