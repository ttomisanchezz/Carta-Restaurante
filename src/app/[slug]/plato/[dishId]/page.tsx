import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DishFullscreen } from "@/components/menu/dish-fullscreen";
import { BrandScope } from "@/components/ui/brand-scope";
import { getDishBySlugAndId } from "@/server/menu/queries";

/**
 * El plato a pantalla completa.
 *
 * **El plato es una ruta, no un booleano.** Podria haber sido un estado dentro de la
 * grilla, pero entonces no se podria compartir por WhatsApp, no sobreviviria a un F5 y no
 * lo indexaria nadie. Es la pantalla que un comensal le pasa a otro.
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

  return (
    <BrandScope color={encontrado.restaurante.primary_color}>
      <DishFullscreen plato={encontrado.plato} restaurante={encontrado.restaurante} />
    </BrandScope>
  );
}
