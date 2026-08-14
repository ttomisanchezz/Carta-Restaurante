import { describe, expect, it } from "vitest";
import { caminoQr, ladoConZonaMuda, matrizQr, svgQr, urlDeMesa } from "@/lib/qr/codigo-qr";

const TOKEN = "a1b2c3d4e5f60718293a4b5c6d7e8f90";

describe("urlDeMesa", () => {
  it("arma la ruta de la mesa", () => {
    expect(urlDeMesa("https://carta.app", "brasa", TOKEN)).toBe(
      `https://carta.app/brasa/mesa/${TOKEN}`,
    );
  });

  it("recorta la barra final del origen", () => {
    // Un `//` de mas resuelve igual en casi todos los servidores, y despues queda impreso
    // en un cartel pegado a una mesa que ya no se puede corregir.
    expect(urlDeMesa("https://carta.app/", "brasa", TOKEN)).toBe(
      `https://carta.app/brasa/mesa/${TOKEN}`,
    );
    expect(urlDeMesa("https://carta.app///", "brasa", TOKEN)).toBe(
      `https://carta.app/brasa/mesa/${TOKEN}`,
    );
  });
});

describe("matrizQr", () => {
  it("es cuadrada y no esta vacia", () => {
    const matriz = matrizQr(`https://carta.app/brasa/mesa/${TOKEN}`);

    expect(matriz.length).toBeGreaterThan(0);
    for (const fila of matriz) {
      expect(fila).toHaveLength(matriz.length);
    }
  });

  it("es determinista: el mismo texto da la misma matriz", () => {
    // Importa de verdad: la hoja imprimible y la lista dibujan el mismo QR por separado, y
    // dos codigos distintos para la misma mesa serian imposibles de diagnosticar.
    expect(matrizQr("hola")).toEqual(matrizQr("hola"));
  });

  it("dos tokens distintos dan codigos distintos", () => {
    const uno = matrizQr(`https://carta.app/brasa/mesa/${TOKEN}`);
    const otro = matrizQr("https://carta.app/brasa/mesa/00000000000000000000000000000000");

    expect(uno).not.toEqual(otro);
  });

  it("tiene los tres patrones de deteccion en las esquinas", () => {
    /*
     * Cada "ojo" es 7x7: un centro 3x3 oscuro, un anillo blanco de un modulo y un anillo
     * oscuro de un modulo. O sea que el centro oscuro va en (3,3) y ocupa de 2 a 4 — en
     * (2,2) cae el anillo BLANCO. Sin los tres ojos el lector no encuentra el codigo, y
     * esta es la comprobacion mas barata de que la matriz no salio corrida.
     */
    const matriz = matrizQr(`https://carta.app/brasa/mesa/${TOKEN}`);
    const ultima = matriz.length - 1;

    for (const [filaBase, columnaBase] of [
      [3, 3],
      [3, ultima - 3],
      [ultima - 3, 3],
    ]) {
      for (let df = -1; df <= 1; df++) {
        for (let dc = -1; dc <= 1; dc++) {
          expect(matriz[(filaBase as number) + df]?.[(columnaBase as number) + dc]).toBe(true);
        }
      }
    }
  });
});

describe("ladoConZonaMuda", () => {
  it("suma los cuatro modulos de zona muda de cada lado", () => {
    const matriz = matrizQr("hola");
    expect(ladoConZonaMuda(matriz)).toBe(matriz.length + 8);
  });
});

describe("caminoQr", () => {
  it("dibuja un cuadrado por cada modulo oscuro", () => {
    const matriz = matrizQr("hola");
    const oscuros = matriz.flat().filter(Boolean).length;

    expect(caminoQr(matriz).match(/M/g) ?? []).toHaveLength(oscuros);
  });

  it("desplaza todo por la zona muda: ningun modulo toca el borde", () => {
    const coordenadas = caminoQr(matrizQr("hola")).matchAll(/M(\d+) (\d+)/g);

    for (const [, x, y] of coordenadas) {
      expect(Number(x)).toBeGreaterThanOrEqual(4);
      expect(Number(y)).toBeGreaterThanOrEqual(4);
    }
  });
});

describe("svgQr", () => {
  const svg = svgQr(`https://carta.app/brasa/mesa/${TOKEN}`);

  it("es un documento SVG autonomo, apto para descargar", () => {
    expect(svg.startsWith("<svg xmlns=")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
  });

  it("es OSCURO SOBRE CLARO", () => {
    // Un QR invertido falla en buena parte de los lectores, y este se imprime y se pega a
    // una mesa: el error se descubre con un cliente sentado, no en el gate.
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('fill="#000000"');
  });
});
