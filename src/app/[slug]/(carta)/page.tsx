import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CartaCompleta } from "@/components/menu/carta-completa";
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

  // Sin `mesa`: esta es la carta generica, la que se comparte por WhatsApp. La version con
  // mesa vive en `/[slug]/mesa/[token]` y renderiza este MISMO componente.
  return <CartaCompleta carta={carta} />;
}
