import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DishFullscreen } from "@/components/menu/dish-fullscreen";
import { BrandScope } from "@/components/ui/brand-scope";
import { elegirPosterUrl, getVideoProvider } from "@/lib/video/provider";
import { getDishBySlugAndId } from "@/server/menu/queries";

/**
 * El plato a pantalla completa.
 *
 * La carta abre el plato en un modal sin cambiar su URL, pero esta ruta sigue siendo la
 * entrada directa compartible: sobrevive a un F5 y se puede enviar por WhatsApp.
 */

export const revalidate = 60;

type Props = { params: Promise<{ slug: string; dishId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, dishId } = await params;
  const encontrado = await getDishBySlugAndId(slug, dishId);

  if (!encontrado) return { title: "Plato no encontrado" };

  return {
    title: `${encontrado.plato.name} — ${encontrado.restaurante.name}`,
    description: encontrado.plato.description || undefined,
  };
}

export default async function PlatoPage({ params }: Props) {
  const { slug, dishId } = await params;
  const encontrado = await getDishBySlugAndId(slug, dishId);

  // El layout ya corto este caso con el 404 real. Esto queda por dos razones: acota el
  // tipo para TypeScript, y si algun dia alguien saca el layout la pagina no empieza a
  // reventar con un undefined.
  if (!encontrado) notFound();

  const { plato, restaurante } = encontrado;

  // Las URLs se resuelven en el SERVIDOR. El componente recibe cadenas y no sabe si detras
  // hay Cloudinary o archivos del propio sitio: cambiar de proveedor no lo toca.
  const proveedor = getVideoProvider();
  const playbackId = plato.video_playback_id ?? "";

  return (
    <BrandScope color={restaurante.primary_color}>
      <DishFullscreen
        plato={plato}
        restaurante={restaurante}
        playbackUrl={proveedor.playbackUrl(playbackId)}
        // El poster guardado gana sobre el derivado del video. La regla vive en
        // `elegirPosterUrl`, con tests: tenerla suelta acá ya costo una imagen rota en
        // produccion, en la pantalla que se usa para vender.
        posterUrl={elegirPosterUrl(proveedor, plato, { width: 480, ratio: "4:5" })}
      />
    </BrandScope>
  );
}
