import { describe, expect, it } from "vitest";
import { formatPrice } from "@/lib/format/price";

/**
 * Estos literales SI se afirman, y es la excepcion deliberada a la regla de no afirmar
 * texto que produce el runtime: `formatPrice` no usa `Intl`, es puro, y su salida es
 * contrato nuestro. Si cambia, cambio el producto, no la version de Node.
 */

describe("formatPrice", () => {
  it("cumple los tres casos del contrato", () => {
    expect(formatPrice(1_350_000, "ARS")).toBe("$ 13.500,00");
    expect(formatPrice(0, "ARS")).toBe("$ 0,00");
    expect(formatPrice(380_000, "USD")).toBe("US$ 3.800,00");
  });

  it("separa los miles con punto y los decimales con coma", () => {
    expect(formatPrice(100, "ARS")).toBe("$ 1,00");
    expect(formatPrice(99, "ARS")).toBe("$ 0,99");
    expect(formatPrice(100_000, "ARS")).toBe("$ 1.000,00");
    expect(formatPrice(123_456_789, "ARS")).toBe("$ 1.234.567,89");
  });

  it("usa el codigo tal cual cuando la moneda no tiene simbolo propio", () => {
    expect(formatPrice(150_000, "EUR")).toBe("EUR 1.500,00");
    expect(formatPrice(150_000, "BRL")).toBe("BRL 1.500,00");
  });

  it("separa simbolo y numero con un espacio simple, no con uno raro", () => {
    // `Intl` mete un U+00A0 y a veces un U+202F. Ese es exactamente el bug que este
    // modulo existe para no tener.
    const salida = formatPrice(1_350_000, "ARS");
    expect(salida).toContain(" ");
    expect(salida).not.toContain(" ");
    expect(salida).not.toContain(" ");
  });

  it("no rompe con un negativo", () => {
    // El constraint de la base impide precios negativos, pero un formateador que
    // devuelve "$ NaN" ante un dato inesperado convierte un bug de datos en una
    // pantalla rota.
    expect(formatPrice(-1_350_000, "ARS")).toBe("-$ 13.500,00");
  });
});
