import { CartaNoEncontrada } from "@/components/menu/carta-no-encontrada";

/**
 * 404 de la aplicacion.
 *
 * En la practica es la pantalla de "carta inexistente", y no es casualidad: la ruta
 * `/[slug]` matchea cualquier path de primer nivel, asi que casi todo lo que no existe
 * termina siendo un slug que no existe. Tambien atiende el `notFound()` que lanza
 * `src/app/[slug]/layout.tsx`, que es el que consigue devolver un 404 con estado real.
 */
export default function NoEncontrado() {
  return <CartaNoEncontrada />;
}
