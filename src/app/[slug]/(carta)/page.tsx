import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DishGrid } from "@/components/menu/dish-grid";
import { BrandScope } from "@/components/ui/brand-scope";
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

  return (
    <BrandScope color={restaurante.primary_color}>
      <div className="mx-auto w-full max-w-[720px] px-4 py-6">
        <h1 className="text-h1 font-bold">{restaurante.name}</h1>

        {platos.length === 0 ? (
          // Vacio, no roto. El restaurante existe y esta al aire; todavia no tiene ningun
          // plato con el video listo, y la policy de RLS es la que los deja afuera.
          <p className="mt-8 text-body text-text-muted">Estamos preparando la carta</p>
        ) : (
          <DishGrid
            platos={platos}
            // Solo las categorias que tienen algo que mostrar: un chip que filtra a cero
            // parece un error de la aplicacion.
            categorias={categorias.filter((c) => platos.some((p) => p.category_id === c.id))}
            slug={restaurante.slug}
            currency={restaurante.currency}
          />
        )}
      </div>
    </BrandScope>
  );
}
