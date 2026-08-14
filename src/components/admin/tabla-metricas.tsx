import type { MetricaDePlato } from "@/server/admin/metrics";

/**
 * Las metricas de visualizacion, en tabla.
 *
 * **Nunca se renderiza en la carta publica.** El comensal genera los eventos en silencio y
 * no ve un solo numero: una carta que muestra cuanta gente miro un plato deja de ser una
 * carta y pasa a ser un tablero.
 *
 * Es presentacional: recibe las filas ya resueltas y no consulta nada.
 */

type Props = {
  metricas: MetricaDePlato[];
};

export function TablaMetricas({ metricas }: Props) {
  const conVistas = metricas.filter((m) => m.vistas > 0);

  return (
    <section
      aria-labelledby="titulo-metricas"
      data-testid="tabla-metricas"
      className="mt-6 rounded-card border border-border bg-surface p-4"
    >
      <h2 id="titulo-metricas" className="text-h3 font-semibold">
        Qué se mira de tu carta
      </h2>
      <p className="mt-2 text-small text-text-muted">
        Una vista es un comensal que abrió el video. El porcentaje es cuántos llegaron al final.
      </p>

      {conVistas.length === 0 ? (
        // Vacio, no roto: la carta puede estar recien publicada. Decir "0 vistas" en una
        // tabla llena de ceros se lee como que la medicion fallo.
        <p data-testid="metricas-vacias" className="mt-4 text-small text-text-muted">
          Todavía no hay vistas registradas. Aparecen acá en cuanto un comensal abra un plato.
        </p>
      ) : (
        <table className="mt-4 w-full border-collapse text-small">
          <thead>
            <tr className="border-b border-border text-left text-text-muted">
              <th scope="col" className="py-2 font-semibold">
                Plato
              </th>
              <th scope="col" className="py-2 text-right font-semibold">
                Vistas
              </th>
              <th scope="col" className="py-2 text-right font-semibold">
                Lo terminan
              </th>
            </tr>
          </thead>
          <tbody>
            {conVistas.map((metrica) => (
              <tr
                key={metrica.dish_id}
                data-testid="fila-metrica"
                data-plato={metrica.dish_name}
                className="border-b border-border"
              >
                <td className="py-3">{metrica.dish_name}</td>
                <td className="py-3 text-right tabular-nums">{metrica.vistas}</td>
                <td className="py-3 text-right tabular-nums">
                  {/* `null` es "no se sabe" y no se dibuja como 0%: ver la vista en SQL. */}
                  {metrica.porcentaje_completo === null ? "—" : `${metrica.porcentaje_completo}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
