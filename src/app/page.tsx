import type { Metadata } from "next";
import Link from "next/link";

/**
 * La raiz del dominio.
 *
 * No es una pantalla del producto: el comensal nunca llega acá, llega a `/[slug]` por el
 * QR de su mesa. Pero es lo que ve cualquiera a quien le pases el dominio pelado, y hasta
 * recien mostraba el andamio de `create-next-app` en ingles y con las imagenes rotas.
 *
 * Es deliberadamente minima. El texto de venta de verdad —precios, planes, contacto— es
 * trabajo de marketing, no algo que convenga inventar acá.
 */

export const metadata: Metadata = {
  title: "Carta con video para restaurantes",
  description:
    "La carta que el comensal abre escaneando el QR de la mesa, con un video corto por plato.",
};

export default function Home() {
  return (
    <div className="mx-auto flex min-h-[80vh] w-full max-w-[720px] flex-col justify-center px-4">
      <p className="text-small font-semibold text-brand">Carta con video</p>

      <h1 className="mt-2 text-h1 font-bold">El plato se ve moviéndose, no en una foto.</h1>

      <p className="mt-4 text-lead text-text-muted">
        El comensal escanea el QR de la mesa y abre la carta del restaurante. Cada plato tiene un
        video vertical corto: la provoleta burbujeando, el ojo de bife abriéndose bajo el cuchillo.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <Link
          href="/brasa"
          className="flex min-h-[44px] items-center rounded-control bg-brand px-6 text-body font-semibold text-on-brand"
        >
          Ver una carta de ejemplo
        </Link>

        <Link
          href="/admin/login"
          className="flex min-h-[44px] items-center rounded-control border border-border-strong px-6 text-body font-semibold"
        >
          Entrar al panel
        </Link>
      </div>

      <p className="mt-8 text-caption text-text-muted">
        BRASA es una parrilla de demostración. Los restaurantes reales administran su carta desde el
        panel.
      </p>
    </div>
  );
}
