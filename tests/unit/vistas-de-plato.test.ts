import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  crearRegistradorDeVistas,
  generarTokenDeSesion,
  type LoteDeVistas,
  momentosAlcanzados,
} from "@/lib/metrics/vistas-de-plato";

/**
 * El agrupado de metricas, sin red y sin navegador.
 *
 * Se puede probar asi porque el modulo recibe la funcion que envia por parametro: la
 * decision de CUANDO mandar esta separada de POR DONDE, y solo la primera tiene logica.
 */

describe("momentosAlcanzados", () => {
  it("al arrancar solo cuenta 'iniciado'", () => {
    expect(momentosAlcanzados(0)).toEqual(["iniciado"]);
  });

  it("es acumulativo: a la mitad ya cruzo el 25 y el 50", () => {
    expect(momentosAlcanzados(0.5)).toEqual(["iniciado", "25", "50"]);
  });

  it("un salto adelante no se saltea los escalones que quedaron atras", () => {
    // El comensal arrastra la barra de 0.1 a 0.8. Devolviendo solo el escalon recien
    // cruzado, el 25 y el 50 se perderian para siempre.
    expect(momentosAlcanzados(0.8)).toEqual(["iniciado", "25", "50", "75"]);
  });

  it("'completo' entra en 0.95 y no exige llegar a 1", () => {
    // `timeupdate` se dispara cada ~250ms: el ultimo evento util puede quedar en 0.97 y no
    // hay ninguno exacto en 1.0. Con el umbral en 1 la metrica marcaria casi siempre cero.
    expect(momentosAlcanzados(0.95)).toContain("completo");
    expect(momentosAlcanzados(0.94)).not.toContain("completo");
  });

  it("una fraccion imposible no produce ningun momento", () => {
    // Pasa de verdad: `currentTime / duration` con `duration` en NaN antes de los metadatos.
    expect(momentosAlcanzados(Number.NaN)).toEqual([]);
    expect(momentosAlcanzados(-1)).toEqual([]);
    expect(momentosAlcanzados(Number.POSITIVE_INFINITY)).toEqual([]);
  });
});

describe("generarTokenDeSesion", () => {
  it("cumple exactamente el formato que exige la base", () => {
    // El mismo patron que el `check` de la columna y la validacion de la RPC: si esto
    // cambia, los eventos dejan de entrar y nadie se entera hasta mirar el panel vacio.
    expect(generarTokenDeSesion()).toMatch(/^[0-9a-f]{32}$/);
  });

  it("los bytes en cero tambien dan 32 caracteres", () => {
    // El `padStart` es lo que se esta probando: sin el, un byte 0x00 aporta "0" en vez de
    // "00" y el token sale corto justo cuando el azar mete ceros.
    const token = generarTokenDeSesion((bytes) => bytes.fill(0));

    expect(token).toBe("0".repeat(32));
    expect(token).toMatch(/^[0-9a-f]{32}$/);
  });

  it("dos tokens seguidos no coinciden", () => {
    expect(generarTokenDeSesion()).not.toBe(generarTokenDeSesion());
  });
});

describe("crearRegistradorDeVistas", () => {
  let enviados: LoteDeVistas[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    enviados = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const registrador = () =>
    crearRegistradorDeVistas({ enviar: (lote) => enviados.push(lote), intervaloMs: 5000 });

  it("no manda nada antes de que venza el intervalo", () => {
    const r = registrador();
    r.registrar("plato-1", 0.5);

    expect(enviados).toHaveLength(0);

    r.detener();
  });

  it("agrupa varios momentos del mismo plato en UN solo lote", () => {
    const r = registrador();
    r.registrar("plato-1", 0);
    r.registrar("plato-1", 0.3);
    r.registrar("plato-1", 0.6);

    vi.advanceTimersByTime(5000);

    // Lo que justifica todo el modulo: un plato mirado no son cinco requests, es uno.
    expect(enviados).toHaveLength(1);
    expect(enviados[0]?.dishId).toBe("plato-1");
    expect(enviados[0]?.momentos).toEqual(["iniciado", "25", "50"]);

    r.detener();
  });

  it("dos platos distintos salen en lotes distintos", () => {
    const r = registrador();
    r.registrar("plato-1", 0);
    r.registrar("plato-2", 0);

    vi.advanceTimersByTime(5000);

    expect(enviados).toHaveLength(2);
    expect(enviados.map((l) => l.dishId).sort()).toEqual(["plato-1", "plato-2"]);

    r.detener();
  });

  it("nunca reenvia un momento que ya salio", () => {
    const r = registrador();
    r.registrar("plato-1", 0.3);
    vi.advanceTimersByTime(5000);

    // Sigue mirando: el 25 ya se mando, solo el 50 es nuevo.
    r.registrar("plato-1", 0.6);
    vi.advanceTimersByTime(5000);

    expect(enviados).toHaveLength(2);
    expect(enviados[0]?.momentos).toEqual(["iniciado", "25"]);
    expect(enviados[1]?.momentos).toEqual(["50"]);

    r.detener();
  });

  it("sin nada nuevo no manda un lote vacio", () => {
    const r = registrador();
    r.registrar("plato-1", 0.3);
    vi.advanceTimersByTime(5000);
    enviados = [];

    // Mismo punto del video, otra vez: no hay nada que contar.
    r.registrar("plato-1", 0.3);
    vi.advanceTimersByTime(5000);

    expect(enviados).toHaveLength(0);

    r.detener();
  });

  it("`vaciar` manda en el momento, sin esperar el intervalo", () => {
    // Es lo que corre en `pagehide`: el comensal que cierra la pestaña apenas termina el
    // video es el caso mas interesante, y esperar al proximo intervalo seria perderlo.
    const r = registrador();
    r.registrar("plato-1", 1);
    r.vaciar();

    expect(enviados).toHaveLength(1);
    expect(enviados[0]?.momentos).toContain("completo");

    r.detener();
  });

  it("despues de `detener` el temporizador no vuelve a disparar", () => {
    const r = registrador();
    r.registrar("plato-1", 0.5);
    r.detener();

    vi.advanceTimersByTime(60_000);

    expect(enviados).toHaveLength(0);
  });

  it("no despierta ningun temporizador si nunca se registro nada", () => {
    const r = registrador();

    vi.advanceTimersByTime(60_000);

    // Una carta que se hojea sin abrir un plato no tiene por que despertar nada.
    expect(enviados).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);

    r.detener();
  });
});
