import { CartaHero } from "@/components/menu/carta-hero";
import { DishGrid, type MediosPorPlato } from "@/components/menu/dish-grid";
import { BrandScope } from "@/components/ui/brand-scope";
import { elegirPosterUrl, getVideoProvider } from "@/lib/video/provider";
import type { Carta } from "@/server/menu/queries";

/**
 * El cuerpo de la carta publica, compartido por `/[slug]` y `/[slug]/mesa/[token]`.
 *
 * Existe como componente y no duplicado en las dos rutas porque las dos tienen que
 * renderizar EXACTAMENTE lo mismo: la version con mesa es la carta de siempre mas un
 * indicador. Dos copias divergen —una gana una mejora de rendimiento y la otra no— y el
 * comensal que escanea el QR termina viendo la peor de las dos, que es justo el caso que
 * mas nos importa.
 *
 * Recibe la `Carta` ya resuelta: no consulta la base. Quien la consulta es la ruta, y asi
 * este componente no cruza la frontera hacia `server/`.
 */

type Props = {
  carta: Carta;
  /** La etiqueta de la mesa ("Mesa 5"), cuando se llego escaneando un QR. */
  mesa?: string;
};

/**
 * ## Por que el carrito NO se importa desde acá
 *
 * Esto empezo recibiendo un prop `pedido` y envolviendo la carta con el proveedor del
 * carrito. Costo el presupuesto de red y lo agarro `perf-poster.spec.ts`: un `import` de
 * `PedidoMesa` en este archivo mete el JavaScript del carrito en el bundle de **las dos**
 * rutas, porque el bundler no sabe que el prop va a llegar `undefined` en `/[slug]`. La
 * carta publica pasaba a bajarse codigo de pedidos que no puede usar, y a 400 kbps esos
 * bytes se los quita al primer poster.
 *
 * Ahora la composicion la hace la ruta de mesa: ella importa el proveedor y envuelve a este
 * componente. Acá no queda ni una referencia, y `/[slug]` vuelve a viajar liviana.
 */
export function CartaCompleta({ carta, mesa }: Props) {
  const { restaurante, categorias, platos } = carta;

  /**
   * Las URLs de cada plato se arman ACA, en el servidor.
   *
   * La grilla es un componente de cliente: si armara las URLs ella, el nombre de la cuenta
   * de Cloudinary y el perfil de streaming tendrian que viajar al navegador. Ademas es la
   * frontera que hace que cambiar de proveedor no toque un solo componente.
   */
  const proveedor = getVideoProvider();
  const medios: MediosPorPlato = Object.fromEntries(
    platos.map((plato) => [
      plato.id,
      {
        // 600px: una tarjeta mide ~170 CSS px en un telefono, y a 3x de densidad eso son
        // ~510 fisicos. Pedir mas es pagar bytes que la pantalla no puede mostrar.
        // 6 segundos: es un teaser en loop, no la pelicula.
        clipUrl: plato.video_playback_id
          ? proveedor.clipUrl(plato.video_playback_id, { width: 600, ratio: "4:5", segundos: 6 })
          : "",
        playbackUrl: plato.video_playback_id ? proveedor.playbackUrl(plato.video_playback_id) : "",
        posterUrl: elegirPosterUrl(proveedor, plato, { width: 480, ratio: "4:5" }),
      },
    ]),
  );

  return (
    <BrandScope color={restaurante.primary_color}>
      <CartaHero nombre={restaurante.name} />

      {/* `scroll-mt-8` para que el titulo no quede pegado al borde al saltar desde el
          hero: un ancla que deja el contenido al ras se lee como que no paso nada. */}
      <div id="carta" className="mx-auto w-full max-w-[720px] scroll-mt-8 px-4 py-12">
        {/* El filete dorado arriba del titulo: el mismo recurso del hero, al ras a la
            izquierda. Es lo que ata las dos mitades de la pantalla. */}
        <span className="linea-acento linea-acento--izquierda" aria-hidden="true" />

        <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="titulo-seccion text-h2">La carta</h2>

          {/*
           * El indicador de mesa: discreto a proposito.
           *
           * Sirve para que el comensal confirme que escaneo el codigo correcto —y en Fase 2,
           * para que entienda a donde va a llegar su pedido— pero no es el contenido. El
           * contenido es la comida. Va en texto atenuado, sin fondo de marca y sin dorado:
           * el dorado de esta pantalla ya se lo gasto la linea de acento de arriba.
           */}
          {mesa ? (
            <span data-testid="indicador-mesa" className="text-small text-text-muted">
              {mesa}
            </span>
          ) : null}
        </div>

        {platos.length === 0 ? (
          // Vacio, no roto. El restaurante existe y esta al aire; todavia no tiene ningun
          // plato con el video listo, y la policy de RLS es la que los deja afuera.
          <p className="mt-6 text-body text-text-muted">Estamos preparando la carta</p>
        ) : (
          <DishGrid
            platos={platos}
            // Solo las categorias que tienen algo que mostrar: un chip que filtra a cero
            // parece un error de la aplicacion.
            categorias={categorias.filter((c) => platos.some((p) => p.category_id === c.id))}
            // Siempre el slug del restaurante, tambien cuando se llego por el QR de una
            // mesa: el enlace que se comparte es el del plato en la carta publica, no uno
            // que arrastre el token de la mesa a un chat ajeno.
            slug={restaurante.slug}
            medios={medios}
            currency={restaurante.currency}
          />
        )}
      </div>
    </BrandScope>
  );
}
