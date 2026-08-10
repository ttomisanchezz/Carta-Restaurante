import type { CategoriaDeCarta } from "@/server/menu/queries";

/**
 * Chips de categoria. Presentacional: el estado lo tiene `DishGrid`.
 *
 * `aria-current="true"` en el chip activo y no solo un color: quien navega con lector de
 * pantalla tiene que poder saber que filtro esta puesto.
 *
 * 44px de alto minimo — el minimo de WCAG es 24, pero esto se usa con el pulgar sobre una
 * mesa.
 *
 * El aspecto vive en `.chip-categoria` en `globals.css`, no acá: el hover tiene que ir
 * gateado por `(hover: hover)` para que en tactil no quede un chip iluminado despues del
 * toque, y eso no se escribe con utilidades.
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
                className={esActiva ? "chip-categoria chip-categoria--activa" : "chip-categoria"}
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
