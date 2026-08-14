import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getTableByToken } from "@/server/menu/queries";

/**
 * Puerta de la mesa: token que no resuelve, 404 y nada mas.
 *
 * ## Por que el 404 vive acá y no en la pagina
 *
 * Es la misma razon que en `[slug]/layout.tsx`, y es la trampa mas cara de esta ruta:
 * `notFound()` solo puede fijar el estado HTTP mientras la respuesta no haya empezado a
 * salir. Next envuelve la PAGINA en un limite de Suspense y la streamea, asi que cuando el
 * `await` de la pagina termina los primeros bytes —con su 200— ya se fueron, y quedaria un
 * "no encontramos esta mesa" servido con 200. El layout es parte del shell y se resuelve
 * antes del primer flush.
 *
 * La consulta no se hace dos veces: `getTableByToken` esta envuelta en `cache()` de React,
 * asi que este layout y la pagina comparten el resultado dentro del mismo pedido.
 *
 * Token invalido, inexistente, de mesa desactivada, de restaurante desactivado o de otro
 * restaurante terminan todos acá. **No se cae a la carta generica**: si el QR de la mesa 5
 * empieza a mostrar la carta sin mesa, nadie se entera hasta que en Fase 2 los pedidos
 * lleguen sin mesa asignada.
 */

export const revalidate = 60;
export const dynamicParams = true;

type Props = {
  children: ReactNode;
  params: Promise<{ slug: string; token: string }>;
};

export default async function MesaLayout({ children, params }: Props) {
  const { slug, token } = await params;
  const mesa = await getTableByToken(slug, token);

  if (!mesa) notFound();

  return <>{children}</>;
}
