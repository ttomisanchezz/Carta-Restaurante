/**
 * Esqueleto de la carta.
 *
 * Las medidas son LAS REALES de la grilla: dos columnas, poster 4:5. Un esqueleto de
 * altura equivocada es peor que un spinner — el contenido llega, empuja todo hacia abajo
 * y el comensal toca el plato que no era.
 *
 * ## Por que vive dentro del grupo `(carta)` y no en `[slug]/`
 *
 * Un `loading.tsx` abre un limite de Suspense que envuelve **todo su subarbol**. Puesto en
 * `[slug]/` tapaba tambien a `[slug]/plato/[dishId]`, y eso rompia el 404 de un plato
 * inexistente: con la respuesta ya streameando, el `notFound()` del layout del plato
 * llegaba tarde para fijar el estado y salia un 200.
 *
 * Medido: con este archivo en `[slug]/`, `/brasa/plato/<id-que-no-existe>` devolvia 200.
 * Movido acá, devuelve 404 — y la carta sigue teniendo su esqueleto.
 *
 * El grupo `(carta)` no aparece en la URL: `/brasa` sigue siendo `/brasa`.
 */
export default function CargandoCarta() {
  return (
    <div aria-hidden="true" data-testid="esqueleto-carta">
      {/*
        El hero se reserva con su clase real y no con una altura inventada: es 74svh de
        pantalla, y si el hueco midiera otra cosa la carta entera saltaria al llegar.
        El rescoldo y el grano ya vienen con la clase, asi que el esqueleto no se ve gris.
      */}
      <div className="hero-carta">
        <div className="esqueleto esqueleto--activo h-12 w-1/2 rounded-control" />
        <div className="linea-acento mt-6" />
        <div className="esqueleto esqueleto--activo mt-6 h-4 w-2/3 max-w-[34ch] rounded-control" />
      </div>

      <div className="mx-auto w-full max-w-[720px] px-4 py-12">
        {/* El filete y el titulo de seccion: van tal cual, no como hueco gris. Un filete
            de 1px no tiene nada que reservar y ya da la sensacion de que algo llego. */}
        <span className="linea-acento linea-acento--izquierda" />
        <div className="esqueleto esqueleto--activo mt-4 h-6 w-32 rounded-control" />

        {/* Los chips de categoria, con el alto tactil real de 44px. */}
        <div className="mt-6 flex gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="esqueleto esqueleto--activo h-[44px] w-24 rounded-chip" />
          ))}
        </div>

        {/* Las mismas columnas que la grilla de verdad, o al llegar los platos se mueve todo. */}
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6">
          {/* Seis huecos: lo que entra en una pantalla de 375px antes de scrollear. */}
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex flex-col gap-3">
              {/* 4:5 exacto, igual que el poster que va a ocupar este lugar. */}
              <div className="esqueleto esqueleto--activo aspect-4/5 w-full rounded-card" />
              <div className="flex flex-col gap-2">
                {/* Las mismas medidas que `.tarjeta-acento`: 2px de alto, 24 de ancho. */}
                <div className="h-[2px] w-6 rounded-chip bg-border" />
                <div className="esqueleto esqueleto--activo h-4 w-3/4 rounded-control" />
                <div className="esqueleto esqueleto--activo h-4 w-1/3 rounded-control" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
