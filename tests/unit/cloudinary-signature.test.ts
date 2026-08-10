import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { firmarParametros } from "@/lib/video/cloudinary-provider";

/**
 * La firma de subida.
 *
 * El test calcula el SHA-1 **por su cuenta**, sin reusar la funcion que prueba. Si
 * comparara contra una cadena que produjo la misma implementacion, solo estaria afirmando
 * que la funcion es determinista — que no es lo que hay que saber. Lo que hay que saber es
 * que produce el hash que el servidor de Cloudinary va a esperar.
 */

const SECRETO = "un-secreto-de-prueba-que-no-existe";

/** El algoritmo escrito de nuevo, a mano, tal como lo documenta Cloudinary. */
function firmaEsperada(parametros: Record<string, string | number>, secreto: string): string {
  const partes: string[] = [];
  for (const clave of Object.keys(parametros).sort()) {
    partes.push(`${clave}=${parametros[clave]}`);
  }
  return createHash("sha1")
    .update(partes.join("&") + secreto)
    .digest("hex");
}

describe("firmarParametros", () => {
  it("produce el mismo SHA-1 que un calculo independiente", () => {
    const parametros = {
      folder: "carta/dev",
      public_id: "ojo-de-bife",
      timestamp: 1735689600,
    };

    expect(firmarParametros(parametros, SECRETO)).toBe(firmaEsperada(parametros, SECRETO));
  });

  it("devuelve 40 caracteres hexadecimales", () => {
    const firma = firmarParametros({ timestamp: 1 }, SECRETO);

    expect(firma).toMatch(/^[0-9a-f]{40}$/);
  });

  it("no depende del orden en que se escriban los parametros", () => {
    // Cloudinary ordena alfabeticamente antes de firmar. Si nuestra implementacion
    // dependiera del orden del objeto, la firma fallaria de forma intermitente segun como
    // se armara el objeto en cada llamada.
    const a = firmarParametros({ folder: "x", public_id: "y", timestamp: 3 }, SECRETO);
    const b = firmarParametros({ timestamp: 3, public_id: "y", folder: "x" }, SECRETO);

    expect(a).toBe(b);
  });

  it("cambia si cambia cualquier parametro", () => {
    const base = { folder: "carta/dev", public_id: "provoleta", timestamp: 100 };

    expect(firmarParametros(base, SECRETO)).not.toBe(
      firmarParametros({ ...base, timestamp: 101 }, SECRETO),
    );
    expect(firmarParametros(base, SECRETO)).not.toBe(
      firmarParametros({ ...base, public_id: "otro" }, SECRETO),
    );
  });

  it("cambia si cambia el secreto", () => {
    const base = { timestamp: 100 };

    expect(firmarParametros(base, SECRETO)).not.toBe(firmarParametros(base, `${SECRETO}x`));
  });

  it("no devuelve el secreto en ningun lado", () => {
    // La firma es un hash: el secreto entra y no sale. Si alguna vez alguien reemplaza
    // esto por una concatenacion, este test lo agarra.
    const firma = firmarParametros({ folder: "carta/dev", timestamp: 1 }, SECRETO);

    expect(firma).not.toContain(SECRETO);
    expect(firma).not.toContain("secreto");
  });
});
