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
    <div className="mx-auto flex min-h-[80vh] w-full max-w-[720px] flex-col justify-center px-4 py-16">
      <p className="text-caption font-semibold uppercase tracking-[0.16em] text-brand">
        Carta con video
      </p>

      <span className="linea-acento linea-acento--izquierda mt-4" aria-hidden="true" />

      <h1 className="titulo-seccion mt-4 max-w-[18ch] text-display-sm">
        El plato se ve moviéndose, no en una foto.
      </h1>

      <p className="mt-6 max-w-[56ch] text-lead leading-relaxed text-text-muted">
        El comensal escanea el QR de la mesa y abre la carta del restaurante. Cada plato tiene un
        video vertical corto: la provoleta burbujeando, el ojo de bife abriéndose bajo el cuchillo.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <Link href="/brasa" className="boton-marca">
          Ver una carta de ejemplo
        </Link>

        <Link href="/admin/login" className="boton-linea">
          Entrar al panel
        </Link>
      </div>

      <p className="mt-12 max-w-[52ch] text-caption text-text-muted">
        BRASA es una parrilla de demostración. Los restaurantes reales administran su carta desde el
        panel.
      </p>
    </div>
  );
}
