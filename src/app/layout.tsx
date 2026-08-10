import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { getSiteUrl } from "@/lib/env";
import "./globals.css";

/**
 * Una sola familia tipografica, a proposito: una segunda cuesta ~40KB en la red
 * que ES la metrica del producto. El caracter sale de la escala y el espaciado.
 */
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
  variable: "--font-inter",
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
    <html lang="es" className={inter.variable}>
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
