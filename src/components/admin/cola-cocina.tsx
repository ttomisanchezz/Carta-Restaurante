"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TandaDeCocina } from "@/server/admin/orders";
import type { ResultadoAccion } from "@/server/admin/resultado";

/**
 * La cola de la cocina. Una tablet apoyada en una repisa, a un metro y medio, con las manos
 * ocupadas y grasa en la pantalla.
 *
 * Todo lo de acá sale de esa escena y no de una preferencia estetica:
 *
 * - **Tipografia grande.** Se lee de parado y de costado, no sentado y de frente.
 * - **Un solo boton por tanda**, y ocupa el ancho entero. Con las manos sucias no se apunta
 *   a un control de 44px: se apoya la palma.
 * - **Sin precios ni totales.** No es que no se dibujen: `kitchen_queue()` entrega solo
 *   datos operativos y no selecciona la columna de precio.
 * - **Sin confirmar, sin rechazar, sin cerrar mesas.** Esta pantalla tiene un verbo.
 */

const INTERVALO_MS = 5000;

export type AccionesDeCocina = {
  listar: () => Promise<TandaDeCocina[]>;
  marcarListo: (id: string) => Promise<ResultadoAccion<{ id: string }>>;
};

type Props = {
  inicial: TandaDeCocina[];
  acciones: AccionesDeCocina;
};

export function ColaCocina({ inicial, acciones }: Props) {
  const [tandas, setTandas] = useState(inicial);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const listar = useRef(acciones.listar);
  listar.current = acciones.listar;

  const refrescar = useCallback(async () => {
    try {
      setTandas(await listar.current());
    } catch {
      // Un fallo puntual del polling no vacia la pantalla de la cocina.
    }
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refrescar();
    }, INTERVALO_MS);
    return () => clearInterval(id);
  }, [refrescar]);

  async function marcarListo(id: string) {
    if (ocupado) return;
    setOcupado(id);
    setError(null);
    try {
      const resultado = await acciones.marcarListo(id);
      if (!resultado.ok) setError(resultado.error.message);
      await refrescar();
    } finally {
      setOcupado(null);
    }
  }

  const enPreparacion = tandas.filter((t) => t.status === "cocina");

  if (enPreparacion.length === 0) {
    return (
      <p data-testid="cocina-vacia" className="mt-12 text-center text-h2 text-text-muted">
        Nada en preparación
      </p>
    );
  }

  return (
    <>
      {error ? (
        <p
          role="alert"
          data-testid="mensaje-cocina"
          className="mt-4 rounded-control border border-error/40 bg-error/10 px-4 py-3 text-lead text-error"
        >
          {error}
        </p>
      ) : null}

      {/* Dos columnas desde 640px: en una tablet horizontal entran cuatro tandas sin
          scrollear, que es lo que se mira de un vistazo entre plato y plato. */}
      <ul className="mt-6 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 sm:gap-6">
        {enPreparacion.map((tanda) => (
          <li
            key={tanda.id}
            data-testid="tanda-cocina"
            data-mesa={tanda.mesa}
            className="flex flex-col rounded-card border border-border bg-surface p-6"
          >
            <div className="flex items-baseline justify-between gap-4">
              <span className="titulo-seccion text-h1">{tanda.mesa}</span>
              <span className="text-lead uppercase tracking-[0.14em] text-text-muted">
                Tanda {tanda.sequence}
              </span>
            </div>

            <ul className="mt-6 flex flex-1 list-none flex-col gap-3 p-0">
              {tanda.items.map((item) => (
                <li key={item.nombre} className="flex items-baseline gap-4 text-h3">
                  {/* La cantidad primero y en marca: es el dato que se lee de lejos. */}
                  <span className="min-w-[3ch] font-bold text-brand tabular-nums">
                    {item.cantidad}×
                  </span>
                  <span>{item.nombre}</span>
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() => marcarListo(tanda.id)}
              disabled={ocupado !== null}
              data-testid="marcar-listo"
              className="boton-marca mt-6 min-h-[64px] w-full text-lead disabled:opacity-50"
            >
              Listo
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
