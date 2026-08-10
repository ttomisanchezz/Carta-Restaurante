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
      <span className="linea-acento linea-acento--izquierda" aria-hidden="true" />
      <h1 className="titulo-seccion mt-4 text-h1">{titulo}</h1>
      <p className="mt-4 max-w-[52ch] text-body text-text-muted">{detalle}</p>

      <button
        type="button"
        onClick={reset}
        data-testid="reintentar"
        className="boton-marca mt-8 self-start"
      >
        Reintentar
      </button>
    </div>
  );
}
