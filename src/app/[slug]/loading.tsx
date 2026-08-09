/**
 * Esqueleto de la carta.
 *
 * Las medidas son LAS REALES de la grilla: dos columnas, poster 4:5. Un esqueleto de
 * altura equivocada es peor que un spinner — el contenido llega, empuja todo hacia abajo
 * y el comensal toca el plato que no era.
 */
export default function CargandoCarta() {
  return (
    <div className="mx-auto w-full max-w-[720px] px-4 py-6" aria-hidden="true">
      <div className="h-8 w-1/2 rounded-control bg-surface" />

      <div className="mt-6 grid grid-cols-2 gap-4">
        {/* Seis huecos: lo que entra en una pantalla de 375px antes de scrollear. */}
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex flex-col gap-2">
            {/* 4:5 exacto, igual que el poster que va a ocupar este lugar. */}
            <div className="aspect-4/5 w-full rounded-card bg-surface" />
            <div className="h-4 w-3/4 rounded-control bg-surface" />
            <div className="h-4 w-1/3 rounded-control bg-surface" />
          </div>
        ))}
      </div>
    </div>
  );
}
