/**
 * 404 de una mesa.
 *
 * Atiende el `notFound()` que lanza `[token]/layout.tsx`: un layout se resuelve con el
 * `not-found` del segmento PADRE, y el padre de `[token]` es `mesa`.
 *
 * El texto no distingue entre "ese codigo no existe" y "esa mesa esta dada de baja", y es
 * deliberado: poder separarlos le daria a cualquiera un oraculo para ir descubriendo que
 * tokens son validos. Se ofrece la salida util —la carta sin mesa— que siempre funciona.
 */
export default function MesaNoEncontrada() {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-[720px] flex-col justify-center px-4">
      <h1 className="titulo-seccion text-h1">No encontramos esta mesa</h1>
      <p className="mt-4 text-body text-text-muted">
        El código puede estar vencido o mal leído. Probá escanearlo otra vez, o pedile la carta al
        mozo.
      </p>
    </div>
  );
}
