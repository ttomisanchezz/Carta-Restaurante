// setupFiles de vitest. Corre una vez por archivo de test, antes de los tests.
//
// El entorno ya fue cargado por vitest.config.ts (process.loadEnvFile). Lo unico
// que hace este archivo es fallar TEMPRANO y CON NOMBRE si falta algo, en vez de
// dejar que el primer test muera con "fetch failed" o "Invalid API key".

const REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

const missing = REQUIRED.filter((key) => {
  const value = process.env[key];
  return value === undefined || value.trim() === "";
});

if (missing.length > 0) {
  throw new Error(
    [
      `Faltan variables de entorno para los tests: ${missing.join(", ")}.`,
      "",
      "Este proyecto NO usa un stack local: la base es el proyecto de Supabase",
      "enlazado. Las variables se completan a mano, una sola vez:",
      "  cp .env.example .env.local",
      "  y despues llenar los valores desde https://supabase.com/dashboard",
      "",
      "Si ya lo hiciste, revisá que .env.local exista en la raiz del proyecto.",
    ].join("\n"),
  );
}

// Guardarraíl de seguridad. Los tests de integracion CREAN Y BORRAN filas, y corren
// contra una base real en la nube — no hay stack local que haga de red.
//
// El riesgo concreto que esto cubre: el dia que exista un proyecto aparte para un
// restaurante que paga, alguien copia esas credenciales a .env.local y corre `pnpm test`.
// Por eso no alcanza con un "si, dale" generico: hay que nombrar el proyecto.
// TEST_DB_PROJECT_REF tiene que coincidir con el ref de la URL. Credenciales de otro
// proyecto no coinciden, y la suite se niega a arrancar en vez de borrar datos de un cliente.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const refFromUrl = /https:\/\/([a-z0-9]+)\.supabase\.co/.exec(url)?.[1] ?? "";
const confirmed = process.env.TEST_DB_PROJECT_REF ?? "";

if (refFromUrl === "" || confirmed === "" || refFromUrl !== confirmed) {
  throw new Error(
    [
      "Me niego a correr tests de integracion contra esta base.",
      "",
      `  NEXT_PUBLIC_SUPABASE_URL apunta al proyecto : ${refFromUrl || "(no pude leer el ref)"}`,
      `  TEST_DB_PROJECT_REF dice que el permitido es: ${confirmed || "(vacio)"}`,
      "",
      "Los tests crean y borran filas. Para habilitarlos, poné en .env.local:",
      `  TEST_DB_PROJECT_REF=${refFromUrl || "<el-ref-de-tu-proyecto-de-desarrollo>"}`,
      "",
      "Nunca pongas ahi el ref de un proyecto con datos de un cliente real.",
    ].join("\n"),
  );
}
