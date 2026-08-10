import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CartaHero } from "@/components/menu/carta-hero";
import { DishGrid, type MediosPorPlato } from "@/components/menu/dish-grid";
import { BrandScope } from "@/components/ui/brand-scope";
import { elegirPosterUrl, getVideoProvider } from "@/lib/video/provider";
import { getMenuBySlug } from "@/server/menu/queries";

/**
 * La carta publica. Es la pantalla que se abre al escanear el QR de la mesa.
 *
 * Server Component puro: el nombre del restaurante viaja en el HTML del servidor, antes
 * de que corra un solo script. En una mesa, con datos moviles, esa diferencia es la que
 * decide si el comensal ve algo o ve blanco.
 */

// 60 segundos: un cambio de precio en el panel tarda a lo sumo un minuto en verse, y a
// cambio la carta no consulta Postgres una vez por cada escaneo de cada mesa.
export const revalidate = 60;

// Los restaurantes se dan de alta en el panel, no en un deploy: cualquier slug que no
// estaba en el build tiene que poder renderizarse igual.
export const dynamicParams = true;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const carta = await getMenuBySlug(slug);

  if (!carta) return { title: "Carta no encontrada" };

  const descripcion = `Mirá los platos de ${carta.restaurante.name} en video.`;
  // El primer poster de la carta hace de imagen de la vista previa. `metadataBase` del
  // layout raiz lo convierte en absoluto; sin eso, WhatsApp no muestra nada.
  const poster = carta.platos[0]?.thumbnail_url;

  return {
    title: `${carta.restaurante.name} — Carta`,
    description: descripcion,
    // La carta se comparte por WhatsApp mucho mas de lo que se escanea dos veces. Un
    // enlace con vista previa se abre; uno pelado, no.
    openGraph: {
      type: "website",
      title: `${carta.restaurante.name} — Carta`,
      description: descripcion,
      url: `/${carta.restaurante.slug}`,
      images: poster ? [poster] : undefined,
    },
  };
}

export default async function CartaPage({ params }: Props) {
  const { slug } = await params;
  const carta = await getMenuBySlug(slug);

  // Inexistente y dado de baja terminan igual, a proposito: un 404 y nada mas.
  if (!carta) notFound();

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
        <h2 className="titulo-seccion mt-4 text-h2">La carta</h2>

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
            slug={restaurante.slug}
            medios={medios}
            currency={restaurante.currency}
          />
        )}
      </div>
    </BrandScope>
  );
}
