import Link from "next/link";
import { formatPrice } from "@/lib/format/price";
import type { PlatoDeCarta } from "@/server/menu/queries";
import { DishCardMedia } from "./dish-card-media.tsx";

/**
 * Tarjeta de plato: medio 4:5, nombre y precio.
 *
 * Sigue siendo un Server Component. Lo unico que necesita cliente es el medio —el video
 * que arranca al entrar en pantalla— y eso vive en `dish-card-media.tsx`, la hoja mas
 * chica posible.
 *
 * **La grilla ahora si reproduce video**, al contrario de lo que decia la version anterior
 * de este archivo. El cambio se pidio a proposito y trae sus frenos: solo lo visible, tope
 * de tres a la vez, poster siempre primero, y nada si el usuario pidio menos movimiento o
 * esta ahorrando datos. El detalle esta en `dish-card-media.tsx` y en
 * `.claude/rules/video.md`.
 */

type Props = {
  plato: PlatoDeCarta;
  slug: string;
  currency: string;
  /** URL de reproduccion, resuelta en el servidor por el proveedor de video. */
  playbackUrl: string;
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
};

/** Paso del escalonado. 40ms: por debajo no se percibe, por encima parece que carga lento. */
const PASO_ESCALONADO_MS = 40;

export function DishCard({
  plato,
  slug,
  currency,
  playbackUrl,
  posterUrl,
  prioritario,
  indice,
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
        className="flex flex-col gap-2 rounded-card focus-visible:outline-2"
      >
        {/*
          4:5 exacto — las mismas medidas que reserva el esqueleto de loading.tsx, para que
          al llegar la imagen no se mueva nada de lugar.
        */}
        <DishCardMedia
          dishId={plato.id}
          playbackUrl={playbackUrl}
          posterUrl={posterUrl}
          titulo={plato.name}
          prioritario={prioritario}
        />

        <span className="tarjeta-nombre text-small font-semibold transition-colors duration-[160ms] ease-[var(--ease-suave)]">
          {plato.name}
        </span>
        <span className="text-small font-bold text-brand">
          {formatPrice(plato.price, currency)}
        </span>
      </Link>
    </li>
  );
}
