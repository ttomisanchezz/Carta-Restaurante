"use client";

import { useCallback, useEffect, useId, useRef } from "react";
import { formatCalories } from "@/lib/format/calories";
import { formatPrice } from "@/lib/format/price";
import type { PlatoDeCarta } from "@/server/menu/queries";
import { useCarrito } from "./carrito-contexto.tsx";
import { VideoPlayer } from "./video-player.tsx";

type Props = {
  plato: PlatoDeCarta;
  currency: string;
  playbackUrl: string;
  posterUrl: string;
  onCerrar: () => void;
};

/** Vista expandida que conserva la URL de la carta y el foco del comensal. */
export function DishModal({ plato, currency, playbackUrl, posterUrl, onCerrar }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const tituloId = useId();
  const calorias = formatCalories(plato.calories);

  /*
   * `null` en la carta publica: ahi no hay contexto de carrito y no se dibuja el boton.
   *
   * El boton de pedir vive ACA y no en la tarjeta de la grilla, y es a proposito. La grilla
   * es lo que sostiene el presupuesto de red —dos posters con prioridad, el resto perezoso—
   * y meterle un control interactivo por tarjeta le agrega peso y ruido visual a la unica
   * pantalla que se mide a 400 kbps. Ademas el orden natural es el del producto: primero se
   * ve el video del plato, despues se pide.
   */
  const carrito = useCarrito();
  const enElCarrito = carrito?.cantidadDe(plato.id) ?? 0;

  const cerrar = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      onCerrar();
      return;
    }

    if (typeof dialog.close === "function" && dialog.open) {
      dialog.close();
      return;
    }

    // Fallback para navegadores sin implementacion completa de <dialog>.
    onCerrar();
  }, [onCerrar]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const focoAnterior =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflowAnterior = document.body.style.overflow;

    let modalNativo = false;
    try {
      if (typeof dialog.showModal === "function") {
        dialog.showModal();
        modalNativo = true;
      } else {
        dialog.setAttribute("open", "");
      }
    } catch {
      // Un <dialog> parcialmente implementado no puede anular el acceso al plato. La
      // posicion fija de `.modal-plato` mantiene util esta apertura no modal.
      dialog.setAttribute("open", "");
    }
    document.body.style.overflow = "hidden";

    const alPresionar = (evento: KeyboardEvent) => {
      if (!modalNativo && evento.key === "Escape") {
        evento.preventDefault();
        cerrar();
      }
    };
    document.addEventListener("keydown", alPresionar);

    return () => {
      document.removeEventListener("keydown", alPresionar);
      document.body.style.overflow = overflowAnterior;
      if (typeof dialog.close === "function" && dialog.open) dialog.close();
      else dialog.removeAttribute("open");
      focoAnterior?.focus();
    };
  }, [cerrar]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={tituloId}
      data-testid="modal-plato"
      className="modal-plato"
      onClose={onCerrar}
    >
      <article className="modal-plato-contenido mx-auto min-h-full w-full max-w-[720px] px-4 py-6">
        <button
          type="button"
          data-testid="cerrar-modal-plato"
          aria-label="Cerrar plato"
          className="boton-linea boton--chico"
          onClick={cerrar}
        >
          ← Cerrar
        </button>

        <VideoPlayer
          playbackUrl={playbackUrl}
          posterUrl={posterUrl}
          titulo={plato.name}
          dishId={plato.id}
        />

        <span className="linea-acento linea-acento--izquierda mt-8" aria-hidden="true" />
        <h2 id={tituloId} className="titulo-seccion mt-4 text-h1">
          {plato.name}
        </h2>

        <p data-testid="precio-modal-plato" className="precio mt-3 text-h2">
          {formatPrice(plato.price, currency)}
        </p>

        {/* Solo si hay dato. Con `calories` en null no se dibuja nada. */}
        {calorias ? (
          <p data-testid="calorias-modal-plato" className="mt-1 text-small text-text-muted">
            {calorias}
          </p>
        ) : null}

        {plato.description !== "" ? (
          <p className="mt-6 max-w-[60ch] text-body leading-relaxed text-text-muted">
            {plato.description}
          </p>
        ) : null}

        {plato.pairing_text ? (
          <blockquote
            data-testid="maridaje-modal"
            className="maridaje maridaje--expandido mt-8 max-w-[52ch]"
          >
            {plato.pairing_text}
          </blockquote>
        ) : null}

        {carrito ? (
          <button
            type="button"
            onClick={() => {
              carrito.agregar({ id: plato.id, nombre: plato.name, precio: plato.price });
              /*
               * Agregar CIERRA el plato, y no es una comodidad: el modal es un `<dialog>`
               * modal, o sea que esta en la capa superior y se come todos los clicks de
               * abajo — incluido el de "Pedir" de la barra del carrito. Dejandolo abierto,
               * el comensal agrega, ve aparecer la barra... y no la puede tocar.
               *
               * Ademas es el gesto correcto: ya decidiste, volves a la carta a seguir
               * mirando. Para sumar otra unidad se vuelve a abrir el plato, y ahi el boton
               * ya dice cuantas lleva.
               */
              cerrar();
            }}
            data-testid="agregar-al-pedido"
            className="boton-marca mt-8 w-full"
          >
            {enElCarrito > 0 ? `Agregar otro (${enElCarrito} en el pedido)` : "Agregar al pedido"}
          </button>
        ) : null}
      </article>
    </dialog>
  );
}
