import type { CategoriaDeCarta } from "@/server/menu/queries";

/**
 * Chips de categoria. Presentacional: el estado lo tiene `DishGrid`.
 *
 * `aria-current="true"` en el chip activo y no solo un color: quien navega con lector de
 * pantalla tiene que poder saber que filtro esta puesto.
 *
 * 44px de alto minimo — el minimo de WCAG es 24, pero esto se usa con el pulgar sobre una
 * mesa.
 */

export const TODAS = "todas";

type Props = {
  categorias: CategoriaDeCarta[];
  activa: string;
  onSeleccionar: (id: string) => void;
};

export function CategoryNav({ categorias, activa, onSeleccionar }: Props) {
  const opciones = [{ id: TODAS, name: "Todo" }, ...categorias];

  return (
    <nav aria-label="Categorías">
      <ul className="flex list-none flex-wrap gap-2 p-0">
        {opciones.map((opcion) => {
          const esActiva = opcion.id === activa;

          return (
            <li key={opcion.id}>
              <button
                type="button"
                onClick={() => onSeleccionar(opcion.id)}
                aria-current={esActiva ? "true" : undefined}
                data-testid="chip-categoria"
                className={[
                  "min-h-[44px] rounded-chip border px-4 text-small font-semibold",
                  esActiva
                    ? "border-brand bg-brand text-on-brand"
                    : "border-border-strong text-text",
                ].join(" ")}
              >
                {opcion.name}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
