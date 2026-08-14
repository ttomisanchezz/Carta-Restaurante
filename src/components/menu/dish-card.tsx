import Link from "next/link";
import { formatPrice } from "@/lib/format/price";
import type { PlatoDeCarta } from "@/server/menu/queries";
import { DishCardMedia } from "./dish-card-media.tsx";

/**
 * Tarjeta de plato: medio 4:5, nombre y precio.
 *
 * **Es un enlace de verdad que ademas abre el modal**, y las dos mitades importan.
 *
 * Con un `<button>` la tarjeta perdia dos cosas a la vez. La primera es de producto: la
 * ruta `/[slug]/plato/[dishId]` seguia existiendo pero nadie podia llegar a ella, asi que
 * el plato dejaba de ser "la pantalla que un comensal le pasa a otro" — sin enlace no hay
 * copiar direccion, ni abrir en pestaña nueva, ni nada que mandar por WhatsApp. La segunda
 * es de HTML: el contenido de un `<button>` es contenido de frase, y acá adentro van dos
 * `<div>` y un `<video>`.
 *
 * Con `<a>` las dos se arreglan solas. `onNavigate` intercepta solamente una navegacion
 * SPA normal para abrir el modal; antes de la hidratacion, con modificadores o en otra
 * pestaña, el enlace conserva su comportamiento nativo y nunca queda como un control
 * muerto. `<a>` acepta contenido de flujo, y el video decorativo ignora eventos de puntero
 * para que un toque movil llegue siempre al enlace.
 *
 * La grilla le entrega el evento que abre el modal. El medio conserva por separado la
 * responsabilidad de reproducir y liberar el clip al entrar o salir de pantalla.
 *
 * **La grilla ahora si reproduce video**, al contrario de lo que decia la version anterior
 * de este archivo. El cambio se pidio a proposito y trae sus frenos: solo lo visible, tope
 * de tres a la vez, poster siempre primero, y nada si el usuario pidio menos movimiento o
 * esta ahorrando datos. El detalle esta en `dish-card-media.tsx` y en
 * `.claude/rules/video.md`.
 */

type Props = {
  plato: PlatoDeCarta;
  /** Para armar el `href` real del plato: sin el no hay nada que compartir. */
  slug: string;
  currency: string;
  /** Clip corto para la grilla, resuelto en el servidor por el proveedor de video. */
  clipUrl: string;
  posterUrl: string;
  /**
   * La primera fila se carga con prioridad; el resto, perezoso.
   *
   * El primer poster visible ES la metrica del producto: si tarda, el comensal cierra la
   * pantalla y pide por la carta de papel.
   */
  prioritario: boolean;
  /** Posicion en la grilla, para el escalonado de la entrada. */
  indice: number;
  pausado: boolean;
  onAbrir: () => void;
};

/** Paso del escalonado. 40ms: por debajo no se percibe, por encima parece que carga lento. */
const PASO_ESCALONADO_MS = 40;

export function DishCard({
  plato,
  slug,
  currency,
  clipUrl,
  posterUrl,
  prioritario,
  indice,
  pausado,
  onAbrir,
}: Props) {
  return (
    <li
      data-categoria={plato.category_id}
      data-testid="tarjeta-plato"
      data-nombre={plato.name}
      className="tarjeta-plato tarjeta-entra"
      // El retraso se corta a las seis primeras: mas abajo el comensal ya scrolleo y una
      // tarjeta que aparece tarde se lee como lentitud, no como elegancia.
      style={
        { "--retraso": `${Math.min(indice, 5) * PASO_ESCALONADO_MS}ms` } as React.CSSProperties
      }
    >
      <Link
        href={`/${slug}/plato/${plato.id}`}
        aria-haspopup="dialog"
        onNavigate={(evento) => {
          // Next llama `onNavigate` solo para la navegacion SPA del click principal. Si la
          // isla todavia no hidrato, el navegador sigue el href y la pantalla del plato se
          // abre igual; no existe una ventana en la que tocar no haga nada.
          evento.preventDefault();
          onAbrir();
        }}
        // `h-full` mas el `mt-auto` del precio: con nombres de uno y de dos renglones, los
        // precios de una misma fila quedaban a distinta altura y la grilla se veia torcida.
        className="flex h-full flex-col gap-3 rounded-card focus-visible:outline-2"
      >
        {/*
          4:5 exacto — las mismas medidas que reserva el esqueleto de loading.tsx, para que
          al llegar la imagen no se mueva nada de lugar.
        */}
        <DishCardMedia
          dishId={plato.id}
          clipUrl={clipUrl}
          posterUrl={posterUrl}
          titulo={plato.name}
          prioritario={prioritario}
          pausado={pausado}
        />

        <div className="flex flex-1 flex-col gap-2">
          {/* El filete arriba del nombre: el mismo recurso que el del hero, en chico. Se
              estira al pasar por encima. Decorativo, asi que no lo anuncia el lector. */}
          <span className="tarjeta-acento" aria-hidden="true" />

          <span className="tarjeta-nombre text-small font-semibold leading-snug transition-colors duration-[160ms] ease-[var(--ease-suave)]">
            {plato.name}
          </span>
          <span className="precio mt-auto text-small">{formatPrice(plato.price, currency)}</span>
        </div>
      </Link>
    </li>
  );
}
