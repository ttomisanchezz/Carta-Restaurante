/**
 * Pantalla de "esta carta no existe".
 *
 * Vive en un componente y no dentro de un `not-found.tsx` porque hacen falta DOS
 * archivos que la muestren, y son dos por una razon concreta de Next:
 *
 * - `src/app/[slug]/not-found.tsx` atiende los `notFound()` que lanza una PAGINA de ese
 *   segmento o de los de abajo (por ejemplo la vista de un plato inexistente).
 * - `src/app/not-found.tsx` atiende el que lanza `src/app/[slug]/layout.tsx`. Un
 *   `notFound()` lanzado desde un layout NO lo captura el `not-found.tsx` de su propio
 *   segmento —ese esta por dentro— sino el del segmento padre. Y ese `notFound()` del
 *   layout es justamente el que consigue el 404 de verdad.
 *
 * Sin este componente, la unica salida seria duplicar el markup en los dos archivos y
 * que uno de los dos se quedara viejo.
 */
export function CartaNoEncontrada() {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-[720px] flex-col justify-center px-4">
      <span className="linea-acento linea-acento--izquierda" aria-hidden="true" />
      <h1 className="titulo-seccion mt-4 text-h1">No encontramos esta carta</h1>
      <p className="mt-4 max-w-[52ch] text-body text-text-muted">
        Puede que el enlace esté viejo o que el restaurante ya no esté publicando su carta acá.
        Probá escanear de nuevo el código de la mesa.
      </p>
    </div>
  );
}
