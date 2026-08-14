"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatPrice } from "@/lib/format/price";
import type { MesaConPedidos, TandaDelPanel } from "@/server/admin/orders";
import type { ResultadoAccion } from "@/server/admin/resultado";

/**
 * La cola del owner: las mesas abiertas y sus tandas, en vivo.
 *
 * ## Por que se refresca por polling y no por Realtime
 *
 * Realtime **esta habilitado** en el proyecto y las dos tablas estan publicadas: se
 * verifico con una suscripcion real. Lo que lo bloquea es otra cosa: las cookies de sesion
 * de este proyecto son `httpOnly` a proposito (`proxy.ts` y `lib/supabase/server.ts` lo
 * fuerzan), asi que el navegador NO PUEDE LEER el JWT, y sin JWT una suscripcion se evalua
 * como anonima — que no tiene SELECT sobre `orders` y no recibiria un solo evento.
 *
 * Habilitarlo pediria mandarle el access token al cliente, que es exactamente lo que esa
 * decision de seguridad evita. Cada 5 segundos contra una cola de mesas abiertas es barato
 * y no obliga a aflojar nada.
 */

const INTERVALO_MS = 5000;

export type AccionesDeCola = {
  listar: () => Promise<MesaConPedidos[]>;
  confirmar: (id: string) => Promise<ResultadoAccion<{ id: string }>>;
  rechazar: (id: string, motivo: string) => Promise<ResultadoAccion<{ id: string }>>;
  entregar: (id: string) => Promise<ResultadoAccion<{ id: string }>>;
  cancelar: (id: string) => Promise<ResultadoAccion<{ id: string }>>;
  cerrarMesa: (id: string) => Promise<ResultadoAccion<{ id: string }>>;
};

type Props = {
  inicial: MesaConPedidos[];
  currency: string;
  acciones: AccionesDeCola;
};

const ETIQUETA: Record<TandaDelPanel["status"], string> = {
  pendiente: "Pendiente",
  cocina: "En cocina",
  listo: "Listo",
  entregado: "Entregado",
  rechazado: "Rechazado",
  cancelado: "Cancelado",
};

export function ColaPedidos({ inicial, currency, acciones }: Props) {
  const [mesas, setMesas] = useState(inicial);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const listar = useRef(acciones.listar);
  listar.current = acciones.listar;

  const refrescar = useCallback(async () => {
    try {
      setMesas(await listar.current());
    } catch {
      // Un fallo puntual del polling no borra la pantalla: la proxima vuelta lo arregla.
    }
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refrescar();
    }, INTERVALO_MS);
    return () => clearInterval(id);
  }, [refrescar]);

  async function ejecutar(clave: string, operacion: () => Promise<ResultadoAccion<unknown>>) {
    if (ocupado) return;
    setOcupado(clave);
    setError(null);
    try {
      const resultado = await operacion();
      if (!resultado.ok) setError(resultado.error.message);
      await refrescar();
    } finally {
      setOcupado(null);
    }
  }

  function rechazar(id: string) {
    // `prompt` y no un modal propio: el owner escribe dos palabras con una mano
    // mientras sostiene un telefono con la otra. Un formulario en linea le agrega dos
    // toques a la operacion mas apurada de la pantalla.
    const motivo = window.prompt("¿Por qué no se puede? El comensal lo va a leer.");
    if (motivo === null || motivo.trim() === "") return;
    void ejecutar(`rechazar-${id}`, () => acciones.rechazar(id, motivo.trim()));
  }

  if (mesas.length === 0) {
    return (
      <p data-testid="sin-pedidos" className="mt-8 text-body text-text-muted">
        No hay mesas abiertas. Cuando alguien pida desde un QR, aparece acá.
      </p>
    );
  }

  return (
    <>
      {error ? (
        <p
          role="alert"
          data-testid="mensaje-pedidos"
          className="mt-4 rounded-control border border-error/40 bg-error/10 px-4 py-3 text-small text-error"
        >
          {error}
        </p>
      ) : null}

      <ul className="mt-6 flex list-none flex-col gap-6 p-0" data-testid="lista-mesas-abiertas">
        {mesas.map((mesa) => (
          <li
            key={mesa.sessionId}
            data-testid="mesa-abierta"
            data-mesa={mesa.mesa}
            className="rounded-card border border-border p-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-4">
              <h2 className="titulo-seccion text-h3">{mesa.mesa}</h2>
              <div className="flex items-center gap-4">
                <span data-testid="total-mesa" className="precio text-body tabular-nums">
                  {formatPrice(mesa.total, currency)}
                </span>
                {/* Chico a proposito, y aun asi es el que sostiene el sistema: sin cerrar,
                    el comensal de mañana hereda la cuenta de anoche. */}
                <button
                  type="button"
                  onClick={() =>
                    ejecutar(`cerrar-${mesa.sessionId}`, () => acciones.cerrarMesa(mesa.sessionId))
                  }
                  disabled={ocupado !== null}
                  data-testid="cerrar-mesa"
                  className="boton-linea boton--chico disabled:opacity-50"
                >
                  Cerrar mesa
                </button>
              </div>
            </div>

            <ul className="mt-4 flex list-none flex-col gap-3 p-0">
              {mesa.tandas.map((tanda) => (
                <li
                  key={tanda.id}
                  data-testid="tanda-panel"
                  data-secuencia={tanda.sequence}
                  data-estado={tanda.status}
                  className="rounded-control border border-border bg-surface p-3"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-caption uppercase tracking-[0.14em] text-text-muted">
                      Tanda {tanda.sequence} · {ETIQUETA[tanda.status]}
                    </span>
                    <span className="text-small tabular-nums text-text-muted">
                      {formatPrice(tanda.subtotal, currency)}
                    </span>
                  </div>

                  <ul className="mt-2 flex list-none flex-col gap-1 p-0">
                    {tanda.items.map((item) => (
                      <li key={item.nombre} className="text-small">
                        <span className="text-text-muted">{item.cantidad}×</span> {item.nombre}
                      </li>
                    ))}
                  </ul>

                  {tanda.motivoRechazo ? (
                    <p className="mt-2 text-small text-error">{tanda.motivoRechazo}</p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap gap-2">
                    {tanda.status === "pendiente" ? (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            ejecutar(`confirmar-${tanda.id}`, () => acciones.confirmar(tanda.id))
                          }
                          disabled={ocupado !== null}
                          data-testid="confirmar-tanda"
                          className="boton-marca boton--chico disabled:opacity-50"
                        >
                          Confirmar
                        </button>
                        <button
                          type="button"
                          onClick={() => rechazar(tanda.id)}
                          disabled={ocupado !== null}
                          data-testid="rechazar-tanda"
                          className="boton-linea boton--chico text-error disabled:opacity-50"
                        >
                          Rechazar
                        </button>
                      </>
                    ) : null}

                    {tanda.status === "listo" ? (
                      <button
                        type="button"
                        onClick={() =>
                          ejecutar(`entregar-${tanda.id}`, () => acciones.entregar(tanda.id))
                        }
                        disabled={ocupado !== null}
                        data-testid="entregar-tanda"
                        className="boton-marca boton--chico disabled:opacity-50"
                      >
                        Entregado
                      </button>
                    ) : null}

                    {tanda.status !== "entregado" &&
                    tanda.status !== "rechazado" &&
                    tanda.status !== "cancelado" ? (
                      <button
                        type="button"
                        onClick={() =>
                          ejecutar(`cancelar-${tanda.id}`, () => acciones.cancelar(tanda.id))
                        }
                        disabled={ocupado !== null}
                        data-testid="cancelar-tanda"
                        className="boton-linea boton--chico disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </>
  );
}
