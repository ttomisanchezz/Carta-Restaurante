"use client";

import { formatPrice } from "@/lib/format/price";

/**
 * La barra del pedido, fija abajo.
 *
 * Fija y no al final del scroll: el comensal agrega un plato en la mitad de la carta y
 * tiene que ver que paso sin buscar nada. Aparece solo cuando hay algo adentro — una barra
 * vacia ocupando el pulgar durante toda la lectura es peor que no tenerla.
 *
 * Va sobre la carta, no adentro: por eso la carta reserva `padding-bottom` cuando esta
 * activa, para que el ultimo plato no quede tapado por la barra.
 */

export type LineaDeCarrito = { dishId: string; nombre: string; precio: number; cantidad: number };

type Props = {
  lineas: LineaDeCarrito[];
  currency: string;
  enviando: boolean;
  onQuitar: (dishId: string) => void;
  onPedir: () => void;
};

export function BarraCarrito({ lineas, currency, enviando, onQuitar, onPedir }: Props) {
  if (lineas.length === 0) return null;

  const unidades = lineas.reduce((suma, l) => suma + l.cantidad, 0);
  const total = lineas.reduce((suma, l) => suma + l.precio * l.cantidad, 0);

  return (
    <div className="barra-carrito" data-testid="barra-carrito">
      <div className="mx-auto w-full max-w-[720px] px-4 py-4">
        <ul className="flex list-none flex-col gap-2 p-0">
          {lineas.map((linea) => (
            <li key={linea.dishId} className="flex items-center justify-between gap-4">
              <span className="min-w-0 flex-1 truncate text-small">
                <span className="text-text-muted">{linea.cantidad}×</span> {linea.nombre}
              </span>
              <span className="text-small tabular-nums">
                {formatPrice(linea.precio * linea.cantidad, currency)}
              </span>
              <button
                type="button"
                onClick={() => onQuitar(linea.dishId)}
                aria-label={`Quitar uno de ${linea.nombre}`}
                data-testid="quitar-del-carrito"
                className="boton-linea boton--chico min-w-[44px]"
              >
                −
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex items-center justify-between gap-4 border-t border-border pt-4">
          <div className="flex flex-col">
            <span className="text-caption uppercase tracking-[0.14em] text-text-muted">
              {unidades} {unidades === 1 ? "ítem" : "ítems"}
            </span>
            <span data-testid="total-carrito" className="precio text-h3 tabular-nums">
              {formatPrice(total, currency)}
            </span>
          </div>

          <button
            type="button"
            onClick={onPedir}
            disabled={enviando}
            data-testid="enviar-pedido"
            className="boton-marca disabled:opacity-60"
          >
            {enviando ? "Mandando…" : "Pedir"}
          </button>
        </div>
      </div>
    </div>
  );
}
