import { CartaNoEncontrada } from "@/components/menu/carta-no-encontrada";

/**
 * 404 para los `notFound()` que lanza una pagina de este segmento o de los de abajo
 * — por ejemplo un plato que no existe.
 *
 * El caso "el restaurante no existe" no cae aca sino en `src/app/not-found.tsx`: ese lo
 * lanza el layout de este segmento, y un layout se atiende con el not-found del padre.
 */
export default function NoEncontrado() {
  return <CartaNoEncontrada />;
}
