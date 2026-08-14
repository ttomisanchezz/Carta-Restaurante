type Props = {
  total: number;
  videosListos: number;
  maridajesCargados: number;
};

/** Guia informativa para que el owner vea que le falta antes de publicar toda la carta. */
export function ChecklistActivacion({ total, videosListos, maridajesCargados }: Props) {
  const pasos = [
    { id: "videos", etiqueta: "Videos listos", completados: videosListos },
    { id: "maridajes", etiqueta: "Maridajes cargados", completados: maridajesCargados },
  ];

  return (
    <section
      aria-labelledby="titulo-activacion"
      data-testid="checklist-activacion"
      className="mt-6 rounded-card border border-border bg-surface p-4"
    >
      <h2 id="titulo-activacion" className="text-h3 font-semibold">
        Activación de la carta
      </h2>
      <p className="mt-2 text-small text-text-muted">
        Esta guía no bloquea la publicación; te muestra qué contenido falta completar.
      </p>

      <ul className="mt-4 flex list-none flex-col gap-3 p-0">
        {pasos.map((paso) => {
          const completo = total > 0 && paso.completados === total;
          return (
            <li
              key={paso.id}
              data-testid={`progreso-${paso.id}`}
              className="flex min-h-[44px] items-center justify-between gap-4 border-t border-border pt-3"
            >
              <span className="flex items-center gap-3 text-small font-semibold">
                <span aria-hidden="true" className={completo ? "text-success" : "text-text-muted"}>
                  {completo ? "✓" : "○"}
                </span>
                {paso.etiqueta}
              </span>
              <span className="text-small tabular-nums text-text-muted">
                {paso.completados}/{total}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
