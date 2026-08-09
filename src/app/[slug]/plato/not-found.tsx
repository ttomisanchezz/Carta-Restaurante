/**
 * 404 de un plato.
 *
 * Atiende el `notFound()` que lanza `[dishId]/layout.tsx`: un layout se resuelve con el
 * `not-found` del segmento PADRE, y el padre de `[dishId]` es `plato`.
 *
 * Tiene texto propio en vez de reusar la pantalla de carta inexistente porque el caso es
 * otro: acá el restaurante existe. Lo que no esta es el plato — se dio de baja, o todavia
 * no tiene el video listo.
 */
export default function PlatoNoEncontrado() {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-[720px] flex-col justify-center px-4">
      <h1 className="text-h1 font-bold">Este plato ya no está</h1>
      <p className="mt-4 text-body text-text-muted">
        Puede que lo hayan sacado de la carta o que todavía lo estén preparando. Volvé a la carta
        para ver lo que hay hoy.
      </p>
    </div>
  );
}
