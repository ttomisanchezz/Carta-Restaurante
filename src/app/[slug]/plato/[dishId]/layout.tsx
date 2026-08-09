import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getDishBySlugAndId } from "@/server/menu/queries";

/**
 * Puerta del plato: si no existe, no esta listo, o pertenece a otro restaurante, 404.
 *
 * Va en el layout por el mismo motivo que en `[slug]/layout.tsx`: `notFound()` solo puede
 * fijar el estado HTTP mientras la respuesta no empezo a salir, y la PAGINA se streamea
 * dentro de un limite de Suspense — para cuando termina su `await`, el 200 ya se fue. El
 * layout es parte del shell y se resuelve antes del primer flush.
 *
 * La consulta no se repite en la pagina: `getDishBySlugAndId` esta memorizada con
 * `cache()` y por debajo reusa la carta que ya trajo el layout del slug.
 */

export const revalidate = 60;

type Props = {
  children: ReactNode;
  params: Promise<{ slug: string; dishId: string }>;
};

export default async function PlatoLayout({ children, params }: Props) {
  const { slug, dishId } = await params;
  const encontrado = await getDishBySlugAndId(slug, dishId);

  if (!encontrado) notFound();

  return <>{children}</>;
}
