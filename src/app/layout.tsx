import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import { getSiteUrl } from "@/lib/env";
import "./globals.css";

/** Toda la interfaz: categorias, precios, descripciones, panel. */
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
  variable: "--font-inter",
});

/**
 * Solo el wordmark y los titulos de seccion.
 *
 * Una segunda familia cuesta bytes en la red, que ES la metrica del producto, asi que
 * viaja con lo minimo: **un solo peso, subset latin, sin italica**. Con eso son ~30KB, y
 * es lo que separa una carta que parece una plantilla de una que parece un restaurante.
 *
 * `preload: false` a proposito: el presupuesto del primer poster a 400 kbps es de cuatro
 * segundos, y un `<link rel=preload>` de la fuente le compite por el ancho de banda en el
 * unico momento que importa. El wordmark aparece en la serif de sistema y cambia; el
 * poster no tiene con que reemplazarse.
 */
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["600"],
  display: "swap",
  preload: false,
  variable: "--font-fraunces",
});

export const metadata: Metadata = {
  /**
   * Sin `metadataBase`, Next emite las URLs de Open Graph relativas y avisa por consola.
   * Una carta que se comparte por WhatsApp con la vista previa rota es una carta que el
   * comensal no abre — y este producto se comparte por WhatsApp todo el tiempo.
   *
   * Sale de `NEXT_PUBLIC_SITE_URL`: en local apunta al servidor de desarrollo, en Vercel
   * al dominio de produccion.
   *
   * `getSiteUrl()` y NO `loadPublicEnv()`: Next evalua esto en tiempo de build, y
   * `loadPublicEnv()` exige tambien las variables de Supabase. Usarla acá hacia fallar el
   * primer deploy de un proyecto nuevo, antes de que existan las variables.
   */
  metadataBase: new URL(getSiteUrl()),
  title: "Carta",
  description: "Carta con video para restaurantes",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // El tema ya viene en el HTML del servidor: no hay clase que agregue un script
    // despues, asi que no existe el destello de tema al cargar.
    <html
      lang="es"
      className={`${inter.variable} ${fraunces.variable}`}
      // Le avisa al router de Next que el `scroll-behavior: smooth` de globals.css es
      // deliberado. Sin esto, Next lo pisa en cada navegacion y ademas avisa por consola.
      data-scroll-behavior="smooth"
    >
      <body>
        {/* Primer elemento enfocable de la pagina. Ver .skip-link en globals.css. */}
        <a className="skip-link" href="#contenido">
          Saltar al contenido
        </a>
        <main id="contenido">{children}</main>
      </body>
    </html>
  );
}
