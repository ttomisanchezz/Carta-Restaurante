import Link from "next/link";
import { formatPrice } from "@/lib/format/price";
import type { PlatoDeCarta, RestauranteDeCarta } from "@/server/menu/queries";
import { VideoPlayer } from "./video-player.tsx";

/**
 * El plato a pantalla completa.
 *
 * El maridaje tiene tratamiento propio —barra de marca, italica, el nombre del
 * restaurante debajo— y no es decoracion: **es lo unico que ninguna carta en PDF tiene**.
 * Es la recomendacion del dueno, en su voz, y es lo que vende el producto. Tratarlo como
 * un parrafo mas seria tirar el argumento de venta.
 *
 * Todavia sin video: en el paso 12 el reproductor se monta encima del poster.
 */

type Props = {
  plato: PlatoDeCarta;
  restaurante: RestauranteDeCarta;
  /** Las arma el proveedor de video en el servidor. El componente no sabe de que proveedor. */
  playbackUrl: string;
  posterUrl: string;
};

export function DishFullscreen({ plato, restaurante, playbackUrl, posterUrl }: Props) {
  return (
    <article className="mx-auto w-full max-w-[720px] px-4 py-6">
      <div className="flex items-center justify-between gap-4">
        {/* Cerrar es un enlace, no un boton con history.back(): esta URL se comparte y se
            abre en frio, y ahi atras no hay ninguna carta a la que volver. */}
        <Link
          href={`/${restaurante.slug}`}
          data-testid="cerrar-plato"
          aria-label="Volver a la carta"
          className="flex min-h-[44px] min-w-[44px] items-center text-small font-semibold"
        >
          ← Volver
        </Link>
      </div>

      <VideoPlayer playbackUrl={playbackUrl} posterUrl={posterUrl} titulo={plato.name} />

      <h1 className="mt-6 text-h1 font-bold">{plato.name}</h1>

      <p data-testid="precio-plato" className="mt-2 text-h3 font-bold text-brand">
        {formatPrice(plato.price, restaurante.currency)}
      </p>

      {plato.description !== "" ? (
        <p className="mt-4 text-body text-text-muted">{plato.description}</p>
      ) : null}

      {plato.pairing_text ? (
        <blockquote
          data-testid="maridaje"
          className="mt-6 border-l-[3px] border-brand p-4 text-lead italic"
        >
          {plato.pairing_text}
          <footer className="mt-2 text-caption not-italic text-text-muted">
            {restaurante.name}
          </footer>
        </blockquote>
      ) : null}
    </article>
  );
}
