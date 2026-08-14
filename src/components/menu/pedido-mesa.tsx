"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import type { ResultadoAccion } from "@/server/admin/resultado";
import type { EstadoDeSesion } from "@/server/menu/orders";
import { BarraCarrito, type LineaDeCarrito } from "./barra-carrito.tsx";
import { type CarritoApi, CarritoProvider, type PlatoParaPedir } from "./carrito-contexto.tsx";
import { EstadoPedidos } from "./estado-pedidos.tsx";

/**
 * El pedido de una mesa: carrito, envio y seguimiento.
 *
 * Envuelve a la carta entera para que el boton de agregar del modal del plato llegue al
 * carrito por contexto. La carta de adentro **no cambia**: es el mismo `CartaCompleta` que
 * usa `/[slug]`, sin una sola rama de "si es mesa".
 *
 * ## Por que polling y no Realtime
 *
 * El comensal es anonimo, y Realtime respeta RLS: no tiene SELECT sobre `orders`, asi que
 * una suscripcion no le traeria nada aunque se la diesemos. Va por `get_session_status`,
 * que es `security definer` y solo devuelve la sesion abierta de SU mesa.
 */

export type AccionesDePedido = {
  crear: (
    token: string,
    items: { dishId: string; cantidad: number }[],
  ) => Promise<ResultadoAccion<{ sequence: number; status: string }>>;
  consultar: (token: string) => Promise<EstadoDeSesion | null>;
};

/**
 * Cada 7 segundos. Entre 5 y 10 es donde la espera todavia se siente viva sin convertir a
 * cada mesa en una consulta por segundo: un salon de 20 mesas ya son 3 pedidos por segundo
 * contra Postgres solo para mirar.
 */
const INTERVALO_MS = 7000;

type Props = {
  token: string;
  currency: string;
  acciones: AccionesDePedido;
  children: ReactNode;
};

export function PedidoMesa({ token, currency, acciones, children }: Props) {
  const [lineas, setLineas] = useState<LineaDeCarrito[]>([]);
  /**
   * Arranca vacio y se llena apenas monta, del lado del cliente.
   *
   * Esto lo resolvia el servidor y salia en el HTML. Lo cambio una medicion: para traerlo
   * habia que apagar el cache de la ruta, y sin cache el primer poster paso de 3874 ms a
   * 6813 ms a 400 kbps — muy por encima del presupuesto de cuatro segundos.
   *
   * La comida primero, la cuenta un instante despues. Es el orden correcto: el comensal
   * abre la carta para elegir, no para auditar lo que ya pidio.
   */
  const [estado, setEstado] = useState<EstadoDeSesion | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; error: boolean } | null>(null);

  // El intervalo se guarda en una ref para poder reiniciarlo despues de pedir sin que el
  // efecto dependa del estado y se recree en cada tecla.
  const consultar = useRef(acciones.consultar);
  consultar.current = acciones.consultar;

  const refrescar = useCallback(async () => {
    try {
      setEstado(await consultar.current(token));
    } catch {
      // Un fallo puntual del polling no se le muestra al comensal: la proxima vuelta lo
      // arregla sola. Lo que NO se hace es poner el estado en null, que le borraria la
      // cuenta de la pantalla por un error de red de un segundo.
    }
  }, [token]);

  useEffect(() => {
    // Con la pestaña en segundo plano no se consulta. En un telefono en una mesa, seguir
    // pidiendo cada 7 segundos mientras el comensal mira WhatsApp es gastarle la bateria y
    // los datos para nada.
    const activo = () => document.visibilityState === "visible";

    // La primera consulta va en el acto y no al primer tick: el HTML llega sin la cuenta
    // —se sirve cacheado— asi que esperar 7 segundos dejaria a alguien que ya pidio mirando
    // una pantalla que no muestra su pedido.
    if (activo()) void refrescar();

    const id = setInterval(() => {
      if (activo()) void refrescar();
    }, INTERVALO_MS);

    // Al volver a la pestaña, refrescar en el acto en vez de esperar el proximo tick.
    const alVolver = () => {
      if (activo()) void refrescar();
    };
    document.addEventListener("visibilitychange", alVolver);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [refrescar]);

  const carrito: CarritoApi = {
    agregar: (plato: PlatoParaPedir) => {
      setAviso(null);
      setLineas((actuales) => {
        const existente = actuales.find((l) => l.dishId === plato.id);
        if (existente) {
          // Tope por item, igual que en la base. Se frena acá para no gastar un viaje que
          // el RPC va a rechazar igual.
          if (existente.cantidad >= 20) return actuales;
          return actuales.map((l) =>
            l.dishId === plato.id ? { ...l, cantidad: l.cantidad + 1 } : l,
          );
        }
        return [
          ...actuales,
          { dishId: plato.id, nombre: plato.nombre, precio: plato.precio, cantidad: 1 },
        ];
      });
    },
    quitar: (dishId: string) => {
      setLineas((actuales) =>
        actuales
          .map((l) => (l.dishId === dishId ? { ...l, cantidad: l.cantidad - 1 } : l))
          .filter((l) => l.cantidad > 0),
      );
    },
    cantidadDe: (dishId: string) => lineas.find((l) => l.dishId === dishId)?.cantidad ?? 0,
  };

  async function pedir() {
    if (enviando || lineas.length === 0) return;

    setEnviando(true);
    setAviso(null);

    try {
      const resultado = await acciones.crear(
        token,
        lineas.map((l) => ({ dishId: l.dishId, cantidad: l.cantidad })),
      );

      if (!resultado.ok) {
        setAviso({ texto: resultado.error.message, error: true });
        return;
      }

      // El carrito se vacia recien cuando el servidor confirmo. Vaciarlo antes seria
      // perderle el pedido al comensal si la red se cae en el peor momento.
      setLineas([]);
      setAviso({
        texto:
          resultado.data.status === "cocina"
            ? `Pedido ${resultado.data.sequence} en preparación.`
            : `Pedido ${resultado.data.sequence} enviado. Esperá la confirmación.`,
        error: false,
      });
      await refrescar();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <CarritoProvider value={carrito}>
      {/* Deja lugar abajo para la barra fija: sin esto el ultimo plato queda tapado. */}
      <div className={lineas.length > 0 ? "pb-64" : undefined}>{children}</div>

      {aviso ? (
        <p
          role="status"
          data-testid="aviso-pedido"
          className={`mx-auto w-full max-w-[720px] px-4 pb-6 text-small ${
            aviso.error ? "text-error" : "text-success"
          }`}
        >
          {aviso.texto}
        </p>
      ) : null}

      {estado ? <EstadoPedidos estado={estado} currency={currency} /> : null}

      <BarraCarrito
        lineas={lineas}
        currency={currency}
        enviando={enviando}
        onQuitar={carrito.quitar}
        onPedir={pedir}
      />
    </CarritoProvider>
  );
}
