import type { ReactNode } from "react";
import { z } from "zod";

/** El ember de BRASA. Es el default cuando el restaurante no trae color propio. */
export const DEFAULT_BRAND_COLOR = "#E15A2B";

/**
 * Hex de 6 digitos con numeral. Nada mas. Ni 3 digitos, ni nombres CSS, ni
 * `rgb()`, ni funciones.
 */
const brandColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .transform((value) => value.toUpperCase());

/**
 * Valida el color de marca ANTES de que toque el DOM.
 *
 * Este valor viene de la base, o sea de algo que carga un usuario, y termina
 * dentro de un atributo `style`. Interpolar texto sin validar ahi es de las pocas
 * vias de inyeccion de CSS que siguen vivas: bastaria un
 * `red; background: url(...)` para escaparse de la declaracion.
 *
 * Por eso no se sanitiza ni se recorta la entrada: **o encaja exacto en el patron,
 * o se descarta entera** y se devuelve el default. Una entrada invalida nunca
 * aporta un solo caracter a la salida.
 */
export function parseBrandColor(input: unknown): string {
  const parsed = brandColorSchema.safeParse(input);
  return parsed.success ? parsed.data : DEFAULT_BRAND_COLOR;
}

type BrandScopeProps = {
  color?: unknown;
  children: ReactNode;
};

/**
 * Server Component que inyecta el color del restaurante como propiedad CSS.
 *
 * Un solo token cambia y toda la carta queda revestida con la marca del cliente,
 * sin recompilar estilos ni generar una hoja por restaurante.
 */
export function BrandScope({ color, children }: BrandScopeProps) {
  const brand = parseBrandColor(color);

  return (
    <div style={{ "--color-brand": brand } as React.CSSProperties} data-brand-scope="">
      {children}
    </div>
  );
}
