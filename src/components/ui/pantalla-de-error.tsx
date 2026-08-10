"use client";

/**
 * Pantalla de error con reintento.
 *
 * La comparte la frontera de la carta y la de toda la aplicacion. Es `"use client"`
 * porque `reset()` es una funcion que solo existe en el cliente — una frontera de error
 * de Next no puede ser un Server Component.
 *
 * Reintentar de verdad, no recargar: `reset()` vuelve a montar el segmento que fallo. Un
 * `location.reload()` tira toda la pagina y pierde el scroll y el estado de lo que si
 * andaba.
 *
 * No se muestra el mensaje del error. Puede traer nombres de tablas, un slug ajeno o el
 * texto crudo de Postgres, y eso no es para el comensal.
 */

type Props = {
  titulo: string;
  detalle: string;
  reset: () => void;
};

export function PantallaDeError({ titulo, detalle, reset }: Props) {
  return (
    <div
      role="alert"
      data-testid="frontera-error"
      className="mx-auto flex min-h-[60vh] w-full max-w-[720px] flex-col justify-center px-4"
    >
      <h1 className="text-h1 font-bold">{titulo}</h1>
      <p className="mt-4 text-body text-text-muted">{detalle}</p>

      <button
        type="button"
        onClick={reset}
        data-testid="reintentar"
        className="mt-6 min-h-[44px] self-start rounded-control bg-brand px-6 text-body font-semibold text-on-brand"
      >
        Reintentar
      </button>
    </div>
  );
}
