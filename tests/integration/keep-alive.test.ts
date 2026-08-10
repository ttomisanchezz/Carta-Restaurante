import { describe, expect, it } from "vitest";
import * as rutaKeepAlive from "@/app/api/keep-alive/route";

/**
 * La tarea anti-pausa.
 *
 * El handler es una funcion comun que recibe un `Request`, asi que se lo llama directo sin
 * levantar un servidor. No usa `next/headers`, que es lo que haria imposible esto.
 */

const SECRETO = process.env.CRON_SECRET ?? "";

function pedir(authorization?: string): Request {
  return new Request("https://carta.local/api/keep-alive", {
    method: "GET",
    headers: authorization ? { authorization } : {},
  });
}

describe("GET /api/keep-alive", () => {
  it("con el Bearer correcto responde 200", async () => {
    // Si esto falla por falta de CRON_SECRET, el problema es el entorno, no la ruta.
    expect(SECRETO).not.toBe("");

    const respuesta = await rutaKeepAlive.GET(pedir(`Bearer ${SECRETO}`));

    expect(respuesta.status).toBe(200);
    const cuerpo = await respuesta.json();
    expect(cuerpo.data.ok).toBe(true);
  });

  it("sin encabezado responde 401", async () => {
    const respuesta = await rutaKeepAlive.GET(pedir());

    expect(respuesta.status).toBe(401);
    expect((await respuesta.json()).error.code).toBe("unauthorized");
  });

  it("con un secreto incorrecto responde 401", async () => {
    const respuesta = await rutaKeepAlive.GET(pedir("Bearer no-es-el-secreto"));

    expect(respuesta.status).toBe(401);
  });

  it("con un secreto del mismo largo pero distinto responde 401", async () => {
    // Cubre la comparacion en tiempo constante: `timingSafeEqual` exige el mismo largo, y
    // este es el caso donde de verdad tiene que comparar byte a byte.
    const mismoLargo = "0".repeat(SECRETO.length);
    const respuesta = await rutaKeepAlive.GET(pedir(`Bearer ${mismoLargo}`));

    expect(respuesta.status).toBe(401);
  });

  it("ignora un encabezado que no es Bearer", async () => {
    const respuesta = await rutaKeepAlive.GET(pedir(SECRETO));

    expect(respuesta.status).toBe(401);
  });

  it("expone GET y nada mas", async () => {
    // Vercel Cron dispara con GET. Next contesta 405 solo a cualquier metodo que la ruta
    // no exporte, asi que la propiedad a verificar es que no exista ningun otro handler.
    expect(typeof rutaKeepAlive.GET).toBe("function");

    for (const metodo of ["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
      expect(
        (rutaKeepAlive as Record<string, unknown>)[metodo],
        `la ruta no deberia exportar ${metodo}`,
      ).toBeUndefined();
    }
  });
});
