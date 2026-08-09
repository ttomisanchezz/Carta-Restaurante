/**
 * Health check.
 *
 * NO importa `src/lib/env.ts` a proposito: tiene que responder aunque el entorno
 * este a medias. Un health check que depende de la configuracion no sirve para
 * diagnosticar un problema de configuracion.
 *
 * La rama `?deep=1`, que si pinguea la base, llega en el paso 3.
 */
export function GET() {
  return Response.json({ ok: true, service: "carta" }, { status: 200 });
}
