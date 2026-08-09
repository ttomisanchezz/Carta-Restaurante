# Carta interactiva con video

Carta digital de restaurante a la que el comensal llega escaneando un QR en la mesa: cada plato
tiene un video vertical corto. Se vende por suscripcion a restaurantes.

## Comandos

| Tarea | Comando |
|---|---|
| Instalar | `pnpm install --frozen-lockfile` |
| Dev | `pnpm dev` — http://127.0.0.1:3000 |
| Build | `pnpm build` |
| Typecheck | `pnpm typecheck` |
| Lint / format | `pnpm lint` · `pnpm format` |
| Tests unit + integracion | `pnpm test` · un archivo: `pnpm test tests/unit/price.test.ts` |
| Tests e2e | `pnpm test:e2e` · un archivo: `pnpm test:e2e tests/e2e/public-menu.spec.ts` |
| Humo HTTP sobre el build | `pnpm build && bash scripts/smoke-http.sh /api/health 200` |
| Aplicar migraciones + seed | `pnpm db:push` — no destructivo, idempotente |
| Recrear la base desde cero | `pnpm db:reset` — **destructivo**, a mano, nunca en un test |
| Regenerar tipos de la base | `pnpm db:types` |
| Crear/asegurar admin local | `pnpm db:admin` |
| Nueva migracion | `pnpm exec supabase migration new <nombre>` |

**Gate:** `pnpm typecheck && pnpm lint && pnpm test` tiene que pasar antes de dar por terminada
cualquier tarea. Nada se marca hecho con un gate en rojo.

Node esta fijado en `.nvmrc` (24). El gestor de paquetes esta en `package.json` (`packageManager`).
Las versiones de dependencias estan en `pnpm-lock.yaml` — leelo, nunca adivines una.

## Stack

Next.js 16 (App Router, Server Components) · TypeScript estricto · Tailwind v4 (config en CSS) ·
Supabase (Postgres + Auth + RLS) via `@supabase/supabase-js` y `@supabase/ssr` · **sin ORM** ·
Cloudinary detras de una abstraccion propia · Vercel · pnpm.

## Arquitectura

**Camino de una lectura publica.** navegador → `src/app/[slug]/page.tsx` (Server Component) →
`src/server/menu/queries.ts` → cliente anonimo de `src/lib/supabase/server.ts` → PostgREST → Postgres,
donde **las policies de RLS deciden que filas se devuelven**.

**Camino de una escritura del panel.** formulario → Server Action en `src/app/admin/**/actions.ts` →
`src/server/admin/<entidad>.ts` (valida con zod → autoriza con `requireAdmin()` → escribe) → cliente
autenticado → PostgREST → policies de RLS.

**Por que no hay ORM.** Un ORM se conecta a Postgres por TCP con un rol administrador y **RLS no se
aplica en ese camino**: tendrias policies escritas, tests en verde y nada realmente protegido.
`supabase-js` habla HTTP con PostgREST llevando el JWT del usuario, que es lo unico que hace que las
policies se ejecuten. No agregues Drizzle ni Prisma. Es una decision de seguridad.

**Fronteras.** Cruzar una al reves rompe el build o abre un agujero:

| Capa | Puede importar de | Nunca |
|---|---|---|
| `src/app/**` | `components`, `server`, `lib` | `@supabase/supabase-js` directo |
| `src/components/**` | `lib`, otros componentes | `server/`, la key de servicio |
| `src/server/**` | `lib`, `lib/supabase` | React, nada de `components/` |
| `src/lib/video/**` | `cloudinary` (solo en `cloudinary-provider.ts`) | React, `next/*` |
| `scripts/**` | rutas relativas con `.ts` | el alias `@/` — Node no lee `paths` de tsconfig |

**Donde vive cada cosa.**

| Tema | Fuente unica |
|---|---|
| Esquema de la base | `supabase/migrations/**` — nunca el editor del dashboard |
| Tipos de la base | `src/lib/supabase/database.types.ts` — generado, `pnpm db:types` |
| Entorno | `src/lib/env.ts` — nunca leer `process.env` en otro lado |
| Tokens de diseno | `src/app/globals.css` (bloque `@theme`) — nada de hex sueltos |
| Acceso a video | `src/lib/video/provider.ts` — ningun componente importa el SDK |
| Sesion / permisos | `src/lib/auth/require-admin.ts` |
| Formato de precio | `src/lib/format/price.ts` — sin `Intl`, salida determinista |

## Reglas de codigo

1. **Un componente por archivo, maximo 300 lineas.** Mas que eso: partir por responsabilidad.
2. **Alias `@/` → `src/` dentro de `src/` y `tests/`.** Nada de `../../..`. En `scripts/` NO se usa
   `@/`: ahi van rutas relativas con extension explicita (`./x.ts`), porque Node resuelve literal.
3. **Imports relativos llevan la extension** (`./dish-card.tsx`). Es lo que hace que el mismo archivo
   resuelva en Next, en vitest, en `tsc` y en `node` sin loaders.
4. **Server-first.** Todo es Server Component hasta que necesita estado o un evento. `"use client"`
   va en la hoja mas chica posible, jamas en un layout.
5. **Validar en el borde.** Toda Server Action y toda route handler parsea su input con zod antes de
   tocar logica. Nada sin validar llega a `src/server/`.
6. **Las Server Actions devuelven `{ ok: true, data } | { ok: false, error: { code, message } }`.**
   No se lanzan strings.
7. **Autorizar dentro de cada Server Action.** Las Server Actions son POST a su propia ruta: un
   matcher de `proxy.ts` que excluya un path se saltea la auth de sus Server Functions.
8. **Precios en enteros (centavos).** Nunca float. El formateo es trabajo de la vista.
9. **Sin barrel files** (`index.ts` que reexporta). Rompen el tree-shaking y crean ciclos.
10. **Ninguna dependencia nueva sin justificarla en el mensaje de commit.**

## Sistema de diseno

Tema oscuro unico. **No hay modo claro ni toggle**: el video es el producto y una UI clara le compite.
Los tokens se definen una sola vez en `src/app/globals.css`; los componentes solo usan nombres.

| Rol | Valor | Uso |
|---|---|---|
| Fondo | `#0A0A0B` | pagina (no negro puro: evita el halo en OLED) |
| Superficie | `#131316` | tarjetas, hojas, barras |
| Borde | `#1E1E23` | separadores decorativos |
| Borde fuerte | `#6A6A75` | inputs y controles (3.7:1) |
| Texto | `#EAEAEC` | cuerpo (16.5:1 sobre fondo) |
| Texto atenuado | `#8B8B95` | secundario (5.9:1) |
| Marca | `#E8562A` | precio, categoria activa, botones, foco (5.5:1) |
| Error | `#FF5C5C` | errores y borrado |
| Exito | `#3FD08A` | confirmaciones |

- **Tipografia:** Inter, unicamente. Pesos 400/600/700. Una sola familia a proposito: una segunda
  cuesta ~40KB en la red que ES la metrica del producto.
- **Escala:** 12 / 14 / 16 / 18 / 20 / 24 / 32 px.
- **Espaciado:** base 4px — 4, 8, 12, 16, 24, 32, 48, 64. Ningun valor fuera de la escala.
- **Radios:** 8px inputs y botones, 12px tarjetas, 999px chips de categoria.
- **Elevacion:** plano. Se separa con superficie y borde, nunca con sombra.
- **Movimiento:** 160ms `ease-out` en hover/press, 220ms al abrir el plato. Solo `transform` y
  `opacity`. Todo respeta `prefers-reduced-motion: reduce`.
- **Layout:** ancho maximo 720px en la carta publica, 1200px en el panel. Mobile-first, disenado a
  375px, verificado a 375px y 1440px.
- **El color de marca de cada restaurante** viene de la base y se inyecta como `--color-brand` en el
  contenedor del layout. **Se valida con zod como hex de 6 digitos antes de tocar el DOM.** Nunca se
  interpola texto controlado por el usuario dentro de un atributo `style`.

## Entorno

| Variable | Requerida | Usada por | Origen |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | si | `src/lib/env.ts` | Supabase > Project Settings > API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | si | `src/lib/env.ts` | idem |
| `SUPABASE_SERVICE_ROLE_KEY` | si | `scripts/`, tests | idem — **nunca al cliente** |
| `SUPABASE_PROJECT_REF` | si | `supabase link` | el subdominio de la URL del proyecto |
| `SUPABASE_ACCESS_TOKEN` | si | supabase CLI | Account > Access Tokens — **secreto** |
| `SUPABASE_DB_PASSWORD` | si | `supabase link`, `db push` | Project Settings > Database |
| `TEST_DB_PROJECT_REF` | **si, desde el paso 1** | `tests/setup.ts` | el mismo ref que la URL. Sin el, **ningun** `pnpm test` arranca |
| `CRON_SECRET` | desde paso 18 | `src/app/api/keep-alive/route.ts` | lo generas: `openssl rand -hex 32` |
| `VIDEO_PROVIDER` | no (default `direct`) | `src/lib/video/provider.ts` | valor fijo |
| `CLOUDINARY_CLOUD_NAME` | desde paso 11 | `src/lib/video/cloudinary-provider.ts` | Cloudinary Console > Dashboard |
| `CLOUDINARY_API_KEY` | desde paso 16 | `src/app/api/video/signature/route.ts` | Cloudinary > Settings > API Keys |
| `CLOUDINARY_API_SECRET` | desde paso 16 | idem — **secreto** | idem |
| `CLOUDINARY_UPLOAD_FOLDER` | desde paso 16 | idem | valor fijo por entorno |
| `CLOUDINARY_STREAMING_PROFILE` | desde paso 11 | proveedor | Cloudinary > Settings > Video |
| `NEXT_PUBLIC_SITE_URL` | desde paso 17 | metadata | valor fijo por entorno |

`.env.example` se commitea y se mantiene al dia. `.env.local` y cualquier `.env` con valores reales,
nunca.

## Reglas por area

Convenciones diferidas — leé el archivo que corresponda antes de tocar esa area:

| Archivo | Aplica a |
|---|---|
| `.claude/rules/base-de-datos-y-rls.md` | `supabase/**`, `src/server/**` |
| `.claude/rules/estilos-y-tokens.md` | `src/app/**/*.css`, `src/components/**` |
| `.claude/rules/video.md` | `src/lib/video/**`, `src/components/menu/video-player.tsx` |
| `.claude/rules/tests.md` | `tests/**`, `vitest.config.ts`, `playwright.config.ts` |

## No negociable

1. **La `SUPABASE_SERVICE_ROLE_KEY` nunca llega al navegador.** Ni con prefijo `NEXT_PUBLIC_`, ni en
   un componente `"use client"`, ni en un log. Saltea RLS por completo.
2. **El esquema lo mandan las migraciones.** El editor del dashboard de Supabase es de solo lectura.
   Dos sistemas de migracion sobre una base es deriva silenciosa y un fallo solo en produccion.
3. **Ningun componente ni ruta importa el SDK de Cloudinary.** Todo pasa por `src/lib/video/provider.ts`.
4. **En Next 16 el archivo es `proxy.ts` y la funcion exportada es `proxy`.** `middleware.ts` no
   existe. Casi toda la documentacion de Supabase SSR todavia dice `middleware` — esta desactualizada.
5. **No instalar `next-cloudinary` ni `@supabase/auth-helpers-nextjs`.** El primero declara peers
   hasta Next 15 y rompe el install; el segundo esta deprecado en favor de `@supabase/ssr`.
6. Nunca commitear secretos, `.env.local`, ni salida de build.
7. Nunca editar a mano archivos generados: `src/lib/supabase/database.types.ts`, `pnpm-lock.yaml`,
   ni una migracion ya aplicada (se agrega una nueva).
