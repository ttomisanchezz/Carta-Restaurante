# Epica 02: Carta publica y video

> Despues de esta epica un comensal escanea un QR, ve la carta del restaurante con posters y precios,
> toca un plato y mira el video a pantalla completa; y el panel esta protegido detras de un login.

| | |
|---|---|
| **Epic id** | `02-carta-publica` |
| **Tareas** | `E2-T1` … `E2-T6` |
| **Depende de** | `01-fundaciones` |
| **Desbloquea** | `03-panel-y-lanzamiento` |
| **En paralelo con** | ninguna |

No hace falta ningun otro archivo para completar esta epica. Todo lo de abajo esta repetido aca a
proposito.

---

## Stack

Next.js 16 (App Router, Server Components) · TypeScript estricto · Tailwind v4 (config en CSS) ·
Supabase (Postgres + Auth + RLS) via `@supabase/supabase-js` y `@supabase/ssr`, **sin ORM** ·
Cloudinary detras de una abstraccion propia · `hls.js` para la reproduccion · Vercel. Gestor de
paquetes: `pnpm`. Node fijado en `.nvmrc` (24). Las versiones estan en `pnpm-lock.yaml` — leelo,
nunca adivines una.

| Tarea | Comando |
|---|---|
| Dev | `pnpm dev` |
| Typecheck | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Test (un archivo) | `pnpm test tests/unit/price.test.ts` |
| E2E (un archivo) | `pnpm test:e2e tests/e2e/public-menu.spec.ts` |
| Build | `pnpm build` |
| Humo HTTP | `bash scripts/smoke-http.sh /brasa 200 /no-existe 404` |
| Migraciones + seed | `pnpm db:push` seguido de `pnpm db:admin` |

**Gate:** `pnpm typecheck && pnpm lint && pnpm test` pasa antes de marcar cualquier tarea como hecha.

Todas las tareas de aca necesitan el esquema y el seed BRASA aplicados sobre el proyecto de Supabase
enlazado: `pnpm db:push` y despues `pnpm db:admin`. **No hay Postgres local ni Docker.** Nunca
sustituyas por un doble un servicio que los criterios nombran.

## Subarbol de directorios

```
proxy.ts                                  # NUEVO en E2-T1 — NO middleware.ts, exporta `proxy`
src/
  lib/
    supabase/server.ts                    # NUEVO en E2-T1 — cliente de servidor con cookies
    supabase/client.ts                    # NUEVO en E2-T1 — cliente de navegador
    supabase/database.types.ts            # existe (E1-T6), solo lectura aca
    auth/require-admin.ts                 # NUEVO en E2-T1 — el unico guard
    format/price.ts                       # NUEVO en E2-T3 — centavos a texto, SIN Intl
    env.ts                                # EDITAS en E2-T5 — variables de video
    video/provider.ts                     # NUEVO en E2-T5 — la interfaz y la fabrica
    video/cloudinary-provider.ts          # NUEVO en E2-T5 — UNICO archivo que importa el SDK
    video/direct-url-provider.ts          # NUEVO en E2-T5 — dev, tests y seed
  server/menu/queries.ts                  # NUEVO en E2-T2 — lecturas publicas
  app/
    admin/layout.tsx                      # NUEVO en E2-T1 — verifica sesion y rol en el servidor
    admin/login/page.tsx                  # NUEVO en E2-T1 — unico formulario de auth, sin alta
    [slug]/page.tsx                       # NUEVO en E2-T2
    [slug]/loading.tsx                    # NUEVO en E2-T2
    [slug]/not-found.tsx                  # NUEVO en E2-T2
    [slug]/plato/[dishId]/page.tsx        # NUEVO en E2-T4, EDITAS en E2-T6
  components/menu/category-nav.tsx        # NUEVO en E2-T3 — cliente
  components/menu/dish-card.tsx           # NUEVO en E2-T3 — servidor
  components/menu/dish-grid.tsx           # NUEVO en E2-T3 — servidor
  components/menu/dish-fullscreen.tsx     # NUEVO en E2-T4 — servidor
  components/menu/video-player.tsx        # NUEVO en E2-T6 — cliente, hls.js dinamico
tests/
  unit/price.test.ts                      # NUEVO en E2-T3
  unit/video-provider.test.ts             # NUEVO en E2-T5
  e2e/admin-auth.spec.ts                  # NUEVO en E2-T1
  e2e/public-menu.spec.ts                 # NUEVO en E2-T2
  e2e/dish-grid.spec.ts                   # NUEVO en E2-T3
  e2e/dish-view.spec.ts                   # NUEVO en E2-T4
  e2e/video-player.spec.ts                # NUEVO en E2-T6
```

Todo lo que este fuera de este subarbol esta fuera de alcance. Si una tarea parece requerir editar un
archivo no listado, frena y reporta.

## Modelo de datos que se toca aca

| Entidad | Campos que se leen o escriben | Notas |
|---|---|---|
| `restaurants` | lectura de `id`, `slug`, `name`, `logo_url`, `primary_color`, `currency`, `is_active` | Solo lectura en esta epica |
| `categories` | lectura de `id`, `name`, `sort_order` | Ordenadas por `sort_order` |
| `dishes` | lectura de todos los campos | La policy ya filtra por `is_available` y `video_status = 'ready'` |
| `profiles` | lectura de `restaurant_id` y `role` para el guard | Escribe solo el dashboard de Supabase |

Las policies ya existen (`E1-T4`) y usan `public.current_restaurant_id()` y `public.is_superadmin()`.
Esta epica **no crea migraciones**.

## Contratos

**Consumidos** — ya existen, no los rehagas:

| De | Interfaz | Garantia |
|---|---|---|
| `01-fundaciones` | `src/lib/env.ts` → `loadServerEnv` | `(source?: NodeJS.ProcessEnv) => ServerEnv`, perezosa |
| `01-fundaciones` | `src/components/ui/brand-scope.tsx` → `parseBrandColor` | `(input: unknown) => string`, devuelve `#E8562A` ante cualquier entrada invalida |
| `01-fundaciones` | `src/lib/supabase/database.types.ts` → `Database` | Tipos generados de las cuatro tablas |
| `01-fundaciones` | `scripts/smoke-http.sh` | `bash scripts/smoke-http.sh <ruta> <estado> [...]`, sale 0 si todos coinciden |
| `01-fundaciones` | `supabase/seed.sql` | BRASA con `slug` `brasa`, 4 categorias, 12 platos `ready`, ids fijos `d0000000-0000-4000-8000-0000000000{01..12}` |

**Producidos** — `03-panel-y-lanzamiento` depende de estas firmas exactas:

| Export | Firma | Lo usa |
|---|---|---|
| `src/lib/supabase/server.ts` → `createServerSupabase` | `() => Promise<SupabaseClient<Database>>` | todo el panel |
| `src/lib/auth/require-admin.ts` → `requireAdmin` | `() => Promise<{ userId: string; restaurantId: string \| null; role: "owner" \| "staff" \| "superadmin" }>` | toda Server Action |
| `src/lib/format/price.ts` → `formatPrice` | `(cents: number, currency: string) => string` | el panel y la carta |
| `src/lib/video/provider.ts` → `getVideoProvider` | `() => VideoProvider` con `name`, `playbackUrl(id)`, `posterUrl(id, opts)` | `E3-T4` |

## Convenciones que muerden en esta area

- **En Next 16 el archivo es `proxy.ts` y la funcion exportada es `proxy`.** `middleware.ts` no
  existe. Casi toda la documentacion de Supabase SSR todavia dice `middleware`: esta desactualizada.
  Ademas `proxy` corre en el runtime de Node por defecto y poner `runtime` como config de segmento
  dentro de ese archivo lanza un error.
- **Las Server Functions son POST a la ruta que las usa.** Un `matcher` de `proxy.ts` que excluya un
  path se saltea la auth de sus Server Functions **sin avisar**. Por eso cada Server Action llama
  `requireAdmin()` como primera linea; el proxy solo refresca la cookie.
- **`"use client"` va en la hoja mas chica.** Solo `category-nav.tsx`, `video-player.tsx` y el control
  de cerrar lo llevan. Marcar un layout arrastra todo el subarbol al bundle.
- **Posters con `<img>` plano, nunca `next/image`.** Cloudinary ya entrega la imagen optimizada, cada
  transformacion de `next/image` en Vercel se cobra, y `next/image` bloquea SVG (que es lo que usa el
  seed). Siempre con `width`, `height`, `alt`, `loading` y `decoding="async"`.
- **Ningun `<video>` en la grilla y ningun autoplay.** El video de un plato se carga solo cuando el
  comensal lo abre.
- **`formatPrice` no usa `Intl`.** `Intl.NumberFormat` depende de los datos ICU del runtime y su
  salida cambia entre versiones; el formateo es puro y su salida es contrato nuestro.
- **Ningun componente ni ruta importa el SDK `cloudinary`.** Solo `src/lib/video/cloudinary-provider.ts`.
- **404, no 403**, para un recurso de otro restaurante: un 403 confirma que el id existe.
- `revalidate = 60` en las dos rutas publicas; `dynamic = "force-dynamic"` en el layout del panel.

Reglas completas del proyecto: `CLAUDE.md`. Reglas del area: `.claude/rules/estilos-y-tokens.md`,
`.claude/rules/video.md`, `.claude/rules/tests.md`. Estan en la raiz del proyecto.

---

## Tareas

Listadas en el mismo orden que `tasks.json`. Ese orden es el orden de construccion.

### `E2-T1` — Auth de Supabase y proteccion de rutas del panel

**Depende de:** `E1-T6` · **Prioridad:** p0

Auth va antes que el panel porque toda policy depende de saber quien sos. Tres piezas: los clientes de
`@supabase/ssr` (`createServerClient` con cookies en `server.ts`, `createBrowserClient` en
`client.ts`), el refresco de sesion en **`proxy.ts`** —no `middleware.ts`— y `requireAdmin()`, que es
el unico guard y devuelve el actor o redirige. El layout del panel llama `requireAdmin()` en el
servidor: nada de guards de cliente, que renderizan la pagina protegida un frame antes de redirigir.
**No hay pantalla de alta**: el usuario ya existe porque `pnpm db:admin` lo creo. El mensaje de error
del login no distingue email de contrasena, porque distinguirlos enumera usuarios.

**Archivos**
- `src/lib/supabase/server.ts` — nuevo: `createServerSupabase()`
- `src/lib/supabase/client.ts` — nuevo: cliente de navegador
- `proxy.ts` — nuevo: exporta `proxy`, refresca la cookie, con `matcher` que excluye assets estaticos
- `src/lib/auth/require-admin.ts` — nuevo: `requireAdmin()`
- `src/app/admin/**` — nuevo: `layout.tsx`, `login/page.tsx` y sus Server Actions de entrar y salir

**Aceptacion**

Copiado literal del arreglo `acceptance` de esta tarea en `tasks.json`.

1. **WHEN** una peticion anonima llega a `/admin/platos` **THE SYSTEM SHALL** responder con una redireccion a `/admin/login` llevando la ruta original en el parametro `next`.
2. **WHEN** el usuario admin sembrado envia email y contrasena correctos en `/admin/login` **THE SYSTEM SHALL** redirigir a `/admin/platos` y dejar una cookie de sesion `HttpOnly`.
3. **WHEN** se envian credenciales incorrectas en `/admin/login` **THE SYSTEM SHALL** volver a mostrar el formulario con el texto `Email o contrasena incorrectos` sin indicar cual de los dos fallo.
4. **WHEN** un usuario con sesion valida pero sin fila en `profiles` carga `/admin/platos` **THE SYSTEM SHALL** cerrar su sesion y mostrar `Tu usuario no tiene un perfil asignado`.
5. **WHEN** el usuario autenticado usa la accion de cerrar sesion **THE SYSTEM SHALL** redirigir a `/admin/login` y la siguiente carga de `/admin/platos` **SHALL** volver a redirigir al login.
6. **WHEN** el repositorio se busca por el archivo `middleware.ts` **THE SYSTEM SHALL** no encontrarlo, porque en Next 16 el archivo es `proxy.ts` y exporta `proxy`.

**Verify** — todos los comandos, en orden, desde la raiz del proyecto.

```bash
pnpm typecheck
pnpm lint
test -f proxy.ts
test ! -f middleware.ts
pnpm test:e2e tests/e2e/admin-auth.spec.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T1: auth y proteccion de rutas del panel"
git tag step-07-auth
```

### `E2-T2` — Ruta publica `/[slug]` con estados de carga, vacio y 404

**Depende de:** `E1-T6` · **Prioridad:** p0

La carta antes que el video, para que el layout este resuelto cuando aterrice la parte cara.
`src/server/menu/queries.ts` es el unico lugar que lee para el publico: usa el cliente **anonimo**, de
modo que las policies hacen el filtrado. Dos consultas en paralelo (restaurante y sus categorias +
platos), nunca en secuencia. La pagina envuelve todo en `BrandScope` para que el color del restaurante
entre validado. `loading.tsx` es un esqueleto con las **medidas reales** de la grilla: un esqueleto de
altura equivocada es peor que un spinner. Un restaurante activo sin platos listos no rompe: muestra
"Estamos preparando la carta".

**Archivos**
- `src/server/menu/queries.ts` — nuevo: `getMenuBySlug(slug)` con cliente anonimo
- `src/app/[slug]/page.tsx` — nuevo: Server Component, `export const revalidate = 60`
- `src/app/[slug]/loading.tsx` — nuevo: esqueleto sin salto de layout
- `src/app/[slug]/not-found.tsx` — nuevo
- `tests/e2e/public-menu.spec.ts` — nuevo

**Aceptacion**

1. **WHEN** un visitante anonimo carga `/brasa` **THE SYSTEM SHALL** responder 200 y el HTML del servidor **SHALL** contener el nombre del restaurante antes de que corra ningun script de cliente.
2. **WHEN** un visitante carga `/no-existe` **THE SYSTEM SHALL** responder 404 y mostrar la pantalla de restaurante inexistente, sin lanzar una excepcion.
3. **WHEN** un visitante carga el slug de un restaurante con `is_active` en `false` **THE SYSTEM SHALL** responder 404.
4. **WHEN** un restaurante existe y esta activo pero no tiene ningun plato con `video_status` igual a `ready` **THE SYSTEM SHALL** responder 200 y mostrar el texto `Estamos preparando la carta`.
5. **WHEN** `/brasa` se renderiza **THE SYSTEM SHALL** emitir exactamente un elemento `h1` y una etiqueta `title` unica que incluye el nombre del restaurante.

**Verify**

```bash
pnpm typecheck
pnpm lint
pnpm build
bash scripts/smoke-http.sh /brasa 200 /no-existe 404
pnpm test:e2e tests/e2e/public-menu.spec.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T2: ruta publica /[slug]"
git tag step-08-public-route
```

### `E2-T3` — Grilla de platos, posters, chips de categoria y formato de precio

**Depende de:** `E2-T2` · **Prioridad:** p0

La grilla es la pantalla que decide si el producto se vende. Dos columnas hasta 640px, tres desde 640,
cuatro desde 1024, gap 12px, cada tarjeta con poster 4:5 y el nombre y el precio sobre un degrade que
va de transparente a `rgba(10,10,11,0.85)` en el ultimo 45%. **La primera fila de posters lleva
`loading="eager"` y `fetchpriority="high"`; el resto `loading="lazy"`.** El precio usa
`font-variant-numeric: tabular-nums` y el color de marca. Los chips de categoria son el unico
componente cliente de la pantalla y filtran en el cliente sin volver al servidor.

`formatPrice` es puro y **no usa `Intl`**: separador de miles `.`, decimal `,`, siempre dos decimales,
`ARS` → `$`, `USD` → `US$`, cualquier otro codigo se imprime tal cual, y un espacio simple (U+0020)
entre simbolo y numero.

**Archivos**
- `src/components/menu/**` — nuevo: `category-nav.tsx` (cliente), `dish-card.tsx`, `dish-grid.tsx`
- `src/lib/format/price.ts` — nuevo: `formatPrice(cents, currency)`
- `tests/unit/price.test.ts` — nuevo
- `tests/e2e/dish-grid.spec.ts` — nuevo

**Aceptacion**

1. **WHEN** `formatPrice(1350000, "ARS")` se ejecuta **THE SYSTEM SHALL** devolver exactamente la cadena `$ 13.500,00`.
2. **WHEN** `formatPrice(0, "ARS")` se ejecuta **THE SYSTEM SHALL** devolver exactamente la cadena `$ 0,00`.
3. **WHEN** `formatPrice(380000, "USD")` se ejecuta **THE SYSTEM SHALL** devolver exactamente la cadena `US$ 3.800,00`.
4. **WHEN** `/brasa` se carga **THE SYSTEM SHALL** renderizar 12 tarjetas de plato, cada una con un elemento `img` que tiene atributo `alt` no vacio, `width` y `height`.
5. **WHEN** `/brasa` se carga **THE SYSTEM SHALL** no contener ningun elemento `video` en el documento.
6. **WHEN** se toca un chip de categoria **THE SYSTEM SHALL** mostrar unicamente las tarjetas de esa categoria y marcar el chip con `aria-current` igual a `true`.

**Verify**

```bash
pnpm test tests/unit/price.test.ts
pnpm typecheck
pnpm lint
pnpm test:e2e tests/e2e/dish-grid.spec.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T3: grilla de platos, posters y formato de precio"
git tag step-09-dish-grid
```

### `E2-T4` — Vista de plato a pantalla completa, sin video todavia

**Depende de:** `E2-T3` · **Prioridad:** p0

El plato es **una ruta, no un booleano**: `/[slug]/plato/[dishId]` se comparte, se recarga y se
indexa. Todavia sin video: se muestra el poster a 9:16 con el nombre, el precio formateado, la
descripcion y el maridaje. **El `pairing_text` tiene tratamiento propio y no negociable**: un
`blockquote` con una barra vertical de 3px en `--color-brand` a la izquierda, 16px de padding, texto
en italica de 18px y debajo el nombre del restaurante en 12px atenuado. Es lo unico que ninguna carta
en PDF de la competencia tiene: no puede leerse como un campo mas de la base. Pedir el id de un plato
de otro restaurante bajo este slug devuelve **404**, no 403.

**Archivos**
- `src/app/[slug]/plato/[dishId]/page.tsx` — nuevo: Server Component, `export const revalidate = 60`
- `src/components/menu/dish-fullscreen.tsx` — nuevo: layout 9:16, `blockquote` del maridaje, control de cerrar
- `tests/e2e/dish-view.spec.ts` — nuevo

**Aceptacion**

1. **WHEN** se toca una tarjeta de plato en `/brasa` **THE SYSTEM SHALL** navegar a `/brasa/plato/<id>` y esa URL sola **SHALL** renderizar el mismo plato al recargarla.
2. **WHEN** `/brasa/plato/<id>` se renderiza **THE SYSTEM SHALL** mostrar el nombre, el precio formateado, la descripcion y el `pairing_text` del plato.
3. **WHEN** el plato tiene `pairing_text` **THE SYSTEM SHALL** renderizarlo dentro de un elemento `blockquote` acompanado del nombre del restaurante.
4. **WHEN** se pide `/brasa/plato/<id>` con un id que no existe **THE SYSTEM SHALL** responder 404.
5. **WHEN** se pide el id de un plato de otro restaurante bajo el slug `brasa` **THE SYSTEM SHALL** responder 404.
6. **WHEN** se usa el control de cerrar **THE SYSTEM SHALL** volver a `/brasa`.

**Verify**

```bash
pnpm typecheck
pnpm lint
pnpm build
bash scripts/smoke-http.sh /brasa/plato/d0000000-0000-4000-8000-000000000001 200 /brasa/plato/d0000000-0000-4000-8000-000000000099 404
pnpm test:e2e tests/e2e/dish-view.spec.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T4: vista de plato a pantalla completa"
git tag step-10-dish-sheet
```

### `E2-T5` — Abstraccion del proveedor de video

**Depende de:** `E2-T4` · **Prioridad:** p0

Cambiar de Cloudinary a Bunny Stream tiene que ser **un archivo nuevo mas una variable de entorno**.
La interfaz es minima a proposito:

```ts
export type VideoProvider = {
  readonly name: string;
  playbackUrl(playbackId: string): string;
  posterUrl(playbackId: string, opts: { width: number; ratio: "9:16" | "4:5" }): string;
};
```

`CloudinaryProvider` arma las URLs de entrega **como strings** —son patrones predecibles y no hace
falta una libreria de componentes— usando `CLOUDINARY_CLOUD_NAME` y `CLOUDINARY_STREAMING_PROFILE`:
reproduccion `https://res.cloudinary.com/<cloud>/video/upload/sp_<perfil>/<publicId>.m3u8`, poster
`https://res.cloudinary.com/<cloud>/video/upload/so_1,c_fill,ar_<ratio>,w_<width>,q_auto,f_auto/<publicId>.jpg`.
`DirectUrlProvider` trata el `playbackId` como ruta directa (`seed/x` → `/seed/x.m3u8` y
`/seed/x.svg`), que es lo que permite que la suite corra sin salir a la red. **No instales
`next-cloudinary`**: sus peers llegan hasta Next 15 y expone componentes React atados al proveedor.

**Archivos**
- `src/lib/video/provider.ts` — nuevo: el tipo y `getVideoProvider()`
- `src/lib/video/cloudinary-provider.ts` — nuevo: unico archivo que importa el SDK `cloudinary`
- `src/lib/video/direct-url-provider.ts` — nuevo
- `src/lib/env.ts` — editar: `VIDEO_PROVIDER` con default `direct` y las variables de Cloudinary como opcionales
- `tests/unit/video-provider.test.ts` — nuevo

**Aceptacion**

1. **WHEN** `VIDEO_PROVIDER` vale `direct` y se pide la fabrica **THE SYSTEM SHALL** devolver un proveedor cuyo `name` es `direct`.
2. **WHEN** `VIDEO_PROVIDER` vale `cloudinary` y las tres variables de Cloudinary estan presentes **THE SYSTEM SHALL** devolver un proveedor cuyo `name` es `cloudinary`.
3. **WHEN** `VIDEO_PROVIDER` vale `cloudinary` y falta `CLOUDINARY_CLOUD_NAME` **THE SYSTEM SHALL** lanzar un error que nombra esa variable.
4. **WHEN** el proveedor `cloudinary` arma la URL de reproduccion de `carta/dev/ojo-de-bife` **THE SYSTEM SHALL** devolver una cadena que termina en `.m3u8` y contiene el perfil de streaming configurado.
5. **WHEN** el proveedor `cloudinary` arma el poster de un id con relacion `4:5` **THE SYSTEM SHALL** devolver una cadena que termina en `.jpg` y contiene `ar_4:5`.
6. **WHEN** el repositorio se busca por importaciones del paquete `cloudinary` fuera de `src/lib/video/cloudinary-provider.ts` **THE SYSTEM SHALL** no encontrar ninguna.

**Verify**

```bash
pnpm test tests/unit/video-provider.test.ts
pnpm typecheck
pnpm lint
grep -rn "from \"cloudinary\"" src --include=*.ts --include=*.tsx | grep -v "src/lib/video/cloudinary-provider.ts"; test $? -eq 1
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T5: abstraccion del proveedor de video"
git tag step-11-video-provider
```

### `E2-T6` — Reproduccion HLS en la vista de plato

**Depende de:** `E2-T5` · **Prioridad:** p0

`video-player.tsx` es el unico lugar del proyecto que sabe de HLS. Si el navegador soporta HLS nativo
(`video.canPlayType("application/vnd.apple.mpegurl")`), se usa eso y **no se carga `hls.js`**; si no,
`hls.js` entra por import dinamico para que no pese en el bundle inicial de la carta. `preload="none"`,
`loop`, arranca **muteado** con un control de sonido visible: un video con audio en una mesa de
restaurante es una razon para cerrar la carta. El camino de error es un criterio, no un detalle: con
el seed local el manifiesto **no existe**, asi que este camino se ejercita en cada corrida — el poster
se queda y aparece un boton de reintento, nunca un cuadro negro ni un spinner infinito.

**Archivos**
- `src/components/menu/video-player.tsx` — nuevo: cliente, import dinamico de `hls.js`, mute/unmute, reintento
- `src/app/[slug]/plato/[dishId]/page.tsx` — editar: resolver la URL con `getVideoProvider()` y montar el reproductor
- `tests/e2e/video-player.spec.ts` — nuevo

**Aceptacion**

1. **WHEN** se abre `/brasa/plato/<id>` **THE SYSTEM SHALL** mostrar el poster antes de que exista ningun dato de video cargado.
2. **WHEN** el reproductor arranca **THE SYSTEM SHALL** tener el elemento `video` con `muted` en `true` y un control visible para activar el sonido.
3. **WHEN** el manifiesto de video no se puede cargar **THE SYSTEM SHALL** mantener el poster visible y mostrar el texto `No pudimos cargar el video` junto a un boton de reintento.
4. **WHEN** la grilla `/brasa` se carga **THE SYSTEM SHALL** no solicitar ningun recurso cuyo nombre termine en `.m3u8`.
5. **WHEN** el navegador declara `prefers-reduced-motion` en `reduce` **THE SYSTEM SHALL** no reproducir automaticamente y mostrar un boton de reproduccion sobre el poster.

**Verify**

```bash
pnpm typecheck
pnpm lint
pnpm test:e2e tests/e2e/video-player.spec.ts
pnpm test:e2e tests/e2e/dish-grid.spec.ts
```

**Checkpoint**

```bash
git add -A && git commit -m "E2-T6: reproduccion HLS"
git tag step-12-hls
```

---

## Aceptacion de la epica

La epica esta hecha cuando cada tarea esta en `done` **y**:

1. **WHEN** un visitante anonimo recorre `/brasa`, toca un plato y vuelve **THE SYSTEM SHALL** responder 200 en las dos rutas y no solicitar ningun recurso `.m3u8` mientras este en la grilla.
2. **WHEN** una peticion anonima llega a cualquier ruta bajo `/admin` que no sea `/admin/login` **THE SYSTEM SHALL** redirigir al login sin renderizar contenido del panel.

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm test:e2e
```

Desde la raiz del proyecto.

## Trampas

- **`middleware.ts` no existe en Next 16.** Si copiaste un ejemplo de Supabase SSR, renombralo a
  `proxy.ts` y renombra la funcion exportada a `proxy`. El codemod oficial es
  `npx @next/codemod@canary middleware-to-proxy .`.
- **Un `matcher` en `proxy.ts` que excluya un path se saltea la auth de las Server Functions de ese
  path.** Autorizá dentro de cada accion; el proxy solo refresca la cookie.
- **`next/image` bloquea SVG** salvo `dangerouslyAllowSVG`, y los posters del seed son SVG. Usá `<img>`.
- **`Intl.NumberFormat` no es determinista entre runtimes.** No lo uses en `formatPrice` ni afirmes su
  salida en un test.
- **`hls.js` solo puede importarse desde un componente `"use client"`** y siempre con import dinamico.
- **No marques un layout como `"use client"`** para resolver un hook: arrastra todo el subarbol.
- **404, no 403**, para recursos de otro restaurante.

## Antes de seguir

- [ ] Cada tarea de esta epica esta en `done` en `tasks.json` — ninguna quedo en `in_progress`.
- [ ] Cada comando `verify` de cada tarea paso, no solo el primero.
- [ ] Ningun comando `verify` fue editado, y ninguno se saltó porque un archivo que nombra no existia.
- [ ] Cada tarea tiene su tag de checkpoint en git — `step-07-auth` … `step-12-hls`.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` pasa limpio desde la raiz del proyecto.
- [ ] Cada contrato "Producido" de arriba existe con la firma indicada.
- [ ] Ningun archivo fuera del subarbol fue modificado.
- [ ] `.env.example` sigue al dia: `E2-T5` usa variables que ya estaban listadas, no agrego ninguna.
- [ ] Un commit por tarea, cada uno prefijado con su id, cada uno seguido de su tag.
