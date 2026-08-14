import { describe, expect, it } from "vitest";
import { formatCalories } from "@/lib/format/calories";

/**
 * `formatCalories` es puro y su salida es contrato nuestro, igual que `formatPrice`: no usa
 * `Intl`, asi que afirmar el texto exacto acá NO viola la regla de no testear literales del
 * runtime. Lo que esa regla prohibe son mensajes que produce Postgres, zod o ICU.
 */
describe("formatCalories", () => {
  it("null es null: sin dato no se dibuja nada", () => {
    expect(formatCalories(null)).toBeNull();
  });

  it("un valor normal sale con su unidad", () => {
    expect(formatCalories(540)).toBe("540 kcal");
  });

  it("los miles llevan punto, igual que el precio", () => {
    expect(formatCalories(1200)).toBe("1.200 kcal");
  });

  it("cero es un dato, no una ausencia", () => {
    expect(formatCalories(0)).toBe("0 kcal");
  });

  it("un negativo se trata como ausencia y no como '-' delante", () => {
    expect(formatCalories(-100)).toBeNull();
  });

  it("un no-finito no rompe la vista", () => {
    expect(formatCalories(Number.NaN)).toBeNull();
    expect(formatCalories(Number.POSITIVE_INFINITY)).toBeNull();
  });
});
