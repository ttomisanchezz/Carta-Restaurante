import { describe, expect, it } from "vitest";
import {
  DIAS_PARA_AVISO_DE_INACTIVIDAD,
  debeMostrarAvisoDeInactividad,
} from "@/lib/auth/inactividad";

const ANTERIOR = "2026-07-01T12:00:00.000Z";

describe("aviso de inactividad", () => {
  it("no aparece en el primer ingreso ni con fechas invalidas", () => {
    expect(debeMostrarAvisoDeInactividad("2026-08-01T12:00:00.000Z", null)).toBe(false);
    expect(debeMostrarAvisoDeInactividad("fecha-invalida", ANTERIOR)).toBe(false);
  });

  it("no aparece al cumplirse exactamente catorce dias", () => {
    const actual = "2026-07-15T12:00:00.000Z";
    expect(DIAS_PARA_AVISO_DE_INACTIVIDAD).toBe(14);
    expect(debeMostrarAvisoDeInactividad(actual, ANTERIOR)).toBe(false);
  });

  it("aparece cuando pasaron mas de catorce dias", () => {
    const actual = "2026-07-15T12:00:00.001Z";
    expect(debeMostrarAvisoDeInactividad(actual, ANTERIOR)).toBe(true);
  });

  it("permite ajustar el umbral", () => {
    const actual = "2026-07-20T12:00:00.000Z";
    expect(debeMostrarAvisoDeInactividad(actual, ANTERIOR, 30)).toBe(false);
  });
});
