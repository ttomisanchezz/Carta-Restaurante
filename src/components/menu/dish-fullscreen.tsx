import Link from "next/link";
import { formatPrice } from "@/lib/format/price";
import type { PlatoDeCarta, RestauranteDeCarta } from "@/server/menu/queries";
import { VideoPlayer } from "./video-player.tsx";

/**
 * El plato a pantalla completa.
 *
 * El maridaje tiene tratamiento propio —barra de marca, serif, el nombre del restaurante
 * debajo— y no es decoracion: **es lo unico que ninguna carta en PDF tiene**. Es la
 * recomendacion del dueno, en su voz, y es lo que vende el producto. Tratarlo como un
 * parrafo mas seria tirar el argumento de venta. El detalle vive en `.maridaje`.
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
      {/* Cerrar es un enlace, no un boton con history.back(): esta URL se comparte y se
          abre en frio, y ahi atras no hay ninguna carta a la que volver. */}
      <Link
        href={`/${restaurante.slug}`}
        data-testid="cerrar-plato"
        aria-label="Volver a la carta"
        className="boton-linea boton--chico"
      >
        ← Volver
      </Link>

      <VideoPlayer playbackUrl={playbackUrl} posterUrl={posterUrl} titulo={plato.name} />

      <span className="linea-acento linea-acento--izquierda mt-8" aria-hidden="true" />
      <h1 className="titulo-seccion mt-4 text-h1">{plato.name}</h1>

      <p data-testid="precio-plato" className="precio mt-3 text-h2">
        {formatPrice(plato.price, restaurante.currency)}
      </p>

      {plato.description !== "" ? (
        // 60ch de medida: mas largo que eso, el ojo pierde el renglon al volver.
        <p className="mt-6 max-w-[60ch] text-body leading-relaxed text-text-muted">
          {plato.description}
        </p>
      ) : null}

      {plato.pairing_text ? (
        <blockquote data-testid="maridaje" className="maridaje mt-8 max-w-[52ch]">
          {plato.pairing_text}
          <footer className="mt-3 font-sans text-caption font-semibold uppercase tracking-[0.14em] text-text-muted">
            {restaurante.name}
          </footer>
        </blockquote>
      ) : null}
    </article>
  );
}
