import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getMenuBySlug } from "@/server/menu/queries";

/**
 * Puerta de la carta: si el slug no existe o el restaurante esta apagado, 404 y listo.
 *
 * ## Por que el 404 vive en el layout y no en la pagina
 *
 * `notFound()` solo puede fijar el estado HTTP mientras la respuesta no haya empezado a
 * salir. Next envuelve la PAGINA en un limite de Suspense y la streamea, asi que para
 * cuando el `await` de la pagina termina, los primeros bytes —con su 200— ya se fueron.
 * El resultado era una pantalla de "no encontramos esta carta" servida con 200: bien para
 * el ojo, mal para Google, para el monitoreo y para cualquier cliente HTTP.
 *
 * Verificado con curl contra el build: con la comprobacion en la pagina llegaba 200 y el
 * texto del 404 aparecia inyectado por el stream, sin `<h1>` en el HTML del servidor.
 *
 * El layout, en cambio, es parte del shell: Next lo resuelve ANTES del primer flush. Aca
 * `notFound()` si llega a tiempo de poner el 404.
 *
 * La consulta no se hace dos veces: `getMenuBySlug` esta envuelta en `cache()` de React,
 * asi que el layout y la pagina comparten el mismo resultado dentro del mismo pedido.
 */

export const revalidate = 60;

type Props = {
  children: ReactNode;
  params: Promise<{ slug: string }>;
};

export default async function CartaLayout({ children, params }: Props) {
  const { slug } = await params;
  const carta = await getMenuBySlug(slug);

  if (!carta) notFound();

  return <>{children}</>;
}
