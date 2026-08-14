import { afterEach, describe, expect, it, vi } from "vitest";
import { convieneTraerVideo } from "@/lib/video/preferencias-de-red";

function prepararNavegador({
  movimientoReducido = false,
  saveData = false,
  effectiveType = "4g",
}: {
  movimientoReducido?: boolean;
  saveData?: boolean;
  effectiveType?: string;
} = {}) {
  vi.stubGlobal("window", {
    matchMedia: () => ({ matches: movimientoReducido }),
  });
  vi.stubGlobal("navigator", { connection: { saveData, effectiveType } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("preferencias de red para video", () => {
  it("permite video con movimiento normal y una conexion suficiente", () => {
    prepararNavegador();
    expect(convieneTraerVideo()).toBe(true);
  });

  it("desactiva autoplay con movimiento reducido", () => {
    prepararNavegador({ movimientoReducido: true });
    expect(convieneTraerVideo()).toBe(false);
  });

  it("desactiva autoplay con ahorro de datos", () => {
    prepararNavegador({ saveData: true });
    expect(convieneTraerVideo()).toBe(false);
  });

  it.each(["2g", "slow-2g"])("desactiva autoplay en %s", (effectiveType) => {
    prepararNavegador({ effectiveType });
    expect(convieneTraerVideo()).toBe(false);
  });
});
