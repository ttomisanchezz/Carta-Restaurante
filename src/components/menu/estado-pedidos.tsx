"use client";

import { formatPrice } from "@/lib/format/price";
import type { EstadoDePedido } from "@/server/admin/orders";
import type { EstadoDeSesion } from "@/server/menu/orders";

/**
 * La cuenta en curso de la mesa: cada tanda, su estado y el total.
 *
 * Se muestra solo si hay sesion abierta. Una mesa recien sentada no ve nada de esto y
 * arranca limpia, que es lo correcto: un bloque vacio que dice "todavia no pediste nada" es
 * ruido arriba de la unica pantalla que tenemos para vender comida.
 */

/**
 * El texto que ve el comensal para cada estado.
 *
 * Es SU lenguaje, no el nuestro: la base dice `cocina` y acá dice "En preparación", porque
 * el comensal no tiene por que aprenderse nuestra maquina de estados. `entregado` no se
 * anuncia como un logro — el plato ya esta en la mesa, el comensal lo sabe mejor que
 * nosotros.
 */
const TEXTO: Record<EstadoDePedido, string> = {
  pendiente: "Esperando confirmación",
  cocina: "En preparación",
  listo: "Listo, sale para la mesa",
  entregado: "Servido",
  rechazado: "No se pudo",
  cancelado: "Cancelado",
};

/** Los dos estados que no suman a la cuenta se marcan aparte, en rojo apagado. */
const NO_SUMAN: EstadoDePedido[] = ["rechazado", "cancelado"];

type Props = {
  estado: EstadoDeSesion;
  currency: string;
};

export function EstadoPedidos({ estado, currency }: Props) {
  return (
    <section
      data-testid="estado-pedidos"
      aria-label="Tu pedido"
      className="mx-auto w-full max-w-[720px] px-4 pb-12"
    >
      <span className="linea-acento linea-acento--izquierda" aria-hidden="true" />
      <h2 className="titulo-seccion mt-4 text-h2">Tu pedido</h2>

      <ul className="mt-6 flex list-none flex-col gap-4 p-0">
        {estado.tandas.map((tanda) => (
          <li
            key={tanda.sequence}
            data-testid="tanda"
            data-secuencia={tanda.sequence}
            data-estado={tanda.status}
            className="rounded-card border border-border p-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-caption uppercase tracking-[0.14em] text-text-muted">
                Tanda {tanda.sequence}
              </span>
              <span
                data-testid="estado-tanda"
                className={`text-small font-semibold ${
                  NO_SUMAN.includes(tanda.status) ? "text-error" : "text-brand"
                }`}
              >
                {TEXTO[tanda.status]}
              </span>
            </div>

            {/* El motivo del rechazo lo escribe el owner y lo lee el comensal. Un
                "no se pudo" sin explicacion manda a alguien a preguntar al mozo. */}
            {tanda.motivoRechazo ? (
              <p data-testid="motivo-rechazo" className="mt-2 text-small text-text-muted">
                {tanda.motivoRechazo}
              </p>
            ) : null}

            <ul className="mt-3 flex list-none flex-col gap-1 p-0">
              {tanda.items.map((item) => (
                <li key={item.nombre} className="flex justify-between gap-4 text-small">
                  <span className="min-w-0 flex-1">
                    <span className="text-text-muted">{item.cantidad}×</span> {item.nombre}
                  </span>
                  <span className="tabular-nums text-text-muted">
                    {formatPrice(item.subtotal, currency)}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      <div className="mt-6 flex items-baseline justify-between gap-4 border-t border-border pt-4">
        <span className="text-body font-semibold">Total</span>
        <span data-testid="total-sesion" className="precio text-h2 tabular-nums">
          {formatPrice(estado.total, currency)}
        </span>
      </div>
    </section>
  );
}
