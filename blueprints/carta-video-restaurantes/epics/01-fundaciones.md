# Epica 01: Fundaciones

> Despues de esta epica existe un proyecto que arranca de verdad, un sistema visual, un esquema con
> RLS probado contra fugas entre restaurantes, y la demo de ventas BRASA cargada.

| | |
|---|---|
| **Epic id** | `01-fundaciones` |
| **Tareas** | `E1-T1` … `E1-T6` |
| **Depende de** | nada — se arranca aca |
| **Desbloquea** | `02-carta-publica`, `03-panel-y-lanzamiento` |
| **En paralelo con** | ninguna |

No hace falta ningun otro archivo para completar esta epica. Todo lo de abajo esta repetido aca a
proposito.

---

## Stack

Next.js 16 (App Router, Server Components) · TypeScript estricto · Tailwind v4 (config en CSS) ·
Supabase (Postgres + Auth + RLS) via `@supabase/supabase-js`, **sin ORM** · Cloudinary detras de una
abstraccion propia · Vercel. Gestor de paquetes: `pnpm`. Node fijado en `.nvmrc` (24). Las versiones
de dependencias estan en `pnpm-lock.yaml` — leelo, nunca adivines una.

| Tarea | Comando |
|---|---|
| Dev | `pnpm dev` |
| Typecheck | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Test (un archivo) | `pnpm test tests/unit/env.test.ts` |
| E2E (un archivo) | `pnpm test:e2e tests/e2e/shell.spec.ts` |
| Build | `pnpm build` |
| Humo HTTP | `bash scripts/smoke-http.sh /api/health 200` |
| Migraciones + seed | `pnpm db:push` (no destructivo, idempotente) |
| Tipos de la base | `pnpm db:types` |
| Asegurar usuario admin | `pnpm db:admin` |

**Gate:** `pnpm typecheck && pnpm lint && pnpm test` pasa antes de marcar cualquier tarea como hecha.

**No hay servicios locales que arrancar: la base es el proyecto de Supabase enlazado.** Antes de la
primera tarea que toque datos, `.env.local` tiene que existir y estar completo (§10 Bootstrap paso 8
lo verifica y falla con instrucciones si falta). `pnpm db:push` deja esquema y seed al dia. Nunca
sustituyas por un doble un servicio que los criterios nombran.

## Subarbol de directorios

```
src/
  app/
    layout.tsx                      # NUEVO en E1-T2 — lang="es", tema oscuro, Inter, skip link
    globals.css                     # EDITAS en E1-T2 — @theme con todos los tokens
    api/health/route.ts             # NUEVO en E1-T1, EDITAS en E1-T3 (rama ?deep=1)
  components/ui/brand-scope.tsx     # NUEVO en E1-T2 — valida el hex e inyecta --color-brand
  lib/
    env.ts                          # NUEVO en E1-T1 — esquema zod de process.env
    supabase/database.types.ts      # GENERADO en E1-T6 por `pnpm db:types`
scripts/
  smoke-http.sh                     # NUEVO en E1-T1 — arranca el build, verifica, lo baja
  create-admin.ts                   # NUEVO en E1-T6 — usuario admin local, idempotente
supabase/
  migrations/                       # NUEVO en E1-T3 y E1-T4 — los nombres los pone la CLI
  seed.sql                          # NUEVO en E1-T6 — la demo BRASA
public/seed/                        # NUEVO en E1-T6 — 12 posters SVG
tests/
  setup.ts                          # existe, llego en workspace/ — no lo toques
  helpers/supabase-clients.ts       # NUEVO en E1-T3
  helpers/seed-two-restaurants.ts   # NUEVO en E1-T5
  unit/env.test.ts                  # NUEVO en E1-T1
  unit/brand-color.test.ts          # NUEVO en E1-T2
  integration/schema.test.ts        # NUEVO en E1-T3
  integration/rls-enabled.test.ts   # NUEVO en E1-T4
  integration/isolation-read.test.ts   # NUEVO en E1-T5
  integration/isolation-write.test.ts  # NUEVO en E1-T5
  integration/seed.test.ts          # NUEVO en E1-T6
  e2e/shell.spec.ts                 # NUEVO en E1-T2
```

Todo lo que este fuera de este subarbol esta fuera de alcance. Si una tarea parece requerir editar un
archivo que no esta listado, frena y reporta: significa que la frontera de la epica esta mal.

## Modelo de datos que se toca aca

| Entidad | Campos | Notas |
|---|---|---|
| `restaurants` | `id`, `slug` unico, `name`, `logo_url`, `primary_color`, `currency`, `plan`, `is_active`, `created_at`, `updated_at` | `slug` es la URL publica. `primary_color` con `check (primary_color ~ '^#[0-9A-Fa-f]{6}$')`. `plan in ('basico','pedidos')` |
| `categories` | `id`, `restaurant_id` FK cascade, `name`, `sort_order`, timestamps | Indice `(restaurant_id, sort_order)` |
| `dishes` | `id`, `restaurant_id` FK cascade, `category_id` FK **restrict**, `name`, `description`, `price` int centavos, `pairing_text`, `video_playback_id`, `video_status`, `thumbnail_url`, `is_available`, `sort_order`, timestamps | `restaurant_id` desnormalizado a proposito. `video_status in ('pending','processing','ready','failed')` |
| `profiles` | `id` FK a `auth.users`, `restaurant_id` nullable, `role`, timestamps | `role in ('owner','staff','superadmin')` |

Funciones de apoyo de RLS, ambas `security definer`: `public.current_restaurant_id()` y
`public.is_superadmin()`. Funcion de diagnostico solo para `service_role`: `public.rls_status()`.

## Contratos

**Consumidos** — ya existen, no los rehagas:

| De | Interfaz | Garantia |
|---|---|---|
| `workspace/` | `vitest.config.ts` | Alias `@` → `src/`, carga `.env.local`, excluye `blueprints/`, `fileParallelism: false` |
| `workspace/` | `playwright.config.ts` | `baseURL` en `http://127.0.0.1:3101`, proyectos `mobile`, `desktop`, `slow-4g`, `webServer` que hace build y arranca |
| `workspace/` | `tests/setup.ts` | Falla con nombre si faltan `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` o `TEST_DB_PROJECT_REF`. **Corre antes de TODO `pnpm test`, incluso los unitarios** |

**Producidos** — las epicas siguientes dependen de estas firmas exactas:

| Export | Firma | Lo usa |
|---|---|---|
| `src/lib/env.ts` → `loadServerEnv` | `(source?: NodeJS.ProcessEnv) => ServerEnv` | `02-carta-publica`, `03-panel-y-lanzamiento` |
| `src/components/ui/brand-scope.tsx` → `parseBrandColor` | `(input: unknown) => string` | `02-carta-publica` |
| `src/lib/supabase/database.types.ts` → `Database` | tipo generado | ambas epicas |
| `tests/helpers/supabase-clients.ts` → `anonClient`, `serviceClient`, `authedClient` | `() => SupabaseClient` · `(email: string, password: string) => Promise<SupabaseClient>` | ambas epicas |
| `scripts/smoke-http.sh` | `bash scripts/smoke-http.sh <ruta> <estado> [...]` | ambas epicas y el gate global |

## Convenciones que muerden en esta area

- **El nombre del archivo de migracion lo elige la CLI** (lleva timestamp). Leelo de la salida de
  `pnpm exec supabase migration new <nombre>`; no lo inventes ni lo escribas en ningun lado.
- **`tests/**` nunca importa `src/lib/supabase/server.ts`**: ese modulo usa `next/headers` y no hay
  contexto de request fuera de Next. Los clientes de test se construyen con `createClient`.
- **`scripts/**` no usa el alias `@/`**: Node no lee `paths` de `tsconfig.json`. Rutas relativas con
  extension explicita (`./x.ts`).
- **Ningun numero magico derivado del blueprint en un test.** No afirmes "hay 4 tablas": afirmá que
  cada entidad del modelo existe. La unica excepcion son los conteos de la demo BRASA (4 categorias,
  12 platos), que son el contrato del propio seed.
- **Ningun literal producido por el runtime.** Mensajes de Postgres o de zod cambian entre versiones:
  afirmá conteos de filas, presencia de error y propiedades.
- Un comando cuyo exito es un exit distinto de 0 se envuelve: `cmd; test $? -eq 1`. Nunca un `!` suelto.
- Biome ya esta configurado con `css.parser.tailwindDirectives: true`: sin esa clave, `biome check`
  muere parseando el `@theme` que genero el propio scaffolder.

Reglas completas del proyecto: `CLAUDE.md`. Reglas del area: `.claude/rules/base-de-datos-y-rls.md`,
`.claude/rules/estilos-y-tokens.md`, `.claude/rules/tests.md`. Los tres estan en la raiz del
proyecto: el builder los copio desde `workspace/` antes de la tarea uno.

---

## Tareas

Listadas en el mismo orden que `tasks.json`. Ese orden es el orden de construccion: se trabaja de
arriba hacia abajo y no se reordena por prioridad ni por lo que parezca rapido.

### `E1-T1` — Andamiaje, validacion de entorno y health check ejecutable

**Depende de:** nada · **Prioridad:** p0 — metadato para recortes de alcance, no un orden de trabajo

El andamiaje ya lo hizo el Bootstrap del blueprint (proyecto creado, dependencias fijadas,
`workspace/` copiado, scripts de `package.json` agregados, proyecto de Supabase enlazado). Esta tarea escribe
el primer codigo propio y **prueba que el artefacto construido realmente arranca** — compilar prueba
que el compilador estuvo contento, arrancar prueba que el binario aterrizo donde el manifiesto dice.
`src/lib/env.ts` expone un esquema zod y una funcion `loadServerEnv` **perezosa**: no se ejecuta al
importar, asi que ningun build explota por una variable que todavia no hace falta. Las variables de
Cloudinary entran como opcionales y recien se vuelven obligatorias en `E3-T4`.

**Archivos**
- `src/lib/env.ts` — nuevo: `serverEnvSchema` y `loadServerEnv(source = process.env)`
- `src/app/api/health/route.ts` — nuevo: `GET` que devuelve `{"ok":true,"service":"carta"}` con 200. No importa `env.ts`
- `scripts/smoke-http.sh` — nuevo: arranca el build en el puerto 3100, espera `/api/health`, verifica que el cuerpo contenga `"ok":true`, recorre los pares `RUTA ESTADO` que reciba, baja el servidor
- `tests/unit/env.test.ts` — nuevo: parsea objetos fijos contra el esquema, sin tocar `process.env`

**Aceptacion**

Copiado literal del arreglo `acceptance` de esta tarea en `tasks.json`. Cada criterio lo decide un
comando de abajo, en esta maquina, durante el build.

1. **WHEN** `pnpm install --frozen-lockfile` corre **THE SYSTEM SHALL** salir con 0 sin modificar `pnpm-lock.yaml`.
2. **WHEN** `pnpm lint` corre sobre el arbol completo con el bundle presente en `blueprints/` **THE SYSTEM SHALL** salir con 0 sin errores ni advertencias.
3. **WHEN** `serverEnvSchema` parsea un objeto sin `NEXT_PUBLIC_SUPABASE_URL` **THE SYSTEM SHALL** fallar el parseo y nombrar esa variable en el resultado.
4. **WHEN** `serverEnvSchema` parsea un objeto con las tres variables de Supabase y ninguna de Cloudinary **THE SYSTEM SHALL** parsear con exito y devolver `VIDEO_PROVIDER` igual a `direct`.
5. **WHEN** se hace `GET /api/health` contra el servidor de produccion recien construido **THE SYSTEM SHALL** responder 200 con un cuerpo que contiene `"ok":true`.
6. **WHEN** se hace `GET /ruta-que-no-existe` contra ese mismo servidor **THE SYSTEM SHALL** responder 404.

**Verify** — todos los comandos, en orden, desde la raiz del proyecto. Cada uno sale con 0 cuando la
tarea esta bien; que el ultimo salga con 0 es lo que la da por hecha.

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test tests/unit/env.test.ts
pnpm build
bash scripts/smoke-http.sh /api/health 200 /ruta-que-no-existe 404
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T1: andamiaje, entorno y health check"
git tag step-01-scaffold
```

### `E1-T2` — Tokens de diseno, shell y color de marca validado

**Depende de:** `E1-T1` · **Prioridad:** p0

Escribi el sistema visual una sola vez, en `@theme`, y hace que el color por restaurante entre por
una puerta segura. **Tema oscuro unico: no hay clase `dark:`, no hay toggle, no hay media query de
esquema de color.** Paleta literal: fondo `#0A0A0B`, superficie `#131316`, borde `#1E1E23`, borde
fuerte `#6A6A75`, texto `#EAEAEC`, texto atenuado `#8B8B95`, marca `#E8562A`, texto sobre marca
`#0A0A0B`, error `#FF5C5C`, exito `#3FD08A`. Escala de espaciado base 4px (4, 8, 12, 16, 24, 32, 48,
64), radios 8/12/999px, Inter en 400/600/700. El riesgo real de esta tarea es el color de marca: viene
de la base y termina en un atributo `style`, asi que **se valida con zod como hex de 6 digitos antes
de tocar el DOM** y si no valida se usa `#E8562A`.

**Archivos**
- `src/app/globals.css` — editar: `@import "tailwindcss";` mas `@theme` con todos los tokens, el bloque `prefers-reduced-motion` y el foco visible global (`outline: 2px solid var(--color-brand); outline-offset: 2px`)
- `src/app/layout.tsx` — editar: `<html lang="es">` con el tema ya en el HTML del servidor, Inter por `next/font/google` (`subsets: ["latin"]`, `weight: ["400","600","700"]`, `display: "swap"`), enlace "Saltar al contenido" como primer elemento enfocable, `<main id="contenido">`
- `src/components/ui/brand-scope.tsx` — nuevo: Server Component + `parseBrandColor(input: unknown): string`
- `tests/unit/brand-color.test.ts` — nuevo
- `tests/e2e/shell.spec.ts` — nuevo

**Aceptacion**

1. **WHEN** `parseBrandColor("#E8562A")` se ejecuta **THE SYSTEM SHALL** devolver exactamente `#E8562A`.
2. **WHEN** `parseBrandColor` recibe `"red; background: url(javascript:alert(1))"` **THE SYSTEM SHALL** devolver exactamente `#E8562A` y no propagar ningun caracter de la entrada.
3. **WHEN** `parseBrandColor` recibe `"#E8562"`, `"E8562A"`, `null` o `undefined` **THE SYSTEM SHALL** devolver exactamente `#E8562A` en los cuatro casos.
4. **WHEN** la pagina raiz se carga a 375px de ancho **THE SYSTEM SHALL** cumplir `document.documentElement.scrollWidth === document.documentElement.clientWidth`.
5. **WHEN** la pagina raiz se carga a 1440px de ancho **THE SYSTEM SHALL** cumplir la misma igualdad.
6. **WHEN** se presiona Tab una vez sobre la pagina recien cargada **THE SYSTEM SHALL** enfocar el enlace "Saltar al contenido" y hacerlo visible.

**Verify**

```bash
pnpm test tests/unit/brand-color.test.ts
pnpm lint
pnpm typecheck
pnpm test:e2e tests/e2e/shell.spec.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T2: tokens de diseno, shell y color de marca validado"
git tag step-02-tokens-shell
```

### `E1-T3` — Esquema y primera migracion

**Depende de:** `E1-T1` · **Prioridad:** p0

Crea el archivo con `pnpm exec supabase migration new schema_inicial` y **leé de la salida el nombre
que eligio la CLI**. Adentro va el esquema completo: `create extension if not exists pgcrypto`, la
funcion `set_updated_at`, las cuatro tablas con todas sus constraints, los cinco indices, los cuatro
triggers y `notify pgrst, 'reload schema';` al final. `tests/helpers/supabase-clients.ts` es la unica
puerta de los tests hacia la base: `anonClient()`, `serviceClient()` y `authedClient(email, password)`,
todos construidos con `createClient` de `@supabase/supabase-js`. El test de esquema afirma
**propiedades por entidad**, nunca un conteo de tablas. La rama `?deep=1` del health se agrega aca;
sin ese parametro el endpoint sigue devolviendo 200 mientras el proceso viva, para no romper el gate
de `E1-T1`.

**Archivos**
- `supabase/migrations/**` — nuevo: el archivo que crea `pnpm exec supabase migration new schema_inicial`
- `tests/helpers/supabase-clients.ts` — nuevo
- `tests/integration/schema.test.ts` — nuevo
- `src/app/api/health/route.ts` — editar: rama `?deep=1` que pinguea la base y agrega `"db":"up"`, o 503 si no responde

**Aceptacion**

1. **WHEN** `pnpm db:push` corre contra el proyecto de Supabase enlazado **THE SYSTEM SHALL** salir con 0 y aplicar todas las migraciones.
2. **WHEN** el test consulta cada una de las cuatro entidades del modelo (`restaurants`, `categories`, `dishes`, `profiles`) **THE SYSTEM SHALL** responder sin error en las cuatro.
3. **WHEN** se inserta un plato con `price` igual a `1350000` y se lo vuelve a leer **THE SYSTEM SHALL** devolver exactamente `1350000` como entero.
4. **WHEN** se inserta un restaurante con `primary_color` igual a `"rojo"` **THE SYSTEM SHALL** rechazar la escritura y dejar la cantidad de filas de `restaurants` sin cambios.
5. **WHEN** se intenta borrar una categoria que tiene al menos un plato **THE SYSTEM SHALL** rechazar el borrado y dejar la categoria y sus platos en la base.
6. **WHEN** se hace `GET /api/health?deep=1` con la base arriba **THE SYSTEM SHALL** responder 200 con un cuerpo que contiene `"db":"up"`.

**Verify**

```bash
pnpm db:push
pnpm test tests/integration/schema.test.ts
pnpm typecheck
pnpm build
bash scripts/smoke-http.sh /api/health 200 "/api/health?deep=1" 200
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T3: esquema y primera migracion"
git tag step-03-schema
```

### `E1-T4` — Policies de RLS sobre las cuatro tablas

**Depende de:** `E1-T3` · **Prioridad:** p0

Crea el archivo con `pnpm exec supabase migration new rls_policies`. Adentro: los cuatro
`enable row level security`, las funciones `public.current_restaurant_id()` y `public.is_superadmin()`
—**ambas `security definer`**, porque una policy sobre `profiles` que consultara `profiles` seria
recursion infinita— con sus `grant execute ... to anon, authenticated`, las policies de las cuatro
tablas **cada una con `using` y `with check`** (sin `with check`, un `update` puede mover una fila a
otro restaurante), la funcion de diagnostico `public.rls_status()` con `revoke all ... from public,
anon, authenticated` y `grant execute ... to service_role`, y `notify pgrst, 'reload schema';`.

La lectura anonima de `dishes` exige ademas `is_available` y `video_status = 'ready'`: la regla de que
un plato sin video listo no aparece en la carta la hace cumplir la base, no la consulta.

**Archivos**
- `supabase/migrations/**` — nuevo: el archivo que crea `pnpm exec supabase migration new rls_policies`
- `tests/integration/rls-enabled.test.ts` — nuevo

**Aceptacion**

1. **WHEN** `pnpm db:push` corre **THE SYSTEM SHALL** salir con 0 aplicando tambien la migracion de policies.
2. **WHEN** el cliente de servicio llama `rls_status()` **THE SYSTEM SHALL** devolver una fila con `rls_enabled` en `true` para cada una de las cuatro entidades del modelo.
3. **WHEN** el cliente de servicio llama `rls_status()` **THE SYSTEM SHALL** devolver `policy_count` mayor o igual a 1 para cada una de esas cuatro entidades.
4. **WHEN** el cliente anonimo llama `rls_status()` **THE SYSTEM SHALL** devolver un error y ningun dato.
5. **WHEN** el cliente anonimo lee `profiles` **THE SYSTEM SHALL** devolver cero filas.

**Verify**

```bash
pnpm db:push
pnpm test tests/integration/rls-enabled.test.ts
pnpm test tests/integration/schema.test.ts
pnpm typecheck
pnpm lint
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T4: policies de RLS"
git tag step-04-rls
```

### `E1-T5` — Tests de aislamiento entre restaurantes

**Depende de:** `E1-T4` · **Prioridad:** p0

Esta tarea no agrega ninguna feature: agrega la prueba de que el aislamiento existe. Va **antes** de
cualquier CRUD a proposito — una fuga descubierta en `E3-T3` obliga a reescribir cada consulta. La
fabrica crea dos restaurantes independientes con su categoria, su plato `ready` y su usuario `owner`
con fila en `profiles`, y devuelve un `cleanup()`. **No toca los datos de BRASA**, que son la demo de
ventas. Cada afirmacion negativa se confirma dos veces: la respuesta del cliente de A y ademas el
estado real de la fila leido con el cliente de servicio — un `update` que RLS filtra devuelve exito
con cero filas afectadas, asi que la lectura posterior es lo que prueba que no paso nada.

**Archivos**
- `tests/helpers/seed-two-restaurants.ts` — nuevo: fabrica con `cleanup()`
- `tests/integration/isolation-read.test.ts` — nuevo
- `tests/integration/isolation-write.test.ts` — nuevo

**Aceptacion**

1. **WHEN** el owner del restaurante A lista `dishes` **THE SYSTEM SHALL** devolver unicamente filas cuyo `restaurant_id` sea el de A.
2. **WHEN** el owner de A pide por id un plato del restaurante B **THE SYSTEM SHALL** devolver cero filas, no un error 403.
3. **WHEN** el owner de A hace `update` sobre un plato de B **THE SYSTEM SHALL** dejar ese plato con exactamente los mismos valores leidos despues con el cliente de servicio.
4. **WHEN** el owner de A hace `delete` sobre una categoria de B **THE SYSTEM SHALL** dejar esa categoria existiendo en la base.
5. **WHEN** el owner de A inserta un plato con `restaurant_id` igual al de B **THE SYSTEM SHALL** devolver error y no crear ninguna fila con ese `restaurant_id`.
6. **WHEN** el cliente anonimo lista `dishes` de un restaurante con `is_active` en `false` **THE SYSTEM SHALL** devolver cero filas.

**Verify**

```bash
pnpm test tests/integration/isolation-read.test.ts
pnpm test tests/integration/isolation-write.test.ts
pnpm test tests/integration
pnpm typecheck
pnpm lint
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T5: tests de aislamiento entre restaurantes"
git tag step-05-isolation
```

### `E1-T6` — Tipos generados y seed BRASA (la demo de ventas)

**Depende de:** `E1-T4` · **Prioridad:** p0

**Esta tarea produce la pantalla que se le muestra a un restaurante candidato para venderle la
suscripcion.** Un plato con descripcion floja o sin poster no es un dato de prueba: es una reunion
perdida. Restaurante **BRASA** (parrilla moderna, `slug: brasa`, `currency: ARS`,
`primary_color: #E8562A`, `plan: basico`, `is_active: true`, id `b0000000-0000-4000-8000-000000000001`),
4 categorias (`Para empezar`, `De la parrilla`, `Guarniciones`, `Postres`, ids
`c0000000-0000-4000-8000-00000000000{1..4}`) y 12 platos (ids
`d0000000-0000-4000-8000-0000000000{01..12}`). Los ids son fijos porque hay tests que los referencian.

**Elegí los platos por una sola regla: comida que gana con el movimiento y pierde en una foto** —
provoleta burbujeando, ojo de bife abriendose bajo el cuchillo, humo saliendo de la parrilla. El seed
tiene que demostrar el argumento del propio producto. Precios reales de Buenos Aires, **enteros en
centavos** (`$13.500,00` se escribe `1350000`). `pairing_text` en primera persona y en rioplatense en
los 12. `thumbnail_url` igual a `/seed/<slug-del-plato>.svg`, `video_playback_id` igual a
`seed/<slug-del-plato>`, `video_status` en `'ready'`.

Los posters son SVG y no fotos a proposito: se escriben como texto, pesan poco y funcionan sin red,
que es de lo que dependen el test de la grilla y el de presupuesto de bytes. El usuario admin **no**
lo crea `seed.sql`: lo crea `scripts/create-admin.ts` con `supabase.auth.admin.createUser()`, porque
insertar a mano en `auth.users` depende de columnas que cambian entre versiones de Supabase.

**Archivos**
- `supabase/seed.sql` — nuevo: BRASA, 4 categorias, 12 platos
- `scripts/create-admin.ts` — nuevo: idempotente, rutas relativas con `.ts`, nunca `@/`
- `public/seed/**` — nuevo: un SVG 4:5 por plato (`viewBox="0 0 480 600"`), degrade `#131316` → `#0A0A0B`, nombre en Inter 600, barra `#E8562A`
- `src/lib/supabase/database.types.ts` — generado por `pnpm db:types`, se commitea, nunca se edita a mano
- `tests/integration/seed.test.ts` — nuevo

**Aceptacion**

1. **WHEN** `pnpm db:push` corre **THE SYSTEM SHALL** dejar exactamente un restaurante con `slug` igual a `brasa`, con `is_active` en `true` y `primary_color` igual a `#E8562A`.
2. **WHEN** el test lista las categorias de BRASA **THE SYSTEM SHALL** devolver 4 filas con `sort_order` distintos entre si.
3. **WHEN** el test lista los platos de BRASA **THE SYSTEM SHALL** devolver 12 filas, todas con `video_status` igual a `ready` y `price` mayor que 0.
4. **WHEN** el test recorre los 12 platos de BRASA **THE SYSTEM SHALL** encontrar en cada uno un `pairing_text` no nulo de mas de 20 caracteres y un `thumbnail_url` que empieza con `/seed/`.
5. **WHEN** el test resuelve cada `thumbnail_url` de BRASA contra el directorio `public/` **THE SYSTEM SHALL** encontrar el archivo SVG correspondiente en disco.
6. **WHEN** `pnpm db:admin` corre dos veces seguidas **THE SYSTEM SHALL** salir con 0 las dos veces y dejar exactamente una fila en `profiles` con `role` igual a `superadmin`.

**Verify**

```bash
pnpm db:push
pnpm db:admin
pnpm db:admin
pnpm db:types
pnpm test tests/integration/seed.test.ts
pnpm typecheck
```

**Checkpoint**

```bash
git add -A && git commit -m "E1-T6: tipos generados y seed BRASA"
git tag step-06-types-seed
```

---

## Aceptacion de la epica

La epica esta hecha cuando cada tarea esta en `done` **y**:

1. **WHEN** se corre el gate completo sobre un arbol recien reseteado **THE SYSTEM SHALL** salir con 0 en typecheck, lint y la suite entera de unit e integracion.
2. **WHEN** un cliente anonimo consulta cualquiera de las cuatro tablas de un restaurante con `is_active` en `false` **THE SYSTEM SHALL** devolver cero filas en las cuatro.

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm db:push && pnpm db:admin && pnpm test tests/integration
```

Desde la raiz del proyecto.

## Trampas

- **`middleware.ts` no existe en Next 16.** No lo crees en esta epica ni en ninguna: el archivo es
  `proxy.ts` y lo escribe `02-carta-publica`.
- **Biome 2.5.5 no parsea `@theme` sin `css.parser.tailwindDirectives`.** Ya esta puesto en el
  `biome.json` que llego en `workspace/`. Si `pnpm lint` muere con
  `Tailwind-specific syntax is disabled`, alguien piso ese archivo: restauralo, no desactives reglas.
- **`pnpm db:reset` es destructivo y NO se corre.** Recrea la base entera, incluido `auth.users`, y
  esta en el `deny` de `.claude/settings.json` justamente por eso. El comando de todos los dias es
  `pnpm db:push`, que es aditivo e idempotente.
- **No inventes el nombre de un archivo de migracion.** Lo elige la CLI y lleva timestamp.
- **La `SUPABASE_SERVICE_ROLE_KEY` saltea RLS.** Usarla en un test de aislamiento para "confirmar" una
  lectura es correcto; usarla como cliente bajo prueba invalida el test entero.
- **No agregues `jsdom` ni tests de componente.** La UI se cubre con Playwright; meter un entorno DOM
  suma una dependencia sin pin verificado.

## Antes de seguir

- [ ] Cada tarea de esta epica esta en `done` en `tasks.json` — ninguna quedo en `in_progress`.
- [ ] Cada comando `verify` de cada tarea paso, no solo el primero.
- [ ] Ningun comando `verify` fue editado, y ninguno se saltó porque un archivo que nombra no existia.
- [ ] Cada tarea tiene su tag de checkpoint en git — `git tag -l 'step-*'` lista `step-01-scaffold` … `step-06-types-seed`.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` pasa limpio desde la raiz del proyecto.
- [ ] Cada contrato "Producido" de arriba existe con la firma indicada.
- [ ] Ningun archivo fuera del subarbol fue modificado.
- [ ] `.env.example` sigue al dia: esta epica no agrego ninguna variable nueva.
- [ ] Un commit por tarea, cada uno prefijado con su id, cada uno seguido de su tag.
