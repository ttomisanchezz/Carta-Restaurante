import type { Metadata } from "next";
import { Inter } from "next/font/google";
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
