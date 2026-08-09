import { describe, expect, it } from "vitest";
import { DEFAULT_BRAND_COLOR, parseBrandColor } from "../../src/components/ui/brand-scope.tsx";

describe("parseBrandColor", () => {
  it("devuelve el hex tal cual cuando es valido", () => {
    expect(parseBrandColor("#E8562A")).toBe("#E8562A");
  });

  it("normaliza a mayusculas", () => {
    expect(parseBrandColor("#e8562a")).toBe("#E8562A");
    expect(parseBrandColor("#0a0a0b")).toBe("#0A0A0B");
  });

  it("descarta una inyeccion de CSS sin propagar un solo caracter", () => {
    const ataque = "red; background: url(javascript:alert(1))";

    const resultado = parseBrandColor(ataque);

    expect(resultado).toBe(DEFAULT_BRAND_COLOR);
    // Ningun fragmento de la entrada sobrevive: no se sanitiza, se descarta entero.
    expect(resultado).not.toContain("url");
    expect(resultado).not.toContain("javascript");
    expect(resultado).not.toContain(";");
    expect(resultado).not.toContain("red");
  });

  it.each([
    ["hex de 5 digitos", "#E8562"],
    ["hex sin numeral", "E8562A"],
    ["hex de 3 digitos", "#E52"],
    ["nombre de color CSS", "red"],
    ["funcion rgb", "rgb(232, 86, 42)"],
    ["cadena vacia", ""],
    ["solo espacios", "   "],
    ["hex valido con espacios alrededor", " #E8562A "],
    ["numero", 16_733_738],
    ["objeto", { color: "#E8562A" }],
    ["null", null],
    ["undefined", undefined],
  ])("devuelve el default con %s", (_caso, entrada) => {
    expect(parseBrandColor(entrada)).toBe(DEFAULT_BRAND_COLOR);
  });

  it("acepta cualquier hex de 6 digitos, no solo el de BRASA", () => {
    expect(parseBrandColor("#123ABC")).toBe("#123ABC");
    expect(parseBrandColor("#FFFFFF")).toBe("#FFFFFF");
  });
});
