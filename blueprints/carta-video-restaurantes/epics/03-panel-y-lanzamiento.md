# Epica 03: Panel y lanzamiento

> Despues de esta epica el dueno carga y mantiene todo el contenido solo —restaurantes, categorias,
> platos, orden y videos— y el proyecto tiene fronteras de error, presupuesto de performance,
> accesibilidad verificada, un pipeline de CI y la tarea que evita que el proyecto gratis de Supabase
> se pause y deje la demo de ventas caida.

| | |
|---|---|
| **Epic id** | `03-panel-y-lanzamiento` |
| **Tareas** | `E3-T1` … `E3-T6` |
| **Depende de** | `01-fundaciones`, `02-carta-publica` |
| **Desbloquea** | nada — es la ultima |
| **En paralelo con** | ninguna |

No hace falta ningun otro archivo para completar esta epica. Todo lo de abajo esta repetido aca a
proposito.

---

## Stack

Next.js 16 (App Router, Server Components y Server Actions) · TypeScript estricto · Tailwind v4
(config en CSS) · Supabase (Postgres + Auth + RLS) via `@supabase/supabase-js` y `@supabase/ssr`,
**sin ORM** · Cloudinary detras de `src/lib/video/provider.ts` · Vercel. Gestor de paquetes: `pnpm`.
Node fijado en `.nvmrc` (24). Las versiones estan en `pnpm-lock.yaml` — leelo, nunca adivines una.

| Tarea | Comando |
|---|---|
| Dev | `pnpm dev` |
| Typecheck | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Test (un archivo) | `pnpm test tests/integration/admin-dishes.test.ts` |
| E2E (un archivo) | `pnpm test:e2e tests/e2e/admin-dishes.spec.ts` |
| E2E completo | `pnpm test:e2e` |
| Build | `pnpm build` |
| Migraciones + seed | `pnpm db:push` seguido de `pnpm db:admin` |

**Gate:** `pnpm typecheck && pnpm lint && pnpm test` pasa antes de marcar cualquier tarea como hecha.

Todas las tareas de aca necesitan el esquema y el seed aplicados sobre el proyecto enlazado: `pnpm db:push`,
`pnpm db:admin`. **No hay Postgres local ni Docker.** Nunca sustituyas por un doble un servicio que
los criterios nombran.

## Subarbol de directorios

```
src/
  server/admin/restaurants.ts             # NUEVO en E3-T1 — validar, autorizar, escribir
  server/admin/categories.ts              # NUEVO en E3-T2
  server/admin/dishes.ts                  # NUEVO en E3-T3
  server/admin/video.ts                   # NUEVO en E3-T4 — markVideoReady / markVideoFailed
  app/admin/restaurantes/**               # NUEVO en E3-T1 — lista, formulario, actions
  app/admin/categorias/**                 # NUEVO en E3-T2
  app/admin/platos/**                     # NUEVO en E3-T3
  app/api/video/signature/route.ts        # NUEVO en E3-T4
  app/error.tsx                           # NUEVO en E3-T5 — frontera de error raiz
  app/[slug]/error.tsx                    # NUEVO en E3-T5 — frontera de error de la carta
  components/admin/video-uploader.tsx     # NUEVO en E3-T4 — cliente, cola multi-archivo
tests/
  integration/admin-restaurants.test.ts   # NUEVO en E3-T1
  integration/admin-categories.test.ts    # NUEVO en E3-T2
  integration/admin-dishes.test.ts        # NUEVO en E3-T3
  unit/cloudinary-signature.test.ts       # NUEVO en E3-T4
  e2e/admin-restaurants.spec.ts           # NUEVO en E3-T1
  e2e/admin-categories.spec.ts            # NUEVO en E3-T2
  e2e/admin-dishes.spec.ts                # NUEVO en E3-T3
  e2e/video-signature.spec.ts             # NUEVO en E3-T4
  e2e/a11y.spec.ts                        # NUEVO en E3-T5
  e2e/perf-poster.spec.ts                 # NUEVO en E3-T5 — proyecto slow-4g
.github/workflows/ci.yml                  # NUEVO en E3-T5
```

Todo lo que este fuera de este subarbol esta fuera de alcance. Si una tarea parece requerir editar un
archivo no listado, frena y reporta.

## Modelo de datos que se toca aca

| Entidad | Campos que se escriben | Notas |
|---|---|---|
| `restaurants` | `slug`, `name`, `logo_url`, `primary_color`, `currency`, `plan`, `is_active` | Crear y borrar: solo `superadmin`. `slug` unico → conflicto 409 |
| `categories` | `name`, `sort_order` | Borrar con platos esta **bloqueado** por `on delete restrict` |
| `dishes` | `name`, `description`, `price` (int centavos), `pairing_text`, `category_id`, `is_available`, `sort_order`, `video_playback_id`, `video_status`, `thumbnail_url` | El duplicado nace con `video_status` en `pending` |
| `profiles` | solo lectura, para el guard | Escribe el dashboard de Supabase |

Las policies ya existen (`E1-T4`). **Esta epica no crea migraciones.** El `restaurant_id` de toda
escritura sale de `requireAdmin()`, nunca del formulario.

## Contratos

**Consumidos** — ya existen, no los rehagas:

| De | Interfaz | Garantia |
|---|---|---|
| `02-carta-publica` | `src/lib/auth/require-admin.ts` → `requireAdmin` | `() => Promise<{ userId: string; restaurantId: string \| null; role: "owner" \| "staff" \| "superadmin" }>`, redirige si no hay sesion |
| `02-carta-publica` | `src/lib/supabase/server.ts` → `createServerSupabase` | `() => Promise<SupabaseClient<Database>>` con la sesion del request |
| `02-carta-publica` | `src/lib/format/price.ts` → `formatPrice` | `(cents: number, currency: string) => string`, sin `Intl` |
| `02-carta-publica` | `src/lib/video/provider.ts` → `getVideoProvider` | `() => VideoProvider` con `name`, `playbackUrl`, `posterUrl` |
| `01-fundaciones` | `tests/helpers/supabase-clients.ts` | `anonClient()`, `serviceClient()`, `authedClient(email, password)` |
| `01-fundaciones` | `tests/helpers/seed-two-restaurants.ts` | Dos restaurantes aislados con owner propio y `cleanup()` |
| `01-fundaciones` | `scripts/smoke-http.sh` | `bash scripts/smoke-http.sh <ruta> <estado> [...]` |

**Producidos** — nada depende de esta epica: es la ultima. Los contratos que deja para el
mantenimiento son las Server Actions de `src/server/admin/**`, todas con la forma
`{ ok: true, data } | { ok: false, error: { code, message, details? } }`.

## Convenciones que muerden en esta area

- **Toda Server Action llama `requireAdmin()` como primera linea.** Las Server Functions son POST a la
  ruta que las usa: un `matcher` de `proxy.ts` que excluya un path se saltea su auth sin avisar.
- **El `restaurant_id` sale del actor, nunca del formulario.** Aceptarlo del cliente es la fuga que
  `E1-T5` existe para prevenir.
- **Las acciones devuelven un resultado tipado, no lanzan.** Forma exacta:
  `{ ok: true, data: T } | { ok: false, error: { code, message, details?: Array<{ field, message }> } }`.
  Codigos permitidos: `validation_error`, `unauthorized`, `forbidden`, `not_found`, `conflict`,
  `provider_unavailable`, `internal_error`.
- **404 (`not_found`), no 403**, para un recurso de otro restaurante: un 403 confirma que el id existe.
- **Precios en enteros de centavos.** El formulario acepta `13500,50` y el servidor guarda `1350050`.
  Nunca float, nunca `parseFloat` sobre el valor final.
- **Reordenar con botones subir/bajar, nunca arrastrando** (WCAG 2.5.7 exige alternativa de un solo
  puntero, y los botones son ademas mas rapidos para cargar 40 platos).
- **Bulk, duplicar y reordenar no son lujos.** El cuello de botella real del negocio es filmar y subir
  40 videos por restaurante: cada segundo que ahorra el panel es la diferencia entre cinco clientes y
  ninguno.
- **`revalidatePath()` despues de cada escritura.** Sin actualizacion optimista: en un panel de carga
  ver el estado real vale mas que ver el deseado.
- **`CLOUDINARY_API_SECRET` nunca sale del servidor** y nunca aparece en una respuesta.
- **El archivo no pasa por el servidor.** El navegador sube directo al proveedor: el limite de 4.5 MB
  de cuerpo de una funcion de Vercel rompe con videos reales.

Reglas completas del proyecto: `CLAUDE.md`. Reglas del area: `.claude/rules/base-de-datos-y-rls.md`,
`.claude/rules/video.md`, `.claude/rules/tests.md`. Estan en la raiz del proyecto.

---

## Tareas

Listadas en el mismo orden que `tasks.json`. Ese orden es el orden de construccion.

### `E3-T1` — Panel: CRUD de restaurantes

**Depende de:** `E2-T1`, `E2-T5` · **Prioridad:** p1

`src/server/admin/restaurants.ts` es la capa de servicio: no sabe de HTTP, recibe un objeto tipado y
el actor. Cada accion hace lo mismo en el mismo orden: `requireAdmin()` → parsear con zod `.strict()`
→ comprobar rol → escribir → `revalidatePath()`. Crear y borrar restaurantes es exclusivo de
`superadmin`; un `owner` puede editar el nombre, el logo y el color del suyo. El `slug` es unico en la
base: el choque llega como error de Postgres y se traduce a `conflict`, no se pregunta antes (preguntar
antes es una condicion de carrera). `is_active` en `false` es el interruptor de cobro manual y su
efecto es inmediato en la carta publica.

**Archivos**
- `src/server/admin/restaurants.ts` — nuevo: `createRestaurant`, `updateRestaurant`, `toggleRestaurantActive`
- `src/app/admin/restaurantes/**` — nuevo: lista, formulario y sus Server Actions
- `tests/integration/admin-restaurants.test.ts` — nuevo
- `tests/e2e/admin-restaurants.spec.ts` — nuevo

**Aceptacion**

Copiado literal del arreglo `acceptance` de esta tarea en `tasks.json`.

1. **WHEN** un `superadmin` crea un restaurante con datos validos **THE SYSTEM SHALL** insertar exactamente una fila y devolver `{ ok: true }`.
2. **WHEN** se crea un restaurante con un `slug` que ya existe **THE SYSTEM SHALL** devolver `{ ok: false }` con `code` igual a `conflict` y no insertar ninguna fila.
3. **WHEN** se crea un restaurante con `primary_color` igual a `"rojo"` **THE SYSTEM SHALL** devolver `{ ok: false }` con `code` igual a `validation_error` y un `details` que nombra el campo `primary_color`.
4. **WHEN** un usuario con rol `owner` invoca la accion de crear restaurante **THE SYSTEM SHALL** devolver `{ ok: false }` con `code` igual a `forbidden` y no insertar ninguna fila.
5. **WHEN** un `superadmin` pone `is_active` en `false` **THE SYSTEM SHALL** hacer que la carta publica de ese slug responda 404 en la siguiente carga.

**Verify** — todos los comandos, en orden, desde la raiz del proyecto.

```bash
pnpm test tests/integration/admin-restaurants.test.ts
pnpm typecheck
pnpm lint
pnpm test:e2e tests/e2e/admin-restaurants.spec.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E3-T1: panel de restaurantes"
git tag step-13-admin-restaurants
```

### `E3-T2` — Panel: categorias, reordenar y borrado bloqueado

**Depende de:** `E3-T1` · **Prioridad:** p1

El borrado bloqueado es el criterio central. `on delete restrict` hace que Postgres rechace el borrado
de una categoria con platos; la accion **cuenta los platos primero para el mensaje** y traduce el
rechazo a `conflict` con un texto que dice cuantos platos la bloquean. No es cascade a proposito: el
cascade silencioso es de donde sale "se me borro media carta". Reordenar es intercambiar `sort_order`
con el vecino mediante botones subir/bajar; subir sobre el primero es un no-op que **no** devuelve
error, porque un error ahi entrena al usuario a ignorar errores.

**Archivos**
- `src/server/admin/categories.ts` — nuevo: `createCategory`, `updateCategory`, `deleteCategory`, `moveCategory`
- `src/app/admin/categorias/**` — nuevo: lista con botones subir/bajar y sus Server Actions
- `tests/integration/admin-categories.test.ts` — nuevo
- `tests/e2e/admin-categories.spec.ts` — nuevo

**Aceptacion**

1. **WHEN** el owner crea una categoria con nombre valido **THE SYSTEM SHALL** insertar una fila con el `restaurant_id` de su propio restaurante, sin importar lo que venga en el formulario.
2. **WHEN** el owner intenta borrar una categoria que tiene 3 platos **THE SYSTEM SHALL** devolver `{ ok: false }` con `code` igual a `conflict` y un `message` que incluye el numero 3.
3. **WHEN** el owner borra una categoria sin platos **THE SYSTEM SHALL** eliminar exactamente esa fila.
4. **WHEN** el owner usa el control de subir sobre la segunda categoria **THE SYSTEM SHALL** intercambiar su `sort_order` con el de la primera y dejar todos los `sort_order` distintos entre si.
5. **WHEN** el owner usa el control de subir sobre la primera categoria **THE SYSTEM SHALL** dejar el orden sin cambios y no devolver error.
6. **WHEN** el owner de otro restaurante invoca la accion de borrar esa categoria **THE SYSTEM SHALL** devolver `{ ok: false }` con `code` igual a `not_found` y dejar la categoria en la base.

**Verify**

```bash
pnpm test tests/integration/admin-categories.test.ts
pnpm typecheck
pnpm lint
pnpm test:e2e tests/e2e/admin-categories.spec.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E3-T2: panel de categorias"
git tag step-14-admin-categories
```

### `E3-T3` — Panel: platos, reordenar y duplicar

**Depende de:** `E3-T2` · **Prioridad:** p1

**Duplicar es una feature de negocio, no una comodidad.** El cuello de botella real es filmar y cargar
40 platos: duplicar convierte "cargar la variante de 500g" en dos clics. El duplicado copia
`category_id`, `price`, `description` y `pairing_text`, y nace con `video_status` en `pending` y
`video_playback_id` en `null` — es decir, **fuera de la carta publica** hasta que tenga su propio
video, lo cual lo garantiza la policy de RLS, no la consulta.

El parseo de precio es el otro punto sensible: el formulario acepta `13500,50` y el servidor guarda el
entero `1350050`. Se parsea separando parte entera y decimal como texto, **nunca con `parseFloat`
seguido de una multiplicacion**, que redondea mal en los centavos.

**Archivos**
- `src/server/admin/dishes.ts` — nuevo: `createDish`, `updateDish`, `deleteDish`, `moveDish`, `duplicateDish`
- `src/app/admin/platos/**` — nuevo: tabla densa, formulario, botones subir/bajar y duplicar
- `tests/integration/admin-dishes.test.ts` — nuevo
- `tests/e2e/admin-dishes.spec.ts` — nuevo

**Aceptacion**

1. **WHEN** el owner crea un plato con precio escrito como `13500,50` **THE SYSTEM SHALL** guardar el entero `1350050` en la columna `price`.
2. **WHEN** el owner crea un plato con precio negativo **THE SYSTEM SHALL** devolver `{ ok: false }` con `code` igual a `validation_error` y no insertar ninguna fila.
3. **WHEN** el owner duplica un plato **THE SYSTEM SHALL** crear exactamente una fila nueva con el mismo `category_id`, `price` y `description`, con `video_status` igual a `pending` y `video_playback_id` nulo.
4. **WHEN** el owner duplica un plato **THE SYSTEM SHALL** dejar el plato duplicado fuera de la carta publica hasta que su video quede en `ready`.
5. **WHEN** el owner asigna un `category_id` que pertenece a otro restaurante **THE SYSTEM SHALL** devolver `{ ok: false }` con `code` igual a `not_found` y no insertar ninguna fila.
6. **WHEN** el owner usa el control de bajar sobre un plato **THE SYSTEM SHALL** intercambiar su `sort_order` con el del siguiente plato de la misma categoria.

**Verify**

```bash
pnpm test tests/integration/admin-dishes.test.ts
pnpm typecheck
pnpm lint
pnpm test:e2e tests/e2e/admin-dishes.spec.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E3-T3: panel de platos"
git tag step-15-admin-dishes
```

### `E3-T4` — Subida firmada de video y estado de procesamiento

**Depende de:** `E3-T3`, `E2-T6` · **Prioridad:** p1

El navegador sube **directo al proveedor**: el archivo nunca pasa por una funcion de Vercel, cuyo
limite de 4.5 MB de cuerpo rompe con videos reales. La ruta solo devuelve parametros firmados. La
firma se calcula con `cloudinary.utils.api_sign_request` en el servidor y el test la compara contra un
SHA-1 calculado de forma **independiente** con `node:crypto` sobre los parametros ordenados mas el
secreto: dos calculos, ninguna cadena literal que dependa de una version.

`video-uploader.tsx` es una **cola multi-archivo** —otra vez, el cuello de botella es el contenido— con
barra de progreso por archivo y reintento por fila. Al terminar cada subida llama `markVideoReady`,
que escribe `video_playback_id`, `thumbnail_url` derivado del proveedor y `video_status` en `ready`;
si falla, `markVideoFailed` deja `failed` y el plato sigue fuera de la carta publica.

Aca las variables de Cloudinary pasan de opcionales a obligatorias — y solo aca, porque promoverlas
antes habria roto el gate de cada paso anterior.

**Archivos**
- `src/app/api/video/signature/route.ts` — nuevo: valida con zod `.strict()`, autoriza, firma
- `src/server/admin/video.ts` — nuevo: `markVideoReady`, `markVideoFailed`
- `src/components/admin/video-uploader.tsx` — nuevo: cliente, cola multi-archivo
- `tests/unit/cloudinary-signature.test.ts` — nuevo
- `tests/e2e/video-signature.spec.ts` — nuevo

**Aceptacion**

1. **WHEN** se calcula la firma de un conjunto de parametros **THE SYSTEM SHALL** producir la misma cadena de 40 caracteres hexadecimales que un SHA-1 calculado de forma independiente sobre los parametros ordenados mas el secreto.
2. **WHEN** la respuesta de la ruta de firma se serializa **THE SYSTEM SHALL** no contener en ningun campo el valor de `CLOUDINARY_API_SECRET`.
3. **WHEN** se hace `POST /api/video/signature` sin sesion **THE SYSTEM SHALL** responder 401 con `code` igual a `unauthorized`.
4. **WHEN** se hace `POST /api/video/signature` con sesion y un `publicId` que contiene caracteres fuera de `[a-zA-Z0-9_/-]` **THE SYSTEM SHALL** responder 422 con `code` igual a `validation_error`.
5. **WHEN** se hace `POST /api/video/signature` con `VIDEO_PROVIDER` distinto de `cloudinary` **THE SYSTEM SHALL** responder 503 con `code` igual a `provider_unavailable`.
6. **WHEN** la subida de un archivo termina y se confirma el video **THE SYSTEM SHALL** dejar el plato con `video_status` igual a `ready` y hacerlo visible en la carta publica.

**Verify**

```bash
pnpm test tests/unit/cloudinary-signature.test.ts
pnpm typecheck
pnpm lint
pnpm test:e2e tests/e2e/video-signature.spec.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E3-T4: subida firmada de video"
git tag step-16-video-upload
```

### `E3-T5` — Performance del poster, estados de error, accesibilidad y CI

**Depende de:** `E3-T4` · **Prioridad:** p1

La metrica que define el producto es cuanto tarda en verse el primer frame en un celular con 4G malo
dentro de un restaurante. Eso no es un comando que salga con 0, asi que se convierte en dos cosas que
si lo son: **un presupuesto de bytes por poster** y **un tiempo de decodificado bajo red limitada**.
`perf-poster.spec.ts` corre en el proyecto `slow-4g` de `playwright.config.ts`, aplica
`Network.emulateNetworkConditions` por CDP (400 kbps, 300 ms de latencia), navega a `/brasa` y afirma
que el primer poster decodifica (`naturalWidth > 0`) en menos de 4000 ms y que ninguna respuesta de
imagen supera 60 KB de `encodedBodySize`.

`a11y.spec.ts` **no usa axe**: `@axe-core/playwright` no tiene pin verificado en este blueprint, y una
dependencia sin verificar en el gate final es peor que un chequeo mas chico. En su lugar afirma la
mitad estructural, que es donde vive aproximadamente la mitad de las violaciones reales: exactamente
un `h1` por pagina, landmark `main`, enlace de salto al contenido enfocable primero, `alt` en toda
imagen, nombre accesible en todo boton, y reflow sin scroll horizontal a 320 CSS px. Sumar axe-core
esta anotado como trabajo posterior a la v1.

**Archivos**
- `src/app/error.tsx` — nuevo: frontera de error raiz con boton que llama `reset()`
- `src/app/[slug]/error.tsx` — nuevo: frontera de error de la carta, con reintento
- `tests/e2e/a11y.spec.ts` — nuevo
- `tests/e2e/perf-poster.spec.ts` — nuevo: proyecto `slow-4g`
- `.github/workflows/ci.yml` — nuevo: instalar, typecheck, lint, test, e2e, build

**Aceptacion**

1. **WHEN** `/brasa` se carga con la red limitada a 400 kbps y 300 ms de latencia **THE SYSTEM SHALL** decodificar el primer poster de la grilla en menos de 4000 ms.
2. **WHEN** `/brasa` termina de cargar **THE SYSTEM SHALL** haber transferido menos de 60 KB por cada poster de la grilla.
3. **WHEN** una consulta de la carta lanza un error **THE SYSTEM SHALL** renderizar la frontera de error con un boton de reintento y sin pantalla en blanco.
4. **WHEN** el spec de accesibilidad recorre `/brasa` y `/brasa/plato/<id>` **THE SYSTEM SHALL** encontrar exactamente un `h1` por pagina, un landmark `main`, un enlace de salto al contenido y `alt` en toda imagen.
5. **WHEN** el spec de accesibilidad recorre esas rutas a 320 CSS px de ancho **THE SYSTEM SHALL** cumplir `document.documentElement.scrollWidth === document.documentElement.clientWidth`.
6. **WHEN** el archivo de flujo de trabajo de CI se lee **THE SYSTEM SHALL** contener cada uno de los comandos del gate global: `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e` y `pnpm build`.

**Verify**

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
for c in 'pnpm install --frozen-lockfile' 'pnpm typecheck' 'pnpm lint' 'pnpm test' 'pnpm test:e2e' 'pnpm build'; do grep -qF "$c" .github/workflows/ci.yml || { echo "falta en CI: $c"; exit 1; }; done
```

**Checkpoint**

```bash
git add -A && git commit -m "E3-T5: performance, errores, accesibilidad y CI"
git tag step-17-launch
git ls-files --error-unmatch .github/workflows/ci.yml   # expect: exit 0 — ya commiteado
git ls-files --error-unmatch .env.example               # expect: exit 0 — la negacion del ignore funciona
```

---

### `E3-T6` — Tarea anti-pausa del proyecto gratis de Supabase

**Depende de:** `E3-T5` · **Prioridad:** p1

El proyecto gratis de Supabase **se pausa a la semana sin actividad**, y el patron de uso de una demo
de ventas —se mira poco y de golpe— es exactamente el que lo dispara. El escenario que esta tarea
existe para evitar: sentarse con el dueno de un restaurante, abrir la carta en el celular, y que no
cargue. Restaurar tarda unos minutos, delante del cliente. §20.2 lo califica probabilidad **alta** e
impacto **alto**.

La solucion es una tarea programada de Vercel que consulta la base una vez por dia. Entra en el plan
gratis. **Cuatro detalles la hacen fallar en silencio si se los saltea:**

1. **`GET`, no `POST`.** Vercel Cron dispara con `GET`. Un handler que solo exporte `POST` devuelve
   405, el panel de Vercel muestra la tarea como sana, y el proyecto se pausa igual. Este es el modo
   de fallo mas caro porque no hay ninguna senal.
2. **Consultar Postgres de verdad** — un `select` de una fila contra `restaurants`. Devolver 200 sin
   tocar la base no cuenta como actividad para Supabase.
3. **Proteger con `CRON_SECRET`** comparando el header `Authorization: Bearer <secreto>` dentro del
   handler. Vercel lo manda solo. Sin el chequeo, la ruta queda abierta.
4. **Solo lectura.** La entrega es best-effort: puede saltear una corrida o duplicarla. Nunca escribe.

**Archivos**
- `src/app/api/keep-alive/route.ts` — nuevo: exporta `GET` unicamente
- `vercel.json` — nuevo: solo la entrada `crons`, frecuencia diaria
- `tests/integration/keep-alive.test.ts` — nuevo: cubre 200, 401 y 405

**Aceptacion**

1. **WHEN** se hace `GET /api/keep-alive` con el header `Authorization: Bearer <CRON_SECRET>` correcto **THE SYSTEM SHALL** responder 200 despues de haber consultado la tabla `restaurants`.
2. **WHEN** se hace `GET /api/keep-alive` sin ese header o con uno incorrecto **THE SYSTEM SHALL** responder 401 sin consultar la base.
3. **WHEN** se hace `POST /api/keep-alive` **THE SYSTEM SHALL** responder 405, porque el handler expone `GET` unicamente y Vercel Cron dispara con `GET`.
4. **WHEN** se lee `vercel.json` **THE SYSTEM SHALL** declarar exactamente una entrada de `crons` cuyo `path` es `/api/keep-alive`.

**Verify**

```bash
pnpm typecheck
pnpm lint
pnpm test tests/integration/keep-alive.test.ts
node -e "const c=require('./vercel.json').crons;if(!c?.some(x=>x.path==='/api/keep-alive'))process.exit(1)"
grep -q "export async function GET" src/app/api/keep-alive/route.ts
grep -q "CRON_SECRET" src/app/api/keep-alive/route.ts
pnpm build
```

**Checkpoint**

```bash
git add -A && git commit -m "E3-T6: tarea anti-pausa"
git tag step-18-keepalive
git ls-files --error-unmatch vercel.json                # expect: exit 0
test "$(git tag -l 'step-*' | wc -l)" -eq 18            # expect: exit 0 — un tag por paso
```

---

## Aceptacion de la epica

La epica esta hecha cuando cada tarea esta en `done` **y**:

1. **WHEN** el dueno entra al panel, crea una categoria, crea un plato, lo duplica, lo reordena y sube un video **THE SYSTEM SHALL** dejar el plato original visible en la carta publica y el duplicado invisible hasta que su propio video quede en `ready`.
2. **WHEN** el gate global corre sobre un arbol limpio **THE SYSTEM SHALL** salir con 0 en instalacion, typecheck, lint, unit, integracion, e2e y build.
3. **WHEN** se despliega a Vercel **THE SYSTEM SHALL** tener declarada la tarea `crons` de `/api/keep-alive`, sin la cual el proyecto gratis de Supabase se pausa y la demo de ventas queda caida.

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm test:e2e && pnpm build
```

Desde la raiz del proyecto.

## Trampas

- **Aceptar `restaurant_id` del formulario.** Es la fuga que `E1-T5` existe para prevenir: sale del
  actor que devuelve `requireAdmin()`, siempre.
- **`parseFloat(precio) * 100`.** Redondea mal en los centavos. Parsea entera y decimal como texto.
- **Borrar una categoria con cascade.** Es `restrict` a proposito. Si estas escribiendo un `delete` en
  cascada sobre `dishes`, pará.
- **Subir el archivo a traves de una route handler.** El limite de 4.5 MB de cuerpo de Vercel la rompe
  con cualquier video real. El navegador sube directo al proveedor.
- **Devolver el secreto de Cloudinary en la respuesta de la firma.** El criterio 2 de `E3-T4` existe
  exactamente para eso.
- **Escribir `/api/keep-alive` como `POST`.** Vercel Cron dispara con `GET`. Devuelve 405, el panel lo
  muestra sano, y el proyecto se pausa igual. Es el fallo mas caro de `E3-T6` porque no avisa.
- **Reordenar arrastrando sin alternativa de un solo puntero.** Incumple WCAG 2.5.7 y es mas lento
  para cargar 40 platos.
- **Instalar `@axe-core/playwright` u otra dependencia sin pin verificado** para "mejorar" el spec de
  accesibilidad. Si la queres, verificá la version primero y anotala en `blueprint.md` §11.
- **Cloudinary Free se agota con el primer restaurante real** (~830 vistas de video por mes). No es un
  bug: esta en el registro de riesgos con su disparador de migracion. No lo descubras en produccion.

## Antes de seguir

- [ ] Cada tarea de esta epica esta en `done` en `tasks.json` — ninguna quedo en `in_progress`.
- [ ] Cada comando `verify` de cada tarea paso, no solo el primero.
- [ ] Ningun comando `verify` fue editado, y ninguno se saltó porque un archivo que nombra no existia.
- [ ] Cada tarea tiene su tag de checkpoint en git — `step-13-admin-restaurants` … `step-18-keepalive`.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` pasa limpio desde la raiz del proyecto.
- [ ] Ningun archivo fuera del subarbol fue modificado.
- [ ] `.env.example` sigue al dia: `E3-T4` promueve variables de Cloudinary a obligatorias, y las seis ya estaban listadas.
- [ ] Un commit por tarea, cada uno prefijado con su id, cada uno seguido de su tag.
- [ ] Los 18 tags existen: `git tag -l 'step-*'` lista uno por paso, de `step-01-scaffold` a `step-18-keepalive`.
