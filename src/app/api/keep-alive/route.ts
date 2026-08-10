import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { loadServerEnv } from "@/lib/env";

/**
 * Tarea anti-pausa del proyecto gratis de Supabase.
 *
 * Un proyecto gratis se pausa por inactividad, y un proyecto pausado significa que el QR
 * de la mesa no abre nada. Esta ruta hace una consulta minima una vez por dia para que la
 * base cuente como activa. La dispara Vercel Cron, que llama con **GET**.
 *
 * Solo se exporta GET. Next contesta 405 solo a cualquier otro metodo — no hace falta
 * escribirlo, y escribir un POST que devuelva 405 seria darle a alguien una superficie mas
 * donde probar.
 */

// Nunca cacheada: una respuesta servida de cache no toca la base, que es justamente lo
// unico que esta ruta existe para hacer.
export const dynamic = "force-dynamic";

/**
 * Comparacion en tiempo constante.
 *
 * Un `===` sobre un secreto sale antes en el primer caracter distinto, y esa diferencia de
 * microsegundos, repetida, deja adivinar el valor byte por byte. Acá cuesta tres lineas.
 */
function igualSeguro(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  // `timingSafeEqual` exige el mismo largo, y comparar los largos antes ya filtra: eso no
  // es una fuga util, porque el largo del secreto no es lo que se esta protegiendo.
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export async function GET(request: Request): Promise<Response> {
  const env = loadServerEnv();
  const esperado = env.CRON_SECRET;

  const encabezado = request.headers.get("authorization") ?? "";
  const recibido = encabezado.startsWith("Bearer ") ? encabezado.slice("Bearer ".length) : "";

  // Falla cerrada si la variable no esta configurada: sin secreto no hay forma de saber
  // quien llama, y dejar pasar seria peor que no tener la tarea.
  if (!esperado || recibido === "" || !igualSeguro(recibido, esperado)) {
    // Se contesta ANTES de tocar la base. Si la consulta fuera primero, cualquiera en
    // internet podria hacernos consultar Postgres a voluntad.
    return Response.json(
      { error: { code: "unauthorized", message: "No autorizado." } },
      { status: 401 },
    );
  }

  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // La consulta mas barata que igual cuenta como actividad: sin filas, solo el conteo.
  const { error } = await db.from("restaurants").select("id", { head: true, count: "exact" });

  if (error) {
    return Response.json(
      { error: { code: "internal_error", message: "La base no respondió." } },
      { status: 503 },
    );
  }

  return Response.json({ data: { ok: true, at: new Date().toISOString() } });
}
