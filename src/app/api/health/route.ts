import { createClient } from "@supabase/supabase-js";

/**
 * Health check.
 *
 * Sin `?deep=1` NO importa `src/lib/env.ts` ni toca la base: tiene que responder
 * aunque el entorno este a medias. Un health check que depende de la configuracion
 * no sirve para diagnosticar un problema de configuracion — y ademas es el gate del
 * paso 1, que corre antes de que exista una base.
 *
 * Con `?deep=1` pinguea Postgres con el cliente ANONIMO, o sea por el mismo camino
 * que usa la carta publica, policies de RLS incluidas.
 */
export async function GET(request: Request) {
  const deep = new URL(request.url).searchParams.get("deep") === "1";

  if (!deep) {
    return Response.json({ ok: true, service: "carta" }, { status: 200 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return Response.json(
      { ok: false, service: "carta", db: "down", reason: "faltan credenciales" },
      { status: 503 },
    );
  }

  try {
    const db = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await db.from("restaurants").select("id", { head: true, count: "exact" });

    if (error) {
      return Response.json(
        { ok: false, service: "carta", db: "down", reason: error.code ?? "error" },
        { status: 503 },
      );
    }

    return Response.json({ ok: true, service: "carta", db: "up" }, { status: 200 });
  } catch {
    return Response.json(
      { ok: false, service: "carta", db: "down", reason: "excepcion" },
      { status: 503 },
    );
  }
}
