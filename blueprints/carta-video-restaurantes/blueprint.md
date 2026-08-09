# Carta interactiva con video para restaurantes — Blueprint

> Generado por The Architect el 2026-08-07
> Forma: saas-webapp · `knowledge/shapes/saas-webapp.md`
> Track de runtime: ts-node · `knowledge/runtime-tracks/ts-node.md`
> Modo de emision: bundle
> Version del blueprint: 1
> Versiones verificadas por ultima vez: 2026-08-07 — la procedencia por paquete esta en §11

---

## 1. Vision del proyecto y no-objetivos

### Vision

Una carta digital para restaurantes a la que el comensal llega escaneando un QR en la mesa. A
diferencia de un PDF o de una carta de texto, **cada plato tiene un video vertical corto**: el
comensal navega por categorias, toca un plato y ve el video a pantalla completa con la descripcion,
el precio y una recomendacion de maridaje escrita por el propio dueno del restaurante. El producto se
vende por suscripcion a restaurantes.

Esto es el **Paso 1 de 3**: carta publica + panel de carga de contenido. El recomendador con IA
(Paso 2) y los pedidos a cocina (Paso 3) no se construyen ahora y **tampoco se dejan preparados**.

Hay un detalle que cambia las prioridades de todo el build: **el primer restaurante sembrado es la
demo de ventas**. El dueno del producto va a abrir `/brasa` en el celular delante de un restaurante
candidato para venderle la suscripcion. El seed no es relleno: es un entregable, y se trata como tal
en el paso 6.

### Usuarios

| Persona | A que viene | Frecuencia |
|---|---|---|
| Comensal anonimo | Ver que hay para comer, en un celular, con 4G malo, sentado en la mesa | Una vez por visita — es el 99% del trafico |
| Dueno del producto | Cargar restaurantes, categorias, platos y videos; mostrar la demo a candidatos | Diario al principio |
| Dueno de restaurante (mas adelante) | Mantener su propia carta con su propio usuario | Semanal |

### Objetivos — alcance v1

1. Un comensal escanea un QR y ve la carta de ese restaurante, con posters, categorias y precios, sin
   instalar nada y sin registrarse.
2. Al tocar un plato ve el video a pantalla completa con la descripcion, el precio y el maridaje del
   dueno.
3. El dueno del producto carga y mantiene todo el contenido desde un panel propio, protegido,
   incluida la subida de video.
4. Los datos de un restaurante son inaccesibles para cualquier otro, y eso esta probado por tests
   automatizados antes de que exista el primer CRUD.
5. El sistema soporta N restaurantes independientes desde la primera migracion, aunque al principio
   cargue contenido una sola persona.

### No-objetivos — explicitamente fuera de alcance en v1

**El builder no implementa nada de esta tabla**, ni siquiera "porque es facil dejarlo listo ahora".
Si un paso parece requerir un no-objetivo, eso es un defecto del blueprint: hay que frenar y
reportarlo, no ampliar el alcance.

| No se construye | Por que no ahora | Se revisa cuando |
|---|---|---|
| Recomendador con IA | Es el Paso 2 del producto. Meterlo ahora agrega un proveedor de modelo, costo por consulta y una superficie de prompt injection sobre un producto que todavia no vendio nada | Haya 5 restaurantes pagando y el dueno vea que los comensales piden ayuda para elegir |
| Pedidos, carrito, comandas, integracion con cocina | Es el Paso 3. Cambia el modelo de datos, agrega estados y obliga a integrar con la cocina de cada local | El plan `pedidos` tenga un comprador concreto esperando |
| Pasarela de pagos, facturacion, onboarding self-service | El cobro es manual por fuera del sistema y a este volumen eso es correcto. Una pasarela son webhooks, idempotencia, impuestos y reembolsos | Haya mas de ~15 restaurantes y cobrar a mano tarde mas de una hora por mes |
| Panel de metricas o analytics | No hay ninguna decision que hoy se tome distinto con esos numeros. Un dashboard que nadie mira es peor que ninguno | Un restaurante pregunte "cuanta gente miro mi carta" en una renovacion |
| App nativa | El caso de uso es escanear un QR una vez y no volver. Una app que hay que instalar antes de comer no se instala | Nunca, salvo que aparezca un caso de uso recurrente por comensal |
| Multi-idioma | Todos los restaurantes son argentinos y todos los comensales leen espanol. i18n duplica cada texto del panel y del seed | Entre el primer restaurante en una zona turistica |
| Registro abierto de usuarios | Un formulario de alta en `/admin` es un agujero que despues hay que cerrar. Los usuarios se crean a mano hasta que exista un flujo de alta pensado | Se venda el producto a un restaurante que se auto-administre |
| Modo claro / toggle de tema | El video es el producto y una UI clara le compite. No es "modo oscuro", es *el* tema | Nunca en v1 |
| **Generacion de codigos QR** | El dueno los genera por fuera con la herramienta que ya usa. Construir un generador es una pantalla, un formato de impresion y un soporte que nadie pidio | El dueno tenga que generar mas de 20 QR por semana |

### Metricas de exito

| Metrica | Objetivo | Como se mide |
|---|---|---|
| Poster visible sobre red lenta | El primer poster de la grilla decodifica en menos de 4000 ms con 400 kbps y 300 ms de latencia | `pnpm test:e2e tests/e2e/perf-poster.spec.ts` (proyecto `slow-4g`) |
| Peso del poster | Cada poster de la grilla pesa menos de 60 KB | El mismo spec: suma `encodedBodySize` de las respuestas de imagen |
| Aislamiento entre restaurantes | 0 filas de otro restaurante visibles o modificables | `pnpm test tests/integration/isolation-read.test.ts` y `isolation-write.test.ts` |
| Demo cargada | 12 platos en 4 categorias con precio, descripcion, maridaje y poster | `pnpm test tests/integration/seed.test.ts` |
| Restaurantes vendidos | 3 restaurantes pagando a los 90 dias del lanzamiento | Conteo manual del dueno — **no** es un gate del build |

---

## 2. Stack tecnico

**Track de runtime: ts-node.** Esta tabla nombra *decisiones*, no versiones. Todos los pines viven en
§11 y en ningun otro lado.

Los pines vienen del informe de `stack-researcher` producido en esta sesion (2026-08-07), que es la
autoridad. `knowledge/runtime-tracks/ts-node.md` es el respaldo para lo que el informe no resolvio, y
sus advertencias de "no verificado" se arrastran tal cual.

| Capa | Eleccion | Por que esta y no la otra |
|---|---|---|
| Lenguaje / runtime | TypeScript sobre Node.js | Un solo lenguaje en UI, servidor y scripts. La alternativa (Python + un front separado) agrega un segundo despliegue para un producto que cabe en uno |
| Framework | Next.js, App Router, Server Components | La carta publica se renderiza en el servidor: el comensal no descarga un SPA para leer 12 platos. La alternativa (Vite + SPA) tira el server-render, que es justo lo que hace que el primer frame llegue antes |
| Estilos | Tailwind CSS v4, tokens como custom properties CSS | Sin nombres de clase que inventar ni CSS muerto. Los tokens como custom properties son lo que permite inyectar el color de marca de cada restaurante con una sola variable. Se descarta CSS-in-JS en runtime: obliga a marcar componentes como cliente y mata el server-render |
| Capa de componentes | Componentes propios, sin libreria copy-in | El producto tiene tres pantallas y ~8 componentes. Instalar shadcn/Radix trae 40 primitivos para usar 3, y su `init` pide input interactivo que rompe un build desatendido. Se usa HTML nativo (`<dialog>` no hace falta: el plato es una ruta) |
| Base de datos | Postgres gestionado por Supabase | Los bugs interesantes son relacionales: un plato sin categoria, una categoria de otro restaurante. Ademas trae Auth y RLS en la misma caja, y RLS es el mecanismo de aislamiento |
| Acceso a datos | **`@supabase/supabase-js` + tipos generados. Sin ORM** | **Decision de seguridad, no de gusto.** Un ORM se conecta por TCP con un rol administrador y **RLS no se aplica en ese camino**: tendrias policies escritas, tests en verde y nada protegido. `supabase-js` habla HTTP con PostgREST llevando el JWT del usuario, que es lo unico que hace que las policies se ejecuten. Beneficio adicional: sin conexiones directas no hay agotamiento del pool en serverless |
| Auth | Supabase Auth (email + contrasena) | Los usuarios quedan en nuestro propio Postgres, asi que las policies pueden referenciar `auth.uid()` directo. Con Clerk la identidad vive afuera y RLS deja de poder decidir sola. Sin pantalla de registro: los usuarios se crean a mano |
| Trabajo en segundo plano | Ninguno | Nada tarda mas que un request. El procesamiento del video lo hace Cloudinary; el panel consulta el estado. Meter una cola seria infraestructura para cero trabajos |
| Pagos | NO APLICA | El cobro es manual por fuera del sistema (spec §3.3). Las features se activan por la columna `plan` |
| Almacenamiento de archivos | Cloudinary, detras de `src/lib/video/provider.ts` | El video no va a Supabase Storage ni se sirve como MP4 desde el origen (spec §2). Cloudinary da encoding, HLS adaptativo, poster derivado del propio video y subida firmada desde el navegador. Ver §20.2 riesgo 2: tiene fecha de vencimiento |
| Email / notificaciones | Ninguno | No hay registro, no hay reset por mail en v1, no hay avisos. Sumar un proveedor de mail seria dominio, SPF/DKIM y una cuenta mas para cero mensajes |
| Hosting | Vercel | Es la plataforma que mantiene el framework: preview por PR, TLS y rollback el dia uno. Un contenedor propio nos haria re-implementar routing y cache para el mismo resultado |
| Gestor de paquetes | pnpm | `node_modules` estricto: atrapa dependencias fantasma antes de que lleguen a produccion |

### Chequeo de compatibilidad

Verificado contra `knowledge/stack-compatibility.md`. **Dos filas de la tabla de combinaciones malas
aplican a este stack y las dos estan resueltas por diseno:**

1. **"Linter que parsea CSS + motor de estilos CSS-first con at-rules propias"** — Biome 2.5.5 no
   puede parsear `@theme` de Tailwind v4 y falla con `parse × Tailwind-specific syntax is disabled`
   sobre `src/app/globals.css`, un archivo que genero el propio scaffolder. Es un error de **parseo**:
   ninguna regla desactivada ni `--write` lo arregla. **Resolucion:** `biome.json` se emite en §19.6
   con `"css": { "parser": { "tailwindDirectives": true } }` y aterriza en el proyecto **antes** del
   primer `pnpm lint`, en §10 Bootstrap.

2. **"Dos sistemas de migracion sobre una base"** — el editor de esquema del dashboard de Supabase
   mas las migraciones versionadas del repo. **Resolucion:** el esquema lo mandan `supabase/migrations/**`
   y **el dashboard es de solo lectura desde el dia uno**. Esta escrito en §19.1, en
   `.claude/rules/base-de-datos-y-rls.md` y en el skill `agregar-migracion`.

El resto de las filas no aplica: no hay CSS-in-JS, hay un solo proveedor de identidad, no hay proceso
de larga vida ni estado realtime en memoria, no hay driver TCP en el edge (todo va por HTTP a
PostgREST) y no hay API de grafo.

---

## 3. Estructura de directorios

```
carta-video-restaurantes/
├── .claude/                        # workspace de agente — llega copiando workspace/ (§19)
│   ├── settings.json               # permisos: todo comando de Verify pre-aprobado
│   ├── rules/                      # convenciones por area, diferidas por globs `paths:`
│   │   ├── base-de-datos-y-rls.md
│   │   ├── estilos-y-tokens.md
│   │   ├── video.md
│   │   └── tests.md
│   └── skills/                     # procedimientos repetibles (NUNCA commands/)
│       ├── agregar-migracion/SKILL.md
│       └── agregar-plato-al-seed/SKILL.md
├── .github/workflows/ci.yml        # pipeline — lo escribe el paso 17
├── blueprints/                     # este bundle de diseno, commiteado con el proyecto
│   └── carta-video-restaurantes/   # TODA herramienta que recorre el arbol lo excluye (§19.6)
├── public/
│   └── seed/                       # posters SVG de la demo BRASA — los escribe el paso 6
├── scripts/
│   ├── smoke-http.sh               # levanta el build, verifica rutas y estados, lo baja — paso 1
│   └── create-admin.ts             # crea/asegura el usuario admin local — paso 6
├── src/
│   ├── app/
│   │   ├── layout.tsx              # raiz: lang="es", tema oscuro, Inter, skip link — paso 2
│   │   ├── globals.css             # @import "tailwindcss" + @theme con TODOS los tokens — paso 2
│   │   ├── error.tsx               # frontera de error raiz — paso 17
│   │   ├── api/
│   │   │   ├── health/route.ts     # {"ok":true} · ?deep=1 tambien pinguea la base — pasos 1 y 3
│   │   │   ├── keep-alive/route.ts # GET protegido con CRON_SECRET, anti-pausa — paso 18
│   │   │   └── video/signature/route.ts   # firma de subida a Cloudinary — paso 16
│   │   ├── [slug]/
│   │   │   ├── page.tsx            # la carta publica — paso 8
│   │   │   ├── loading.tsx         # esqueleto con las medidas reales — paso 8
│   │   │   ├── not-found.tsx       # slug inexistente o restaurante inactivo — paso 8
│   │   │   ├── error.tsx           # frontera de error de la carta — paso 17
│   │   │   └── plato/[dishId]/page.tsx   # plato a pantalla completa (es una RUTA) — paso 10
│   │   └── admin/
│   │       ├── layout.tsx          # verifica sesion y rol en el servidor — paso 7
│   │       ├── login/page.tsx      # unico formulario de auth. NO hay alta — paso 7
│   │       ├── restaurantes/       # CRUD de restaurantes — paso 13
│   │       ├── categorias/         # CRUD + reordenar + borrado bloqueado — paso 14
│   │       └── platos/             # CRUD + reordenar + duplicar + subir video — pasos 15 y 16
│   ├── components/
│   │   ├── ui/brand-scope.tsx      # valida el hex y lo inyecta como --color-brand — paso 2
│   │   ├── menu/                   # category-nav, dish-card, dish-grid, dish-fullscreen, video-player
│   │   └── admin/video-uploader.tsx        # cola de subida multi-archivo — paso 16
│   ├── server/
│   │   ├── menu/queries.ts         # lecturas publicas — paso 8
│   │   └── admin/                  # restaurants.ts, categories.ts, dishes.ts, video.ts — pasos 13-16
│   └── lib/
│       ├── env.ts                  # esquema zod de process.env — paso 1
│       ├── format/price.ts         # centavos → texto, SIN Intl, determinista — paso 9
│       ├── auth/require-admin.ts   # el unico guard de autorizacion — paso 7
│       ├── supabase/
│       │   ├── server.ts           # cliente de servidor con cookies (@supabase/ssr) — paso 7
│       │   ├── client.ts           # cliente de navegador — paso 7
│       │   └── database.types.ts   # GENERADO por `pnpm db:types` — paso 6
│       └── video/
│           ├── provider.ts         # la interfaz + la fabrica — paso 11
│           ├── cloudinary-provider.ts      # UNICO archivo que importa el SDK — paso 11
│           └── direct-url-provider.ts      # dev, tests y seed — paso 11
├── supabase/
│   ├── config.toml                 # lo genera `supabase init` en §10 Bootstrap
│   ├── migrations/                 # SQL versionado, commiteado. Los nombres los pone la CLI
│   └── seed.sql                    # la demo BRASA — paso 6
├── tests/
│   ├── setup.ts                    # setupFiles de vitest: falla temprano si falta entorno — §19.6
│   ├── helpers/
│   │   ├── supabase-clients.ts     # cliente anon, cliente de servicio, cliente autenticado — paso 3
│   │   └── seed-two-restaurants.ts # fabrica de dos restaurantes aislados — paso 5
│   ├── unit/                       # logica pura
│   ├── integration/                # contra el proyecto Supabase enlazado
│   └── e2e/                        # navegador
├── vercel.json                     # SOLO la entrada `crons` de /api/keep-alive — paso 18
├── proxy.ts                        # NO middleware.ts — refresca la sesion — paso 7
├── biome.json                      # con tailwindDirectives — §19.6
├── vitest.config.ts                # alias @/, carga de entorno, exclusion de blueprints/ — §19.6
├── playwright.config.ts            # proyectos mobile/desktop/slow-4g + webServer — §19.6
├── next.config.ts                  # cabeceras de seguridad — §19.6
├── postcss.config.mjs              # @tailwindcss/postcss — §19.6
├── tsconfig.json                   # lo genera el scaffold, lo parchea §10 Bootstrap
├── .env.example                    # toda variable; lo completa el humano a mano — §19.6
├── .gitignore                      # con `!.env.example` DESPUES de `.env*` — §19.6
├── .gitattributes                  # `* text=auto eol=lf` — sin esto el lint muere en Windows — §19.6
├── .nvmrc                          # 24
├── package.json                    # lo escribe `pnpm create next-app`; §10 le agrega los scripts
├── CLAUDE.md                       # §19.1
└── AGENTS.md                       # §19.2
```

**Reglas de frontera**

- Nada de `src/components/**` importa `src/server/**` ni `@supabase/supabase-js` directo. Los datos
  entran a los componentes como props desde un Server Component.
- `src/server/**` no importa React ni nada de `src/components/**`.
- El SDK `cloudinary` solo puede importarse desde `src/lib/video/cloudinary-provider.ts`.
- `scripts/**` **no usa el alias `@/`**: Node no lee `paths` de `tsconfig.json`. Ahi van rutas
  relativas con extension explicita.
- `tests/**` nunca importa `src/lib/supabase/server.ts`: ese modulo importa `next/headers` y no hay
  contexto de request fuera de Next.

**Convencion de resolucion de modulos.** Este proyecto declara una: **alias `@/` → `src/` para todo
lo que cruza un directorio de primer nivel, y extension explicita (`.ts` / `.tsx`) en todo import
relativo; `scripts/**` usa unicamente rutas relativas.** Esa convencion esta reconciliada contra cada
cargador del proyecto en la **matriz de convencion de resolucion de §19.6** — no se restablece aca.

**Un arbol es documentacion: dibujar un archivo aca no lo crea.** Todo archivo de este arbol tiene
exactamente uno de dos origenes, y esta indicado en el comentario: lo escribe un paso de §9, o se
emite como archivo real bajo `workspace/` (§19.6) y aterriza con el unico copiado que el builder
corre antes del paso 1.

---

## 4. Modelo de datos

Es el modelo de la spec del usuario §4. No se rediseno. Lo unico agregado son `updated_at` con su
trigger (convencion de `knowledge/capabilities/database.md`) y las constraints `check` que hacen
cumplir en la base lo que el codigo tambien valida.

### Entidades

**restaurants** — la entidad raiz. Toda tabla de contenido cuelga de un `restaurant_id`. Se crea a
mano desde el panel y no se borra nunca en la practica: se desactiva.

| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` | No enumerable: aparece en URLs del panel |
| `slug` | text | not null, unique, `check (slug ~ '^[a-z0-9-]{2,40}$')` | **Es la URL publica**: `/brasa`. Inmutable una vez impreso en un QR |
| `name` | text | not null, `check (length(trim(name)) > 0)` | Nombre visible en el header de la carta |
| `logo_url` | text | nullable | URL absoluta o ruta del proyecto. Si falta, se muestra solo el nombre |
| `primary_color` | text | not null, default `'#E8562A'`, `check (primary_color ~ '^#[0-9A-Fa-f]{6}$')` | Se inyecta como `--color-brand`. El `check` es la primera de dos defensas; la segunda es zod |
| `currency` | text | not null, default `'ARS'`, `check (currency ~ '^[A-Z]{3}$')` | Codigo ISO. Decide el simbolo al formatear |
| `plan` | text | not null, default `'basico'`, `check (plan in ('basico','pedidos'))` | Las features se activan leyendo esta columna. **No hay pasarela de pago** |
| `is_active` | boolean | not null, default `true` | En `false`, la carta publica deja de responder. Es el interruptor de cobro manual |
| `created_at` | timestamptz | not null, default `now()` | |
| `updated_at` | timestamptz | not null, default `now()` | Lo mantiene el trigger `set_updated_at`, no el codigo |

**categories** — agrupacion visible de platos dentro de un restaurante.

| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` | |
| `restaurant_id` | uuid | not null, FK → `restaurants(id)` **on delete cascade**, indexada | Borrar un restaurante se lleva sus categorias: es la raiz |
| `name` | text | not null, `check (length(trim(name)) > 0)` | "De la parrilla" |
| `sort_order` | integer | not null, default `0` | Orden de los chips. Se reordena con botones, no arrastrando |
| `created_at` / `updated_at` | timestamptz | not null, default `now()` | |

**dishes** — el objeto del producto. Cada plato tiene un video.

| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` | |
| `restaurant_id` | uuid | not null, FK → `restaurants(id)` on delete cascade, indexada | **Desnormalizado a proposito** aunque se derive de `category_id`: simplifica cada policy de RLS y evita un join en cada lectura publica. No lo normalices |
| `category_id` | uuid | not null, FK → `categories(id)` **on delete restrict**, indexada | `restrict`, no `cascade`: borrar una categoria con platos esta **bloqueado** |
| `name` | text | not null, `check (length(trim(name)) > 0)` | |
| `description` | text | not null, default `''` | Una o dos frases: corte, coccion, con que viene |
| `price` | integer | not null, `check (price >= 0)` | **Centavos.** `$13.500,00` se guarda como `1350000`. Nunca float |
| `pairing_text` | text | nullable | La recomendacion del dueno. Es lo unico que ninguna carta en PDF tiene |
| `video_playback_id` | text | nullable | Identificador opaco del proveedor. Con `DirectUrlProvider` es una ruta |
| `video_status` | text | not null, default `'pending'`, `check (video_status in ('pending','processing','ready','failed'))` | **Si no es `ready`, el plato no aparece en la carta publica** — lo impide la policy, no solo la consulta |
| `thumbnail_url` | text | nullable | Poster. Lo deriva el proveedor del propio video; no hay subida de foto por plato |
| `is_available` | boolean | not null, default `true` | "Hoy no hay". Lo apaga el restaurante sin borrar el plato |
| `sort_order` | integer | not null, default `0` | Orden dentro de la categoria |
| `created_at` / `updated_at` | timestamptz | not null, default `now()` | |

**profiles** — extiende `auth.users` con el restaurante y el rol. Es lo que leen las policies.

| Campo | Tipo | Constraints | Notas |
|---|---|---|---|
| `id` | uuid | PK, FK → `auth.users(id)` on delete cascade | Mismo id que el usuario de Supabase Auth |
| `restaurant_id` | uuid | **nullable**, FK → `restaurants(id)` on delete set null, indexada | `null` para un `superadmin` que no pertenece a ningun restaurante |
| `role` | text | not null, default `'owner'`, `check (role in ('owner','staff','superadmin'))` | El rol vive aca, no en `auth.users` |
| `created_at` / `updated_at` | timestamptz | not null, default `now()` | |

### Relaciones

- `restaurants` —(1:N)→ `categories` · borrado: **cascade** (la categoria no existe sin su restaurante)
- `restaurants` —(1:N)→ `dishes` · borrado: **cascade**
- `categories` —(1:N)→ `dishes` · borrado: **restrict** — borrar una categoria con platos falla, y la
  UI dice cuantos platos la bloquean. Nunca cascade: el cascade silencioso es de donde sale "se me
  borro media carta"
- `auth.users` —(1:1)→ `profiles` · borrado: **cascade**
- `restaurants` —(1:N)→ `profiles` · borrado: **set null** (queda el usuario, sin restaurante)

### Indices

| Tabla | Indice | Para que consulta |
|---|---|---|
| `restaurants` | unique en `slug` | `select ... where slug = $1` — cada carga de la carta publica |
| `categories` | `idx_categories_restaurant_sort (restaurant_id, sort_order)` | Los chips de categoria, ya ordenados |
| `dishes` | `idx_dishes_restaurant_sort (restaurant_id, sort_order)` | La grilla completa del restaurante |
| `dishes` | `idx_dishes_category_sort (category_id, sort_order)` | La grilla filtrada por categoria y el chequeo de borrado bloqueado |
| `dishes` | `idx_dishes_public (restaurant_id) where is_available and video_status = 'ready'` | Indice parcial: la unica consulta que corre 99% del trafico |
| `profiles` | `idx_profiles_restaurant (restaurant_id)` | El guard de autorizacion en cada escritura |

### Esquema

```sql
-- Migracion 1 — esquema base. El nombre del archivo lo pone
-- `pnpm exec supabase migration new schema_inicial`.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.restaurants (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name          text not null check (length(trim(name)) > 0),
  logo_url      text,
  primary_color text not null default '#E8562A' check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  currency      text not null default 'ARS' check (currency ~ '^[A-Z]{3}$'),
  plan          text not null default 'basico' check (plan in ('basico', 'pedidos')),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.categories (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name          text not null check (length(trim(name)) > 0),
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.dishes (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid not null references public.restaurants(id) on delete cascade,
  category_id       uuid not null references public.categories(id) on delete restrict,
  name              text not null check (length(trim(name)) > 0),
  description       text not null default '',
  price             integer not null check (price >= 0),
  pairing_text      text,
  video_playback_id text,
  video_status      text not null default 'pending'
                    check (video_status in ('pending', 'processing', 'ready', 'failed')),
  thumbnail_url     text,
  is_available      boolean not null default true,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  restaurant_id uuid references public.restaurants(id) on delete set null,
  role          text not null default 'owner' check (role in ('owner', 'staff', 'superadmin')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_categories_restaurant_sort on public.categories (restaurant_id, sort_order);
create index idx_dishes_restaurant_sort     on public.dishes (restaurant_id, sort_order);
create index idx_dishes_category_sort       on public.dishes (category_id, sort_order);
create index idx_dishes_public              on public.dishes (restaurant_id)
                                            where is_available and video_status = 'ready';
create index idx_profiles_restaurant        on public.profiles (restaurant_id);

create trigger trg_restaurants_updated before update on public.restaurants
  for each row execute function public.set_updated_at();
create trigger trg_categories_updated  before update on public.categories
  for each row execute function public.set_updated_at();
create trigger trg_dishes_updated      before update on public.dishes
  for each row execute function public.set_updated_at();
create trigger trg_profiles_updated    before update on public.profiles
  for each row execute function public.set_updated_at();

notify pgrst, 'reload schema';
```

```sql
-- Migracion 2 — RLS. El nombre del archivo lo pone
-- `pnpm exec supabase migration new rls_policies`.

alter table public.restaurants enable row level security;
alter table public.categories  enable row level security;
alter table public.dishes      enable row level security;
alter table public.profiles    enable row level security;

-- Estas dos funciones son `security definer` a proposito: una policy sobre `profiles`
-- que consultara `profiles` directamente seria recursion infinita.
create or replace function public.current_restaurant_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select restaurant_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select coalesce((select role = 'superadmin' from public.profiles where id = auth.uid()), false);
$$;

grant execute on function public.current_restaurant_id() to anon, authenticated;
grant execute on function public.is_superadmin()         to anon, authenticated;

-- restaurants
create policy restaurants_select on public.restaurants for select
  using (is_active or id = public.current_restaurant_id() or public.is_superadmin());
create policy restaurants_insert on public.restaurants for insert
  with check (public.is_superadmin());
create policy restaurants_update on public.restaurants for update
  using (id = public.current_restaurant_id() or public.is_superadmin())
  with check (id = public.current_restaurant_id() or public.is_superadmin());
create policy restaurants_delete on public.restaurants for delete
  using (public.is_superadmin());

-- categories
create policy categories_select on public.categories for select
  using (
    exists (select 1 from public.restaurants r
             where r.id = categories.restaurant_id and r.is_active)
    or categories.restaurant_id = public.current_restaurant_id()
    or public.is_superadmin()
  );
create policy categories_insert on public.categories for insert
  with check (restaurant_id = public.current_restaurant_id() or public.is_superadmin());
create policy categories_update on public.categories for update
  using (restaurant_id = public.current_restaurant_id() or public.is_superadmin())
  with check (restaurant_id = public.current_restaurant_id() or public.is_superadmin());
create policy categories_delete on public.categories for delete
  using (restaurant_id = public.current_restaurant_id() or public.is_superadmin());

-- dishes
create policy dishes_select on public.dishes for select
  using (
    (
      exists (select 1 from public.restaurants r
               where r.id = dishes.restaurant_id and r.is_active)
      and dishes.is_available
      and dishes.video_status = 'ready'
    )
    or dishes.restaurant_id = public.current_restaurant_id()
    or public.is_superadmin()
  );
create policy dishes_insert on public.dishes for insert
  with check (restaurant_id = public.current_restaurant_id() or public.is_superadmin());
create policy dishes_update on public.dishes for update
  using (restaurant_id = public.current_restaurant_id() or public.is_superadmin())
  with check (restaurant_id = public.current_restaurant_id() or public.is_superadmin());
create policy dishes_delete on public.dishes for delete
  using (restaurant_id = public.current_restaurant_id() or public.is_superadmin());

-- profiles
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_superadmin());
create policy profiles_write on public.profiles for all
  using (public.is_superadmin())
  with check (public.is_superadmin());

-- Diagnostico usado por tests/integration/rls-enabled.test.ts.
-- Solo service_role puede llamarla: expone metadatos del esquema.
create or replace function public.rls_status()
returns table (table_name text, rls_enabled boolean, policy_count bigint)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select c.relname::text,
         c.relrowsecurity,
         (select count(*) from pg_policy p where p.polrelid = c.oid)
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
  order by c.relname;
$$;

revoke all on function public.rls_status() from public, anon, authenticated;
grant execute on function public.rls_status() to service_role;

notify pgrst, 'reload schema';
```

### Migraciones

- Herramienta: **Supabase CLI**. `pnpm exec supabase migration new <nombre>` crea el archivo;
  **el nombre lleva un timestamp que elige la CLI**, asi que ningun paso de §9 nombra un archivo de
  migracion: los referencia por el comando que los produce.
- Los archivos se commitean, en `supabase/migrations/`.
- Aplicar: **`pnpm db:push`** = `supabase db push --linked --include-all --include-seed`. Es
  **aditivo**: aplica las migraciones que falten y corre `supabase/seed.sql`. No borra datos y no
  recrea nada. Es el comando de todos los dias y el que usan los gates de §9.
- **`pnpm db:reset` = `supabase db reset --linked` es DESTRUCTIVO**: tira la base entera y la
  reconstruye. Existe solo para volver a un estado limpio a proposito. Esta en `deny` de
  `.claude/settings.json` — lo corre un humano a mano, nunca el agente, nunca un test, nunca CI.
- **No hay stack local.** Toda migracion se estrena sobre la base real del proyecto enlazado, asi que
  el gate del paso 3 verifica el esquema resultante en el mismo paso que lo aplica.
- En produccion: hacia adelante, nunca hacia atras. Para cualquier cambio destructivo,
  **expandir → migrar → contraer** en despliegues separados.
- **El editor de esquema del dashboard de Supabase es de solo lectura.** Dos sistemas de migracion
  sobre una base derivan y el fallo aparece solo en produccion.

### Datos de seed

`supabase/seed.sql` siembra el restaurante **BRASA** (parrilla moderna, `slug: brasa`,
`currency: ARS`, `primary_color: #E8562A`), sus 4 categorias y 12 platos con precios reales de Buenos
Aires en centavos, descripcion y `pairing_text` en la voz del dueno. Todos los ids son UUID fijos
(`b0000000-…` el restaurante, `c0000000-…` las categorias, `d0000000-…` los platos) para que los
tests puedan referenciarlos.

**`seed.sql` TIENE que ser idempotente.** `pnpm db:push` lo corre en cada invocacion, asi que cada
`insert` va con `on conflict (id) do update set ...` — nunca un `insert` pelado, que fallaria con
violacion de clave primaria en la segunda corrida y voltearia el gate. Los UUID fijos del parrafo
anterior son justamente lo que hace posible el `on conflict`.

Esa propiedad no es prolijidad: es lo que hace **reconstruible** a la demo de ventas. Con un solo
proyecto de Supabase compartido entre desarrollo, tests y demo (§12), que BRASA se pueda volver a
dejar impecable con un comando es lo que convierte "rompi la demo" en treinta segundos de trabajo.
§20.1 lo verifica corriendo `pnpm db:push` dos veces seguidas y exigiendo que siga habiendo
exactamente un `brasa` con sus 12 platos.

El usuario administrador **no** lo crea `seed.sql`: lo crea `scripts/create-admin.ts` con la API de
administracion de Supabase Auth (`pnpm db:admin`). Insertar a mano en `auth.users` depende de columnas
que cambian entre versiones de Supabase; la API de administracion no.

**No hay pantalla de alta.** El primer usuario administrador se crea a mano —localmente con
`pnpm db:admin`, en produccion desde el dashboard de Supabase (Authentication > Users > Add user) mas
una fila en `profiles` con `role = 'superadmin'`. Un formulario de registro abierto en `/admin` es un
agujero que despues habria que cerrar.

---

## 5. Diseno de la API

La mayor parte del producto no necesita API: la carta publica son Server Components leyendo Postgres
y el panel son Server Actions. Solo existen dos route handlers HTTP, y existen porque algo fuera del
render los llama.

### Convenciones

- **Ruta base:** `/api`. No hay `/v1`: no hay consumidores externos y versionar una API que solo
  llama nuestro propio front es ceremonia.
- **Sobre de respuesta (route handlers JSON), una sola forma, siempre:**
  - exito: `{ "data": <objeto> }`
  - error: `{ "error": { "code": "<string estable>", "message": "<texto para humanos>", "details": [] } }`
  - `details` es opcional y solo aparece en `validation_error`, como arreglo de
    `{ "field": "<nombre>", "message": "<texto>" }`.
- **Resultado de una Server Action**, que no es HTTP y por eso tiene su propia forma:
  `{ ok: true, data: T } | { ok: false, error: { code: string; message: string; details?: Array<{ field: string; message: string }> } }`.
  Nunca se lanza un string. Nunca se lanza para controlar flujo.
- **Codigos de error** — conjunto cerrado. `code` es una cadena estable para el cliente; `message`
  es texto para humanos y puede cambiar.

| `code` | HTTP | Cuando |
|---|---|---|
| `validation_error` | 422 | El cuerpo esta bien formado pero es semanticamente invalido |
| `unauthorized` | 401 | No hay sesion |
| `forbidden` | 403 | Hay sesion pero no alcanza para ese recurso |
| `not_found` | 404 | No existe — **tambien** para un recurso de otro restaurante |
| `conflict` | 409 | Choca con el estado actual: slug duplicado, categoria con platos |
| `provider_unavailable` | 503 | El proveedor de video no esta configurado o no responde |
| `internal_error` | 500 | Culpa nuestra. Nunca se devuelve 200 con un error adentro |

- **Validacion:** `zod`. Un esquema por operacion, junto al modulo de `src/server/` que lo usa. El
  handler recibe un objeto tipado o el request no llega. Los campos desconocidos se rechazan
  (`.strict()`): ignorar un campo mal tipeado en silencio se convierte en un reporte de "no me guardo".
- **Paginacion:** no hay. El maximo por restaurante son ~100 platos (§20.3 decision 9) y se devuelven
  todos en una consulta. Agregar cursores para 100 filas es complejidad sin beneficio.
- **Idempotencia:** no aplica. No hay endpoint que cobre, envie o cree algo irreversible.
- **Rate limits:** no hay capa propia. La carta publica es de solo lectura y se cachea; el login lo
  limita Supabase Auth; `/api/video/signature` requiere sesion. Esta anotado como riesgo en §20.2.

### Rutas

| Metodo | Ruta | Que hace | Auth | Limite |
|---|---|---|---|---|
| GET | `/api/health` | `{"ok":true,"service":"carta"}`. Con `?deep=1` ademas pinguea Postgres | publica | ninguno |
| POST | `/api/video/signature` | Devuelve los parametros firmados para que el navegador suba el video directo al proveedor | sesion con `role` en `owner`/`staff`/`superadmin` | ninguno |

**Server Actions** (no son HTTP publicos; su superficie es el formulario que las llama):

| Accion | Modulo | Autorizacion |
|---|---|---|
| `createRestaurant`, `updateRestaurant`, `toggleRestaurantActive` | `src/server/admin/restaurants.ts` | `superadmin` |
| `createCategory`, `updateCategory`, `deleteCategory`, `moveCategory` | `src/server/admin/categories.ts` | dueno del restaurante o `superadmin` |
| `createDish`, `updateDish`, `deleteDish`, `moveDish`, `duplicateDish` | `src/server/admin/dishes.ts` | dueno del restaurante o `superadmin` |
| `markVideoReady`, `markVideoFailed` | `src/server/admin/video.ts` | dueno del restaurante o `superadmin` |

**Toda Server Action llama a `requireAdmin()` como primera linea.** Las Server Actions son POST a la
ruta que las usa: un `matcher` de `proxy.ts` que excluya un path se saltea la auth de sus Server
Functions sin avisar. El guard va adentro de la accion, no en el proxy.

### Endpoints criticos — detalle completo

#### `GET /api/health`

- **Request:** sin cuerpo. Query opcional `deep=1`.
- **200:** `{"ok":true,"service":"carta"}` — el proceso vive. Con `deep=1` y base alcanzable:
  `{"ok":true,"service":"carta","db":"up"}`.
- **503:** solo con `deep=1` y base inalcanzable:
  `{"error":{"code":"internal_error","message":"database unreachable"}}`.
- **Sin `deep=1` siempre responde 200 mientras el proceso este vivo.** Es deliberado: es el gate de
  arranque del paso 1 y el `url` de `webServer` en `playwright.config.ts`. Si dependiera de la base,
  todo el build quedaria atado a que Postgres este arriba en ese instante.
- Efectos secundarios: ninguno. No escribe, no loguea a nivel `error`.

#### `POST /api/video/signature`

- **Request:** `{ "dishId": "<uuid>", "publicId": "<string 1..120, [a-zA-Z0-9_/-]>" }`, validado con
  zod `.strict()`.
- **200:** `{ "data": { "cloudName": "...", "apiKey": "...", "timestamp": 1234567890, "signature": "<40 hex>", "folder": "...", "publicId": "...", "uploadUrl": "https://api.cloudinary.com/v1_1/<cloudName>/video/upload" } }`
- **401 `unauthorized`:** sin sesion.
- **403 `forbidden`:** hay sesion pero el plato pertenece a otro restaurante y el usuario no es
  `superadmin`.
- **404 `not_found`:** `dishId` no existe.
- **422 `validation_error`:** `publicId` con caracteres fuera del conjunto, o falta un campo.
- **503 `provider_unavailable`:** `VIDEO_PROVIDER` no es `cloudinary`, o falta alguna de
  `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
- **Efectos:** ninguno en la base. **`CLOUDINARY_API_SECRET` nunca aparece en la respuesta.** El
  archivo no pasa por el servidor: el navegador sube directo al proveedor, porque el limite de 4.5 MB
  de cuerpo de una funcion de Vercel rompe con videos reales.

### Formato de precio — contrato

`src/lib/format/price.ts` expone `formatPrice(cents: number, currency: string): string`.
**No usa `Intl`.** `Intl.NumberFormat` depende de los datos ICU del runtime: el separador y el
espacio cambian entre versiones de Node y entre Node y el navegador, asi que un test sobre su salida
falla por razones que no tienen que ver con el codigo. Este formateo es puro y su salida es contrato
nuestro:

- Separador de miles: `.` · separador decimal: `,` · siempre 2 decimales.
- Simbolo: `ARS` → `$`, `USD` → `US$`, cualquier otro → el propio codigo de tres letras.
- Un espacio simple (U+0020) entre el simbolo y el numero.
- `formatPrice(1350000, "ARS")` produce exactamente `$ 13.500,00`.
- `formatPrice(0, "ARS")` produce exactamente `$ 0,00`.
- `formatPrice(380000, "USD")` produce exactamente `US$ 3.800,00`.

---

## 6. Arquitectura de frontend

### Rutas

| Ruta | Pagina | Origen de datos | Auth |
|---|---|---|---|
| `/[slug]` | Carta publica | Server Component → `src/server/menu/queries.ts` (cliente anon) | publica |
| `/[slug]/plato/[dishId]` | Plato a pantalla completa | Server Component → misma consulta, un plato | publica |
| `/admin/login` | Formulario de acceso | Server Action → Supabase Auth | publica |
| `/admin/restaurantes` | Lista y edicion de restaurantes | Server Component + Server Actions | `superadmin` |
| `/admin/categorias` | Categorias del restaurante | Server Component + Server Actions | sesion + restaurante |
| `/admin/platos` | Platos, reordenar, duplicar, subir video | Server Component + Server Actions | sesion + restaurante |
| `/api/health` | Route handler | — | publica |
| `/api/video/signature` | Route handler | — | sesion |

### Estrategia de renderizado

- **`/[slug]` y `/[slug]/plato/[dishId]`: renderizadas en el servidor por request, con revalidacion.**
  `export const revalidate = 60` en ambas. Sesenta segundos es el equilibrio: un cambio de precio se
  ve en un minuto y una mesa con 20 comensales escaneando el mismo QR pega una sola vez a la base.
  `export const dynamicParams = true` para que un restaurante nuevo funcione sin redeploy.
- **`/admin/**`: siempre dinamicas, sin cache.** `export const dynamic = "force-dynamic"` en el layout
  del panel. Datos personalizados que no se cachean nunca.
- **Nada es estatico en build:** los slugs viven en la base y cambian sin desplegar.
- **Nada es client-only.** No hay SPA. El comensal no descarga un router para leer 12 platos.

### Jerarquia de componentes

```
/[slug]  (Server Component)
└── BrandScope                     server — valida el hex con zod e inyecta --color-brand
    ├── MenuHeader                 server — logo + nombre, sticky
    ├── CategoryNav                CLIENTE — chips con scroll horizontal; guarda la categoria activa
    └── DishGrid                   server — dos columnas
        └── DishCard  (xN)         server — <img> poster 4:5 + nombre + precio sobre degrade
                                            envuelto en <Link> a /[slug]/plato/[dishId]

/[slug]/plato/[dishId]  (Server Component)
└── BrandScope                     server
    └── DishFullscreen             server — layout 9:16, nombre, precio, descripcion
        ├── VideoPlayer            CLIENTE — hls.js con import dinamico, mute/unmute, reintento
        ├── PairingQuote           server — cita con barra vertical de marca + nombre del restaurante
        └── CloseButton            CLIENTE — vuelve a /[slug] preservando el scroll

/admin/platos  (Server Component)
└── DishTable                      server — lista densa
    ├── MoveButtons                CLIENTE — subir / bajar (NO arrastrar: WCAG 2.5.7)
    ├── DuplicateButton            CLIENTE — Server Action
    └── VideoUploader              CLIENTE — cola multi-archivo directo al proveedor
```

**Solo cinco componentes llevan `"use client"`**, y todos son hojas. Ningun layout es cliente: marcar
un layout arrastra todo el subarbol al bundle.

### Manejo de estado

- **Estado de servidor: los propios Server Components.** No hay libreria de cache de datos. No hay
  `fetch` desde el cliente en la carta publica. Agregar TanStack Query aca seria una segunda copia de
  datos que ya vienen renderizados.
- **Estado de cliente: `useState` local en las cinco hojas.** La categoria activa vive en `CategoryNav`;
  el estado del reproductor vive en `VideoPlayer`; la cola de subida vive en `VideoUploader`.
- **Despues de una escritura del panel: `revalidatePath()`** dentro de la Server Action. No hay
  actualizacion optimista: en un panel de carga, ver el estado real vale mas que ver el estado deseado.
- **Deliberadamente NO va a estado global:** el restaurante actual (viene de la ruta), la sesion
  (viene del servidor en cada request), el tema (no hay toggle).

### Estados de carga, vacio y error

Cada superficie asincrona tiene los tres. Es el hueco mas comun en UI construida por agentes.

| Superficie | Carga | Vacio | Error |
|---|---|---|---|
| `/[slug]` | `loading.tsx`: esqueleto con las medidas reales de la grilla (4:5, dos columnas) para que no haya salto de layout | Restaurante sin platos listos: titulo del restaurante + "Estamos preparando la carta" + nada roto | `error.tsx` de la ruta: mensaje y boton "Reintentar" que llama `reset()` |
| `/[slug]` con slug inexistente o inactivo | — | `not-found.tsx`: 404 real, no una excepcion | — |
| `/[slug]/plato/[dishId]` | Poster visible de inmediato; el video carga encima | Plato inexistente o no `ready` → 404 | Manifiesto que no carga: **el poster se queda**, aparece "No pudimos cargar el video" y un boton de reintento. Nunca cuadro negro, nunca spinner infinito |
| Listas del panel | Esqueleto de filas | "Todavia no hay categorias" con el boton de crear al lado | Banner de error con el `message` de la accion |
| Subida de video | Barra de progreso por archivo | — | Fila en rojo con el motivo y boton de reintento por archivo |

---

## 7. Sistema de diseno

Producido a partir de `knowledge/capabilities/styling.md`. **`ui-ux-pro-max` no estaba instalado en
esta sesion**, asi que la paleta, la escala tipografica y el estilo de componente salen de ese archivo
de conocimiento y no de la skill; se anota la sustitucion aca y no se presenta como resultado de la
skill. Todo valor de abajo es literal.

### Colores

**Un solo tema oscuro. No hay modo claro, no hay toggle, no hay media query de esquema.** El video es
el producto y una interfaz clara le compite. Esto es *el* tema, no "modo oscuro", y por eso la columna
"Claro" esta vacia a proposito.

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--color-brand` | — | `#E8562A` | Precio, chip de categoria activa, fondo de boton primario, anillo de foco, barra de la cita de maridaje |
| `--color-brand-fg` | — | `#0A0A0B` | Texto sobre fondo de marca |
| `--color-bg` | — | `#0A0A0B` | Pagina |
| `--color-surface` | — | `#131316` | Tarjetas, hojas, barra del panel |
| `--color-border` | — | `#1E1E23` | Separadores decorativos |
| `--color-border-strong` | — | `#6A6A75` | Bordes de input y de control |
| `--color-text` | — | `#EAEAEC` | Cuerpo |
| `--color-text-muted` | — | `#8B8B95` | Secundario, descripciones, captions |
| `--color-danger` | — | `#FF5C5C` | Errores y borrado |
| `--color-success` | — | `#3FD08A` | Confirmaciones |

Capa primitiva, que solo lee la capa semantica:
`--ink-950 #0A0A0B` · `--ink-900 #131316` · `--ink-800 #1E1E23` · `--ink-700 #2C2C33` ·
`--ink-500 #6A6A75` · `--ink-400 #8B8B95` · `--ink-100 #EAEAEC`.

`#0A0A0B` en vez de negro puro: el negro puro contra texto blanco produce halacion en las pantallas
OLED que todo el mundo tiene en la mano.

**Contraste — WCAG 2.2 AA.** Ratios calculados sobre estos hexadecimales exactos:

| Par | Ratio | Requisito | Resultado |
|---|---|---|---|
| `--color-text` `#EAEAEC` sobre `--color-bg` `#0A0A0B` | **16.5:1** | 4.5:1 texto | pasa |
| `--color-text-muted` `#8B8B95` sobre `--color-bg` | **5.9:1** | 4.5:1 texto | pasa |
| `--color-text-muted` sobre `--color-surface` `#131316` | **5.5:1** | 4.5:1 texto | pasa |
| `--color-brand` `#E8562A` sobre `--color-bg` | **5.5:1** | 4.5:1 texto, 3:1 foco | pasa |
| `--color-brand-fg` `#0A0A0B` sobre `--color-brand` | **5.5:1** | 4.5:1 texto de boton | pasa |
| `--color-border-strong` `#6A6A75` sobre `--color-bg` | **3.7:1** | 3:1 borde de control | pasa |
| `--color-danger` `#FF5C5C` sobre `--color-bg` | **6.5:1** | 4.5:1 | pasa |
| `--color-success` `#3FD08A` sobre `--color-bg` | **10.0:1** | 4.5:1 | pasa |

Los tres pares mas riesgosos son el texto atenuado sobre superficie (5.5:1), el texto de boton sobre
marca (5.5:1) y el borde de control (3.7:1) — los tres estan por encima del minimo con margen.
**Texto blanco sobre `--color-brand` da 3.6:1 y NO pasa**: por eso los botones de marca llevan texto
`--ink-950`, no blanco.

### Tipografia

**Inter, y solamente Inter.** Pesos 400 / 600 / 700. Una sola familia a proposito: una segunda cuesta
unos 40 KB en la red que *es* la metrica central del producto. El caracter sale de la escala y del
espaciado, no de una segunda tipografia. **No hay familia mono**: no se muestra codigo en ningun lado.

| Rol | Familia | Tamano / interlineado | Peso | Tracking |
|---|---|---|---|---|
| Display (nombre del plato a pantalla completa) | Inter | 32px / 1.1 | 700 | -0.02em |
| Titulo 1 (nombre del restaurante) | Inter | 24px / 1.2 | 700 | -0.01em |
| Titulo 2 (categoria) | Inter | 20px / 1.3 | 600 | -0.01em |
| Titulo 3 (nombre en la tarjeta) | Inter | 16px / 1.3 | 600 | 0 |
| Cuerpo (descripcion) | Inter | 16px / 1.6 | 400 | 0 |
| Precio | Inter | 16px / 1.2 | 600 | 0 (con `font-variant-numeric: tabular-nums`) |
| Cita de maridaje | Inter | 18px / 1.5 | 400 | 0 (italica) |
| Small (metadatos del panel) | Inter | 14px / 1.5 | 400 | 0 |
| Caption (estado del video) | Inter | 12px / 1.4 | 500 | 0.01em |

El cuerpo nunca baja de 16px en movil: por debajo, iOS hace zoom sobre los inputs.

**Carga de fuentes:** `next/font/google` con `Inter`, `subsets: ["latin"]`,
`weight: ["400","600","700"]`, `display: "swap"`, `variable: "--font-inter"`. Pila de respaldo:
`ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.

> **Advertencia del track, que se arrastra tal cual:** `next/font` emite reglas `@font-face` de
> respaldo **sin `font-display`**, y ninguna opcion lo cambia — pasar `display: "swap"` no las toca.
> Por eso **no existe** en este blueprint ningun criterio del tipo "toda `@font-face` declara
> `font-display`": seria insatisfacible. Lo que se verifica es el `display: "swap"` en el sitio de
> llamada del cargador.

### Espaciado, radios, elevacion

- **Escala de espaciado, base 4px:** 4, 8, 12, 16, 24, 32, 48, 64. Cualquier valor fuera de la escala
  es un bug.
- **Radios:** 8px inputs y botones · 12px tarjetas y hojas · 999px chips de categoria · 0 en el video
  a pantalla completa.
- **Sombras: ninguna.** Diseno plano. La separacion sale de `--color-surface` contra `--color-bg` y de
  `--color-border`. Una sombra sobre `#0A0A0B` no se ve y cuesta un repaint.
- **Ancho maximo de contenido:** 720px en la carta publica (es un producto de celular; a 1440px la
  grilla se centra y no se estira) · 1200px en el panel.
- **Breakpoints** (mobile-first, estilos base sin prefijo): sm 640px · md 768px · lg 1024px · xl 1280px.
- **Grilla de platos:** 2 columnas hasta 640px, 3 columnas desde 640px, 4 desde 1024px. Gap 12px.
- **Relacion de aspecto:** poster de tarjeta 4:5 · video a pantalla completa 9:16.

### Movimiento

| Interaccion | Duracion | Easing | Propiedad |
|---|---|---|---|
| Hover / press de chip o boton | 160ms | `cubic-bezier(0.2, 0, 0, 1)` | `transform: scale(0.98)`, `opacity` |
| Abrir el plato a pantalla completa | 220ms | `cubic-bezier(0.2, 0, 0, 1)` | `opacity` + `translateY(8px → 0)` |
| Aparicion del poster al decodificar | 120ms | `linear` | `opacity` |
| Barra de progreso de subida | continuo | `linear` | `transform: scaleX()` |

Solo `transform` y `opacity`: cualquier otra propiedad fuerza layout y en un celular de gama media se
nota. Todo va dentro de un bloque que lo desactiva:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

El video del plato **no** cuenta como animacion decorativa: es el contenido. Pero con
`prefers-reduced-motion: reduce` **no arranca solo** — se muestra el poster con un boton de
reproduccion.

### Estilo de componente

Superficies planas sobre fondo casi negro, bordes de 1px en lugar de sombras, esquinas de 12px y el
naranja de marca usado con avaricia: solo precio, categoria activa, boton primario, anillo de foco y
la barra de la cita de maridaje. **Nunca como fondo de una superficie grande.** La imagen ocupa todo
el ancho disponible y el texto se apoya encima sobre un degrade que va de transparente a
`rgba(10,10,11,0.85)` en el ultimo 45% de la tarjeta.

**El `pairing_text` tiene tratamiento propio y no negociable:** una cita con una barra vertical de
3px en `--color-brand` a la izquierda, 16px de padding, texto en italica de 18px y debajo el nombre
del restaurante en 12px atenuado. Es lo unico que ninguna carta en PDF de la competencia tiene y es
lo que vende el producto: **no puede leerse como un campo mas de la base**.

El panel usa exactamente los mismos tokens y cero decoracion: filas densas, botones chicos, sin
tarjetas anidadas. Esta optimizado para cargar 40 platos rapido, no para ser lindo.

---

## 8. Autenticacion y autorizacion

### Proveedor y razon

**Supabase Auth, email + contrasena.** Es la eleccion que `knowledge/capabilities/auth.md` marca
cuando el proyecto ya esta sobre Supabase, y aca es mas que una conveniencia: los usuarios quedan en
**nuestro propio Postgres**, asi que las policies de RLS pueden referenciar `auth.uid()` directamente.
Con un proveedor externo (Clerk, Auth0) la identidad vive afuera, la base solo tiene un espejo, y RLS
deja de poder decidir sola — que es exactamente el mecanismo del que depende todo el aislamiento.

Sin proveedores sociales: son cero valor para tres usuarios internos y cada uno agrega un caso borde
de vinculacion de cuentas.

### Flujos

- **Alta: NO EXISTE.** No hay pantalla de registro. Un formulario de alta abierto en `/admin` es un
  agujero que despues habria que cerrar. El primer usuario se crea a mano:
  - local: `pnpm db:admin` (usa la API de administracion con la clave de servicio),
  - produccion: dashboard de Supabase > Authentication > Users > Add user, y despues una fila en
    `profiles` con el `restaurant_id` correspondiente y el `role`.
- **Inicio de sesion:** `/admin/login`, email + contrasena, Server Action que llama
  `signInWithPassword`. Exito → redirect a `/admin/platos`. Fallo → el mismo formulario con
  "Email o contrasena incorrectos", **sin distinguir cual de los dos** (distinguirlos enumera usuarios).
- **Sesion activa:** la cookie la refresca `proxy.ts` en cada request. Si el refresh falla, la
  siguiente carga de `/admin/**` redirige a `/admin/login?next=<ruta>`.
- **Cierre de sesion:** Server Action que llama `signOut()` y redirige a `/admin/login`.
- **Reset de contrasena: NO en v1.** Con tres usuarios internos, se resetea desde el dashboard de
  Supabase. Un flujo de reset por mail necesita un proveedor de correo, dominio verificado y SPF/DKIM
  para cero mensajes por mes.
- **Baja de cuenta: NO en v1.** No hay autoservicio; se borra desde el dashboard.
- **Ramas de fallo:** sin sesion en una ruta del panel → redirect con `next`. Con sesion pero sin fila
  en `profiles` → cierre de sesion forzado y mensaje "Tu usuario no tiene un perfil asignado". Con
  sesion y perfil pero sin permiso sobre el recurso → **404, no 403** (403 confirma que el id existe).

### Proteccion de rutas

| Superficie | Regla | Donde se aplica |
|---|---|---|
| `/[slug]`, `/[slug]/plato/**` | publica | ningun guard — las policies de RLS filtran las filas |
| `/api/health` | publica | ningun guard |
| `/admin/login` | publica | ningun guard |
| `/admin/**` (todo lo demas) | sesion valida + fila en `profiles` | `src/app/admin/layout.tsx` llamando `requireAdmin()` |
| `/admin/restaurantes/**` | `role = 'superadmin'` | `src/server/admin/restaurants.ts`, dentro de cada accion |
| Toda Server Action del panel | sesion + pertenencia al restaurante de la fila | `src/lib/auth/require-admin.ts`, primera linea de cada accion |
| `/api/video/signature` | sesion + pertenencia al restaurante del plato | `src/app/api/video/signature/route.ts` |
| Refresco de cookie de sesion | todas las rutas salvo assets estaticos | `proxy.ts` |

**Regla de aplicacion:** la autorizacion se verifica **en el servidor, en cada request**, junto al
acceso a datos. `proxy.ts` es una capa de conveniencia que refresca la cookie, **nunca el unico
control**. Un boton escondido no es un permiso.

> **Trampa concreta de Next 16, que cuesta una tarde:** el archivo ya **no es `middleware.ts`, es
> `proxy.ts`**, y la funcion exportada es `proxy`, no `middleware`. Casi toda la documentacion de
> Supabase SSR todavia dice `middleware`. Ademas, `proxy` corre por defecto en el runtime de Node y
> poner `runtime` como config de segmento dentro de un archivo de proxy lanza un error. Y lo mas
> peligroso: **las Server Functions son POST a la ruta que las usa**, asi que un `matcher` que excluya
> un path se saltea la auth de sus Server Functions en silencio. Por eso cada Server Action autoriza
> por dentro.

### Roles y permisos

| Rol | Puede | No puede |
|---|---|---|
| `superadmin` | Crear, editar, activar y desactivar restaurantes; todo lo de `owner` sobre cualquier restaurante | Nada dentro del alcance del panel |
| `owner` | CRUD de categorias y platos de **su** restaurante, reordenar, duplicar, subir video, editar nombre/logo/color de su restaurante | Crear restaurantes, cambiar `plan`, cambiar `is_active`, ver otro restaurante |
| `staff` | Editar platos y subir video de **su** restaurante | Borrar categorias, editar los datos del restaurante, crear restaurantes |
| anonimo | Leer restaurantes activos y sus platos `is_available` + `video_status = 'ready'` | Cualquier escritura, ver `profiles`, ver restaurantes inactivos |

El rol vive en `profiles`, no en `auth.users`: es un atributo de la relacion persona–restaurante, no
de la identidad.

### Sesiones

- Tipo de token: JWT de Supabase Auth, en cookies gestionadas por `@supabase/ssr`.
- Almacenamiento: **cookies `HttpOnly`, `Secure` en produccion, `SameSite=Lax`**. Nunca
  `localStorage`: un token en `localStorage` es legible por cualquier script inyectado.
- Vida: access token 1 hora, refresh token rotativo. El refresh lo hace `proxy.ts`.
- CSRF: `SameSite=Lax` mas el hecho de que las Server Actions de Next llevan su propio identificador
  de accion, que un sitio de terceros no puede fabricar. **No hay endpoints POST con cookie y cuerpo
  arbitrario**: la unica ruta POST es `/api/video/signature`, que valida sesion y pertenencia.

### Multi-tenancy / aislamiento por fila

El mecanismo es **RLS de Postgres, y nada mas**. No es "acordate de filtrar por `restaurant_id`": el
filtro lo aplica la base, en cada consulta, para cualquier cliente que use la clave anon o un JWT de
usuario.

Las tres piezas:

1. **`supabase-js` sobre HTTP.** Cada request lleva el JWT del usuario, asi que `auth.uid()` tiene
   valor dentro de la policy. **Esta es la razon de que no haya ORM**: un ORM abre una conexion TCP
   con un rol administrador y las policies no se evaluan en ese camino.
2. **Las policies de §4**, apoyadas en `current_restaurant_id()` y `is_superadmin()`, ambas
   `security definer` para evitar recursion.
3. **Los tests de aislamiento del paso 5**, que corren **antes** de que exista un solo CRUD. Un fallo
   de aislamiento descubierto en el paso 15 significa reescribir cada consulta.

Y una linea roja: **la `SUPABASE_SERVICE_ROLE_KEY` saltea RLS por completo y jamas llega al
navegador.** Solo aparece en `scripts/**` y `tests/helpers/**`. Nunca con prefijo `NEXT_PUBLIC_`,
nunca en un componente `"use client"`, nunca en un log. §20.1 tiene un gate que lo verifica sobre el
bundle construido.

---

## 9. ORDEN DE CONSTRUCCION

**Esta es la seccion para la que existe todo el blueprint.** Todo lo de arriba es contexto; esto es el
conjunto de instrucciones.

### Las reglas de un paso

1. **Un paso, una sentada.** Maximo ~5 archivos y ~6 criterios. Mas que eso son dos pasos.
2. **Todo paso lleva los cuatro campos:** `Hacer`, `Listo cuando`, `Verify`, `Checkpoint`.
3. **Los criterios son observables y decidibles por un script**, en forma EARS:
   **WHEN** `<disparador>` **THE SYSTEM SHALL** `<respuesta observable>`.
4. **"Se ve bien" esta prohibido.** Tambien "funciona", "esta implementado", "quedo cableado".
5. **`Verify` es shell literal**, con el resultado esperado en un comentario. **Todo comando corre
   desde la raiz del proyecto** y **sale con 0 cuando el paso esta bien**. Si el exito de un comando es
   un exit distinto de 0, se envuelve (`cmd; test $? -eq 1`): un `!` suelto acepta cualquier fallo,
   incluido el error de uso, y eso no es un gate.
6. Un paso no esta hecho hasta que pasan sus propios `Verify` **y siguen pasando los de los pasos
   anteriores**.
7. **Checkpoint en cada paso:** `git tag step-NN-<slug>`. Es el objetivo de rollback:
   `git reset --hard step-<N-1>-<slug>` y reintentar, nunca depurar hacia adelante.
8. **Nunca saltear.** Si un paso esta bloqueado, se frena y se reporta.
9. **Ningun `Verify` puede depender de lo que produce su propio `Checkpoint`.** El orden es
   Hacer → Listo cuando → Verify → Checkpoint: cuando corre el `Verify` los archivos del paso estan
   sin commitear y el tag no existe. Las afirmaciones sobre estado de git van en el `Checkpoint`,
   despues del commit, o en §20.1.
10. **Ningun paso introduce un requisito que rompa hacia atras el gate de un paso anterior.** Las
    variables de Cloudinary son opcionales hasta el paso 16 justamente por esto; §10 lo fija en su
    columna "Requerida por el paso".

### Un paso, una unidad — la regla de conteo

> **Un paso de §9 = una tarea de `tasks.json` = un bloque de tarea en un archivo de epica.**

Este build tiene **18 pasos**, por lo tanto **18 tareas** y **18 bloques de tarea**. Con 18 pasos el
reparto legal es de 2 a 3 epicas (`ceil(18÷9) = 2` como minimo, `floor(18÷5) = 3` como maximo). Se
usan **3**, cortadas por frontera de superficie:

| Epica | Pasos | Que cierra |
|---|---|---|
| `01-fundaciones` | 1–6 | Proyecto, tokens, esquema, RLS, aislamiento probado y la demo sembrada |
| `02-carta-publica` | 7–12 | Auth, la carta que ve el comensal y el video andando |
| `03-panel-y-lanzamiento` | 13–18 | El panel completo, la subida de video y el endurecimiento |

### Por que este orden y no otro

- **Auth (7) antes del panel (13–16)**: toda policy depende de saber quien sos.
- **RLS (4) y sus tests de aislamiento (5) antes de cualquier CRUD.** Una fuga entre restaurantes
  descubierta en el paso 14 obliga a reescribir cada consulta.
- **Carta publica (8–10) antes del video (11–12)**: el layout queda resuelto antes de que aterrice la
  parte cara.
- **El paso 1 arranca el servidor de verdad**, no solo lo compila: una contradiccion entre el
  manifiesto y el build se descubre en el primer gate, no en el octavo.
- **El seed (6) es un entregable**: `/brasa` es la demo de ventas.

### Mapa de pasos

| # | Paso | Depende de | Toca | Gate |
|---|---|---|---|---|
| 1 | Andamiaje, entorno y health check | — | `src/lib/env.ts`, `src/app/api/health/route.ts`, `scripts/smoke-http.sh`, `tests/unit/env.test.ts` | `pnpm build && bash scripts/smoke-http.sh /api/health 200` |
| 2 | Tokens de diseno y shell | 1 | `src/app/globals.css`, `src/app/layout.tsx`, `src/components/ui/brand-scope.tsx`, 2 tests | `pnpm test:e2e tests/e2e/shell.spec.ts` |
| 3 | Esquema y primera migracion | 1 | migracion, `tests/helpers/supabase-clients.ts`, `tests/integration/schema.test.ts`, health `?deep=1` | `pnpm db:push && pnpm test tests/integration/schema.test.ts` |
| 4 | Policies de RLS | 3 | migracion, `tests/integration/rls-enabled.test.ts` | `pnpm test tests/integration/rls-enabled.test.ts` |
| 5 | Tests de aislamiento | 4 | `tests/helpers/seed-two-restaurants.ts`, 2 tests de integracion | `pnpm test tests/integration` |
| 6 | Tipos generados y seed BRASA | 4 | `supabase/seed.sql`, `scripts/create-admin.ts`, `public/seed/**`, tipos, 1 test | `pnpm db:push && pnpm db:admin && pnpm test tests/integration/seed.test.ts` |
| 7 | Auth y proteccion de rutas | 6 | `src/lib/supabase/**`, `proxy.ts`, `src/lib/auth/require-admin.ts`, `src/app/admin/**` | `pnpm test:e2e tests/e2e/admin-auth.spec.ts` |
| 8 | Ruta publica `/[slug]` | 6 | `src/server/menu/queries.ts`, `page/loading/not-found`, 1 spec | `bash scripts/smoke-http.sh /brasa 200 /no-existe 404` |
| 9 | Grilla, posters y precio | 8 | `src/components/menu/**`, `src/lib/format/price.ts`, 2 tests | `pnpm test tests/unit/price.test.ts` |
| 10 | Plato a pantalla completa | 9 | ruta del plato, `dish-fullscreen.tsx`, 1 spec | `pnpm test:e2e tests/e2e/dish-view.spec.ts` |
| 11 | Abstraccion del proveedor de video | 10 | `src/lib/video/**`, `src/lib/env.ts`, 1 test | `pnpm test tests/unit/video-provider.test.ts` |
| 12 | Reproduccion HLS | 11 | `video-player.tsx`, ruta del plato, 1 spec | `pnpm test:e2e tests/e2e/video-player.spec.ts` |
| 13 | Panel: restaurantes | 7, 11 | `src/server/admin/restaurants.ts`, `src/app/admin/restaurantes/**`, 2 tests | `pnpm test tests/integration/admin-restaurants.test.ts` |
| 14 | Panel: categorias y reordenar | 13 | `src/server/admin/categories.ts`, `src/app/admin/categorias/**`, 2 tests | `pnpm test tests/integration/admin-categories.test.ts` |
| 15 | Panel: platos, reordenar, duplicar | 14 | `src/server/admin/dishes.ts`, `src/app/admin/platos/**`, 2 tests | `pnpm test tests/integration/admin-dishes.test.ts` |
| 16 | Subida firmada de video | 15, 12 | ruta de firma, `src/server/admin/video.ts`, `video-uploader.tsx`, 2 tests | `pnpm test tests/unit/cloudinary-signature.test.ts` |
| 17 | Performance, errores, a11y y CI | 16 | 2 fronteras de error, 2 specs, `.github/workflows/ci.yml` | `pnpm test:e2e` completo |
| 18 | Tarea anti-pausa del proyecto gratis | 17 | `src/app/api/keep-alive/route.ts`, `vercel.json`, 1 test | `pnpm test tests/integration/keep-alive.test.ts` |

---

#### Paso 1 — Andamiaje, validacion de entorno y health check ejecutable

**Hacer**
El andamiaje lo hizo §10 Bootstrap. Este paso escribe el primer codigo propio y **prueba que el
artefacto construido arranca de verdad**.
- `src/lib/env.ts` — `serverEnvSchema` (zod) y `loadServerEnv(source = process.env)`. **Perezosa: no
  corre al importar.** Exige solo las tres variables de Supabase; todo lo de Cloudinary es opcional
  con default y se vuelve obligatorio recien en el paso 16 (regla 10 de arriba y la columna
  "Requerida por el paso" de §10).
- `src/app/api/health/route.ts` — `GET` que devuelve `{"ok":true,"service":"carta"}` con 200. No
  importa `env.ts`: tiene que responder aunque el entorno este a medias.
- `scripts/smoke-http.sh` — arranca el build en el puerto 3100, espera `/api/health`, verifica que el
  cuerpo contenga `"ok":true`, recorre los pares `RUTA ESTADO` que reciba, baja el servidor y sale 0/1.
- `tests/unit/env.test.ts` — parsea objetos fijos contra el esquema, sin tocar `process.env`.

**Listo cuando**
- [ ] WHEN `pnpm install --frozen-lockfile` corre THE SYSTEM SHALL salir con 0 sin modificar `pnpm-lock.yaml`.
- [ ] WHEN `pnpm lint` corre sobre el arbol completo con el bundle presente en `blueprints/` THE SYSTEM SHALL salir con 0 sin errores ni advertencias.
- [ ] WHEN `serverEnvSchema` parsea un objeto sin `NEXT_PUBLIC_SUPABASE_URL` THE SYSTEM SHALL fallar el parseo y nombrar esa variable en el resultado.
- [ ] WHEN `serverEnvSchema` parsea un objeto con las tres variables de Supabase y ninguna de Cloudinary THE SYSTEM SHALL parsear con exito y devolver `VIDEO_PROVIDER` igual a `direct`.
- [ ] WHEN se hace `GET /api/health` contra el servidor de produccion recien construido THE SYSTEM SHALL responder 200 con un cuerpo que contiene `"ok":true`.
- [ ] WHEN se hace `GET /ruta-que-no-existe` contra ese mismo servidor THE SYSTEM SHALL responder 404.

**Verify**
```bash
pnpm install --frozen-lockfile   # expect: exit 0, no toca el lockfile
pnpm typecheck                   # expect: exit 0
pnpm lint                        # expect: exit 0, 0 errores 0 warnings
pnpm test tests/unit/env.test.ts # expect: exit 0, 0 failed, 0 skipped
pnpm build                       # expect: exit 0
bash scripts/smoke-http.sh /api/health 200 /ruta-que-no-existe 404
# expect: exit 0 — arranca el build, /api/health da 200 con "ok":true y la ruta inexistente 404
```

**Checkpoint**
```bash
git add -A && git commit -m "step 1: andamiaje, entorno y health check"
git tag step-01-scaffold
git ls-files --error-unmatch scripts/smoke-http.sh   # expect: exit 0 — commiteado una linea arriba
```

---

#### Paso 2 — Tokens de diseno, shell y color de marca validado

**Hacer**
- `src/app/globals.css` (editar) — `@import "tailwindcss";` mas `@theme` con **todos** los tokens de
  §7, el bloque `prefers-reduced-motion` y el foco visible global.
- `src/app/layout.tsx` (editar) — `<html lang="es">` con el tema oscuro ya en el HTML del servidor,
  Inter por `next/font/google` (`subsets: ["latin"]`, `weight: ["400","600","700"]`,
  `display: "swap"`), enlace "Saltar al contenido" como primer elemento enfocable, `<main id="contenido">`.
- `src/components/ui/brand-scope.tsx` — Server Component que valida el color con
  `z.string().regex(/^#[0-9A-Fa-f]{6}$/)` y lo inyecta como `style={{ "--color-brand": color }}`.
  Exporta `parseBrandColor(input: unknown): string`, que ante cualquier entrada invalida devuelve
  `#E8562A` **sin propagar un solo caracter de la entrada**.
- `tests/unit/brand-color.test.ts` y `tests/e2e/shell.spec.ts`.

**Listo cuando**
- [ ] WHEN `parseBrandColor("#E8562A")` se ejecuta THE SYSTEM SHALL devolver exactamente `#E8562A`.
- [ ] WHEN `parseBrandColor` recibe `"red; background: url(javascript:alert(1))"` THE SYSTEM SHALL devolver exactamente `#E8562A` y no propagar ningun caracter de la entrada.
- [ ] WHEN `parseBrandColor` recibe `"#E8562"`, `"E8562A"`, `null` o `undefined` THE SYSTEM SHALL devolver exactamente `#E8562A` en los cuatro casos.
- [ ] WHEN la pagina raiz se carga a 375px de ancho THE SYSTEM SHALL cumplir `document.documentElement.scrollWidth === document.documentElement.clientWidth`.
- [ ] WHEN la pagina raiz se carga a 1440px de ancho THE SYSTEM SHALL cumplir la misma igualdad.
- [ ] WHEN se presiona Tab una vez sobre la pagina recien cargada THE SYSTEM SHALL enfocar el enlace "Saltar al contenido" y hacerlo visible.

**Verify**
```bash
pnpm test tests/unit/brand-color.test.ts   # expect: exit 0, 0 failed, 0 skipped
pnpm lint                                  # expect: exit 0 — prueba que biome parsea el @theme
pnpm typecheck                             # expect: exit 0
pnpm test:e2e tests/e2e/shell.spec.ts      # expect: exit 0, 0 failed (mobile y desktop)
```

**Checkpoint**
```bash
git add -A && git commit -m "step 2: tokens de diseno, shell y color de marca validado"
git tag step-02-tokens-shell
git ls-files --error-unmatch src/components/ui/brand-scope.tsx   # expect: exit 0
```

---

#### Paso 3 — Esquema y primera migracion

**Hacer**
- Crear el archivo con `pnpm exec supabase migration new schema_inicial` y **leer de la salida el
  nombre que eligio la CLI** (lleva timestamp; no se inventa). Pegar adentro el **primer bloque SQL de
  §4 completo**: extension, `set_updated_at`, las cuatro tablas con sus constraints, los cinco
  indices, los cuatro triggers y `notify pgrst, 'reload schema';`.
- `tests/helpers/supabase-clients.ts` — `anonClient()`, `serviceClient()`, `authedClient(email, password)`,
  todos con `createClient` de `@supabase/supabase-js`. **No importan `src/lib/supabase/server.ts`**,
  que necesita `next/headers`.
- `tests/integration/schema.test.ts` — afirma **propiedades por entidad**, nunca un conteo de tablas.
- `src/app/api/health/route.ts` (editar) — rama `?deep=1` que pinguea la base con el cliente anonimo y
  agrega `"db":"up"`, o 503 si no responde. **Sin `deep=1` sigue devolviendo 200**, para no romper el
  gate del paso 1.

**Listo cuando**
- [ ] WHEN `pnpm db:push` corre contra el proyecto de Supabase enlazado THE SYSTEM SHALL salir con 0 y aplicar todas las migraciones pendientes.
- [ ] WHEN `pnpm db:push` se corre una segunda vez sin migraciones nuevas THE SYSTEM SHALL salir con 0 sin aplicar nada.
- [ ] WHEN el test consulta cada una de las cuatro entidades del modelo (`restaurants`, `categories`, `dishes`, `profiles`) THE SYSTEM SHALL responder sin error en las cuatro.
- [ ] WHEN se inserta un plato con `price` igual a `1350000` y se lo vuelve a leer THE SYSTEM SHALL devolver exactamente `1350000` como entero.
- [ ] WHEN se inserta un restaurante con `primary_color` igual a `"rojo"` THE SYSTEM SHALL rechazar la escritura y dejar la cantidad de filas de `restaurants` sin cambios.
- [ ] WHEN se intenta borrar una categoria que tiene al menos un plato THE SYSTEM SHALL rechazar el borrado y dejar la categoria y sus platos en la base.
- [ ] WHEN se hace `GET /api/health?deep=1` con la base arriba THE SYSTEM SHALL responder 200 con un cuerpo que contiene `"db":"up"`.

**Verify**
```bash
pnpm db:push                                 # expect: exit 0, aplica migraciones al proyecto enlazado
pnpm db:push                                 # expect: exit 0 — idempotente, nada pendiente
pnpm test tests/integration/schema.test.ts   # expect: exit 0, 0 failed, 0 skipped
pnpm typecheck                               # expect: exit 0
pnpm build                                   # expect: exit 0
bash scripts/smoke-http.sh /api/health 200 "/api/health?deep=1" 200
# expect: exit 0 — el health sin deep sigue en 200 y el deep tambien
```

**Checkpoint**
```bash
git add -A && git commit -m "step 3: esquema y primera migracion"
git tag step-03-schema
test "$(git ls-files supabase/migrations | wc -l)" -ge 1   # expect: exit 0 — la migracion quedo commiteada
```

---

#### Paso 4 — Policies de RLS

**Hacer**
- Crear el archivo con `pnpm exec supabase migration new rls_policies` y pegar adentro el **segundo
  bloque SQL de §4 completo**: los cuatro `enable row level security`, `public.current_restaurant_id()`
  y `public.is_superadmin()` (ambas `security definer` — consultar `profiles` dentro de una policy de
  `profiles` seria recursion infinita) con sus `grant`, las policies de las cuatro tablas **cada una
  con `using` y `with check`** donde corresponde, `public.rls_status()` con su `revoke`/`grant` a
  `service_role`, y `notify pgrst, 'reload schema';`.
- `tests/integration/rls-enabled.test.ts`.

**Listo cuando**
- [ ] WHEN `pnpm db:push` corre THE SYSTEM SHALL salir con 0 aplicando tambien la migracion de policies.
- [ ] WHEN el cliente de servicio llama `rls_status()` THE SYSTEM SHALL devolver una fila con `rls_enabled` en `true` para cada una de las cuatro entidades del modelo.
- [ ] WHEN el cliente de servicio llama `rls_status()` THE SYSTEM SHALL devolver `policy_count` mayor o igual a 1 para cada una de esas cuatro entidades.
- [ ] WHEN el cliente anonimo llama `rls_status()` THE SYSTEM SHALL devolver un error y ningun dato.
- [ ] WHEN el cliente anonimo lee `profiles` THE SYSTEM SHALL devolver cero filas.

**Verify**
```bash
pnpm db:push                                      # expect: exit 0
pnpm test tests/integration/rls-enabled.test.ts   # expect: exit 0, 0 failed, 0 skipped
pnpm test tests/integration/schema.test.ts        # expect: exit 0 — el gate del paso 3 sigue verde
pnpm typecheck                                    # expect: exit 0
pnpm lint                                         # expect: exit 0
```

**Checkpoint**
```bash
git add -A && git commit -m "step 4: policies de RLS"
git tag step-04-rls
git ls-files --error-unmatch tests/integration/rls-enabled.test.ts   # expect: exit 0
```

---

#### Paso 5 — Tests de aislamiento entre restaurantes

**Hacer**
No agrega feature: agrega la prueba de que el aislamiento existe, **antes** de cualquier CRUD.
- `tests/helpers/seed-two-restaurants.ts` — crea con el cliente de servicio dos restaurantes
  independientes, una categoria y un plato `ready` en cada uno, y un usuario `owner` por restaurante
  con su fila en `profiles`. Devuelve ids, credenciales y `cleanup()`. **No toca los datos de BRASA.**
- `tests/integration/isolation-read.test.ts` y `tests/integration/isolation-write.test.ts`.

Cada afirmacion negativa se confirma **dos veces**: la respuesta del cliente de A y el estado real de
la fila leido con el cliente de servicio. Un `update` que RLS filtra devuelve exito con cero filas
afectadas, asi que la lectura posterior es lo que prueba que no paso nada.

**Listo cuando**
- [ ] WHEN el owner del restaurante A lista `dishes` THE SYSTEM SHALL devolver unicamente filas cuyo `restaurant_id` sea el de A.
- [ ] WHEN el owner de A pide por id un plato del restaurante B THE SYSTEM SHALL devolver cero filas, no un error 403.
- [ ] WHEN el owner de A hace `update` sobre un plato de B THE SYSTEM SHALL dejar ese plato con exactamente los mismos valores leidos despues con el cliente de servicio.
- [ ] WHEN el owner de A hace `delete` sobre una categoria de B THE SYSTEM SHALL dejar esa categoria existiendo en la base.
- [ ] WHEN el owner de A inserta un plato con `restaurant_id` igual al de B THE SYSTEM SHALL devolver error y no crear ninguna fila con ese `restaurant_id`.
- [ ] WHEN el cliente anonimo lista `dishes` de un restaurante con `is_active` en `false` THE SYSTEM SHALL devolver cero filas.

**Verify**
```bash
pnpm test tests/integration/isolation-read.test.ts    # expect: exit 0, 0 failed, 0 skipped
pnpm test tests/integration/isolation-write.test.ts   # expect: exit 0, 0 failed, 0 skipped
pnpm test tests/integration                           # expect: exit 0 — toda la integracion junta
pnpm typecheck                                        # expect: exit 0
pnpm lint                                             # expect: exit 0
```

**Checkpoint**
```bash
git add -A && git commit -m "step 5: tests de aislamiento entre restaurantes"
git tag step-05-isolation
git ls-files --error-unmatch tests/helpers/seed-two-restaurants.ts   # expect: exit 0
```

---

#### Paso 6 — Tipos generados y seed BRASA (la demo de ventas)

**Hacer**
**Este paso produce la pantalla que se le muestra a un restaurante candidato.**
- `supabase/seed.sql` — BRASA (`slug: brasa`, `currency: ARS`, `primary_color: #E8562A`,
  `plan: basico`, `is_active: true`, id `b0000000-0000-4000-8000-000000000001`), 4 categorias
  (`Para empezar`, `De la parrilla`, `Guarniciones`, `Postres`, ids `c0000000-0000-4000-8000-00000000000{1..4}`)
  y **12 platos** (ids `d0000000-0000-4000-8000-0000000000{01..12}`) con `price` entero en centavos y
  precios reales de Buenos Aires, `description` concreta, `pairing_text` en primera persona y en
  rioplatense, `thumbnail_url` igual a `/seed/<slug-del-plato>.svg`, `video_playback_id` igual a
  `seed/<slug-del-plato>`, `video_status` en `'ready'` e `is_available` en `true`. Los ids son fijos
  porque hay tests que los referencian. **Los platos se eligen por una sola regla: comida que gana con
  el movimiento y pierde en una foto** — provoleta burbujeando, ojo de bife abriendose bajo el
  cuchillo, humo saliendo de la parrilla.
- `public/seed/**` — un SVG 4:5 por plato (`viewBox="0 0 480 600"`), degrade `#131316` → `#0A0A0B`,
  nombre en Inter 600, barra `#E8562A`. SVG y no fotos: se escriben como texto, pesan poco y funcionan
  sin red, de lo que dependen el test de la grilla y el de presupuesto de bytes.
- `scripts/create-admin.ts` — crea o asegura el admin local con `supabase.auth.admin.createUser()` y
  su fila en `profiles` con `role = 'superadmin'`. Idempotente. **Rutas relativas con `.ts`, nunca el
  alias `@/`.**
- `src/lib/supabase/database.types.ts` — generado por `pnpm db:types`, commiteado, nunca editado a mano.
- `tests/integration/seed.test.ts`.

**Listo cuando**
- [ ] WHEN `pnpm db:push` corre dos veces seguidas THE SYSTEM SHALL dejar exactamente un restaurante con `slug` igual a `brasa`, con `is_active` en `true` y `primary_color` igual a `#E8562A`.
- [ ] WHEN el test lista las categorias de BRASA THE SYSTEM SHALL devolver 4 filas con `sort_order` distintos entre si.
- [ ] WHEN el test lista los platos de BRASA THE SYSTEM SHALL devolver 12 filas, todas con `video_status` igual a `ready` y `price` mayor que 0.
- [ ] WHEN el test recorre los 12 platos de BRASA THE SYSTEM SHALL encontrar en cada uno un `pairing_text` no nulo de mas de 20 caracteres y un `thumbnail_url` que empieza con `/seed/`.
- [ ] WHEN el test resuelve cada `thumbnail_url` de BRASA contra el directorio `public/` THE SYSTEM SHALL encontrar el archivo SVG correspondiente en disco.
- [ ] WHEN `pnpm db:admin` corre dos veces seguidas THE SYSTEM SHALL salir con 0 las dos veces y dejar exactamente una fila en `profiles` con `role` igual a `superadmin`.

**Verify**
```bash
pnpm db:push                               # expect: exit 0, migraciones + seed
pnpm db:push                               # expect: exit 0 — el seed es idempotente, no duplica BRASA
pnpm db:admin                              # expect: exit 0
pnpm db:admin                              # expect: exit 0 — idempotente, segunda corrida
pnpm db:types                              # expect: exit 0, reescribe database.types.ts
pnpm test tests/integration/seed.test.ts   # expect: exit 0, 0 failed, 0 skipped
pnpm typecheck                             # expect: exit 0 — los tipos generados compilan
pnpm test tests/integration                # expect: exit 0 — los gates 3, 4 y 5 siguen verdes
```

**Checkpoint**
```bash
git add -A && git commit -m "step 6: tipos generados y seed BRASA"
git tag step-06-types-seed
git ls-files --error-unmatch supabase/seed.sql                   # expect: exit 0
git ls-files --error-unmatch src/lib/supabase/database.types.ts  # expect: exit 0 — generado pero commiteado
test "$(git ls-files public/seed | wc -l)" -ge 12                # expect: exit 0 — los 12 posters commiteados
```

---

#### Paso 7 — Auth de Supabase y proteccion de rutas del panel

**Hacer**
- `src/lib/supabase/server.ts` — `createServerSupabase()` con `createServerClient` de `@supabase/ssr`
  y las cookies de `next/headers`.
- `src/lib/supabase/client.ts` — `createBrowserClient` para el formulario de login.
- **`proxy.ts`** — exporta `proxy`, refresca la cookie de sesion, con `matcher` que excluye assets
  estaticos. **No es `middleware.ts`: ese archivo no existe en Next 16.**
- `src/lib/auth/require-admin.ts` — `requireAdmin()`: devuelve `{ userId, restaurantId, role }` o
  redirige. Es el unico guard.
- `src/app/admin/**` — `layout.tsx` (llama `requireAdmin()` **en el servidor**,
  `export const dynamic = "force-dynamic"`), `login/page.tsx` y las Server Actions de entrar y salir.
  **No hay pantalla de alta.**

**Listo cuando**
- [ ] WHEN una peticion anonima llega a `/admin/platos` THE SYSTEM SHALL responder con una redireccion a `/admin/login` llevando la ruta original en el parametro `next`.
- [ ] WHEN el usuario admin sembrado envia email y contrasena correctos en `/admin/login` THE SYSTEM SHALL redirigir a `/admin/platos` y dejar una cookie de sesion `HttpOnly`.
- [ ] WHEN se envian credenciales incorrectas en `/admin/login` THE SYSTEM SHALL volver a mostrar el formulario con el texto `Email o contrasena incorrectos` sin indicar cual de los dos fallo.
- [ ] WHEN un usuario con sesion valida pero sin fila en `profiles` carga `/admin/platos` THE SYSTEM SHALL cerrar su sesion y mostrar `Tu usuario no tiene un perfil asignado`.
- [ ] WHEN el usuario autenticado usa la accion de cerrar sesion THE SYSTEM SHALL redirigir a `/admin/login` y la siguiente carga de `/admin/platos` SHALL volver a redirigir al login.
- [ ] WHEN el repositorio se busca por el archivo `middleware.ts` THE SYSTEM SHALL no encontrarlo, porque en Next 16 el archivo es `proxy.ts` y exporta `proxy`.

**Verify**
```bash
pnpm typecheck                                 # expect: exit 0
pnpm lint                                      # expect: exit 0
test -f proxy.ts                               # expect: exit 0
test ! -f middleware.ts                        # expect: exit 0 — Next 16 no usa ese nombre
pnpm test:e2e tests/e2e/admin-auth.spec.ts     # expect: exit 0, 0 failed
```

**Checkpoint**
```bash
git add -A && git commit -m "step 7: auth y proteccion de rutas"
git tag step-07-auth
git ls-files --error-unmatch proxy.ts   # expect: exit 0
```

---

#### Paso 8 — Ruta publica `/[slug]`

**Hacer**
- `src/server/menu/queries.ts` — `getMenuBySlug(slug)` con el cliente **anonimo**, de modo que las
  policies hagan el filtrado. Dos consultas en paralelo, nunca en secuencia.
- `src/app/[slug]/page.tsx` — Server Component, `export const revalidate = 60`,
  `export const dynamicParams = true`, envuelto en `BrandScope`.
- `src/app/[slug]/loading.tsx` — esqueleto con las **medidas reales** de la grilla (4:5, dos columnas):
  un esqueleto de altura equivocada es peor que un spinner.
- `src/app/[slug]/not-found.tsx` — 404 real para slug inexistente o restaurante inactivo.
- `tests/e2e/public-menu.spec.ts`.

**Listo cuando**
- [ ] WHEN un visitante anonimo carga `/brasa` THE SYSTEM SHALL responder 200 y el HTML del servidor SHALL contener el nombre del restaurante antes de que corra ningun script de cliente.
- [ ] WHEN un visitante carga `/no-existe` THE SYSTEM SHALL responder 404 y mostrar la pantalla de restaurante inexistente, sin lanzar una excepcion.
- [ ] WHEN un visitante carga el slug de un restaurante con `is_active` en `false` THE SYSTEM SHALL responder 404.
- [ ] WHEN un restaurante existe y esta activo pero no tiene ningun plato con `video_status` igual a `ready` THE SYSTEM SHALL responder 200 y mostrar el texto `Estamos preparando la carta`.
- [ ] WHEN `/brasa` se renderiza THE SYSTEM SHALL emitir exactamente un elemento `h1` y una etiqueta `title` unica que incluye el nombre del restaurante.

**Verify**
```bash
pnpm typecheck                                  # expect: exit 0
pnpm lint                                       # expect: exit 0
pnpm build                                      # expect: exit 0
bash scripts/smoke-http.sh /brasa 200 /no-existe 404   # expect: exit 0
pnpm test:e2e tests/e2e/public-menu.spec.ts     # expect: exit 0, 0 failed
```

**Checkpoint**
```bash
git add -A && git commit -m "step 8: ruta publica /[slug]"
git tag step-08-public-route
git ls-files --error-unmatch src/server/menu/queries.ts   # expect: exit 0
```

---

#### Paso 9 — Grilla de platos, posters, chips de categoria y formato de precio

**Hacer**
- `src/components/menu/**` — `category-nav.tsx` (unico componente cliente de la pantalla, filtra sin
  volver al servidor), `dish-card.tsx` y `dish-grid.tsx`. Poster 4:5 con `<img>` plano —**nunca
  `next/image`**, que bloquea SVG y cobra por transformacion en Vercel— con `width`, `height`, `alt`,
  `decoding="async"`; la **primera fila** con `loading="eager"` y `fetchpriority="high"`, el resto
  `loading="lazy"`.
- `src/lib/format/price.ts` — `formatPrice(cents, currency)` segun el contrato de §5. **Sin `Intl`.**
- `tests/unit/price.test.ts` y `tests/e2e/dish-grid.spec.ts`.

**Listo cuando**
- [ ] WHEN `formatPrice(1350000, "ARS")` se ejecuta THE SYSTEM SHALL devolver exactamente la cadena `$ 13.500,00`.
- [ ] WHEN `formatPrice(0, "ARS")` se ejecuta THE SYSTEM SHALL devolver exactamente la cadena `$ 0,00`.
- [ ] WHEN `formatPrice(380000, "USD")` se ejecuta THE SYSTEM SHALL devolver exactamente la cadena `US$ 3.800,00`.
- [ ] WHEN `/brasa` se carga THE SYSTEM SHALL renderizar 12 tarjetas de plato, cada una con un elemento `img` que tiene atributo `alt` no vacio, `width` y `height`.
- [ ] WHEN `/brasa` se carga THE SYSTEM SHALL no contener ningun elemento `video` en el documento.
- [ ] WHEN se toca un chip de categoria THE SYSTEM SHALL mostrar unicamente las tarjetas de esa categoria y marcar el chip con `aria-current` igual a `true`.

**Verify**
```bash
pnpm test tests/unit/price.test.ts             # expect: exit 0, 0 failed, 0 skipped
pnpm typecheck                                 # expect: exit 0
pnpm lint                                      # expect: exit 0
pnpm test:e2e tests/e2e/dish-grid.spec.ts      # expect: exit 0, 0 failed
```

**Checkpoint**
```bash
git add -A && git commit -m "step 9: grilla de platos, posters y precio"
git tag step-09-dish-grid
git ls-files --error-unmatch src/lib/format/price.ts   # expect: exit 0
```

---

#### Paso 10 — Plato a pantalla completa (todavia sin video)

**Hacer**
- `src/app/[slug]/plato/[dishId]/page.tsx` — Server Component, `export const revalidate = 60`. **El
  plato es una ruta, no un booleano**: se comparte, se recarga y se indexa.
- `src/components/menu/dish-fullscreen.tsx` — layout 9:16 con el poster, nombre, precio formateado,
  descripcion y el **`pairing_text` con tratamiento propio**: un `blockquote` con barra vertical de
  3px en `--color-brand`, 16px de padding, italica de 18px y el nombre del restaurante debajo en 12px
  atenuado. Mas el control de cerrar, que vuelve a `/[slug]`.
- `tests/e2e/dish-view.spec.ts`.

**Listo cuando**
- [ ] WHEN se toca una tarjeta de plato en `/brasa` THE SYSTEM SHALL navegar a `/brasa/plato/<id>` y esa URL sola SHALL renderizar el mismo plato al recargarla.
- [ ] WHEN `/brasa/plato/<id>` se renderiza THE SYSTEM SHALL mostrar el nombre, el precio formateado, la descripcion y el `pairing_text` del plato.
- [ ] WHEN el plato tiene `pairing_text` THE SYSTEM SHALL renderizarlo dentro de un elemento `blockquote` acompanado del nombre del restaurante.
- [ ] WHEN se pide `/brasa/plato/<id>` con un id que no existe THE SYSTEM SHALL responder 404.
- [ ] WHEN se pide el id de un plato de otro restaurante bajo el slug `brasa` THE SYSTEM SHALL responder 404.
- [ ] WHEN se usa el control de cerrar THE SYSTEM SHALL volver a `/brasa`.

**Verify**
```bash
pnpm typecheck   # expect: exit 0
pnpm lint        # expect: exit 0
pnpm build       # expect: exit 0
bash scripts/smoke-http.sh /brasa/plato/d0000000-0000-4000-8000-000000000001 200 /brasa/plato/d0000000-0000-4000-8000-000000000099 404
# expect: exit 0 — un plato sembrado responde 200 y un id inexistente 404
pnpm test:e2e tests/e2e/dish-view.spec.ts   # expect: exit 0, 0 failed
```

**Checkpoint**
```bash
git add -A && git commit -m "step 10: plato a pantalla completa"
git tag step-10-dish-sheet
git ls-files --error-unmatch src/components/menu/dish-fullscreen.tsx   # expect: exit 0
```

---

#### Paso 11 — Abstraccion del proveedor de video

**Hacer**
- `src/lib/video/provider.ts` — el tipo `VideoProvider` (`name`, `playbackUrl(id)`,
  `posterUrl(id, { width, ratio })`) y `getVideoProvider()`, que elige segun `VIDEO_PROVIDER`.
- `src/lib/video/cloudinary-provider.ts` — **unico archivo del proyecto que puede importar el SDK
  `cloudinary`**. Arma las URLs de entrega como strings:
  `https://res.cloudinary.com/<cloud>/video/upload/sp_<perfil>/<publicId>.m3u8` y
  `https://res.cloudinary.com/<cloud>/video/upload/so_1,c_fill,ar_<ratio>,w_<width>,q_auto,f_auto/<publicId>.jpg`.
- `src/lib/video/direct-url-provider.ts` — trata el `playbackId` como ruta directa; es lo que permite
  que la suite corra sin salir a la red.
- `src/lib/env.ts` (editar) — `VIDEO_PROVIDER` con default `direct` y las variables de Cloudinary como
  opcionales.
- `tests/unit/video-provider.test.ts`.

**Listo cuando**
- [ ] WHEN `VIDEO_PROVIDER` vale `direct` y se pide la fabrica THE SYSTEM SHALL devolver un proveedor cuyo `name` es `direct`.
- [ ] WHEN `VIDEO_PROVIDER` vale `cloudinary` y las tres variables de Cloudinary estan presentes THE SYSTEM SHALL devolver un proveedor cuyo `name` es `cloudinary`.
- [ ] WHEN `VIDEO_PROVIDER` vale `cloudinary` y falta `CLOUDINARY_CLOUD_NAME` THE SYSTEM SHALL lanzar un error que nombra esa variable.
- [ ] WHEN el proveedor `cloudinary` arma la URL de reproduccion de `carta/dev/ojo-de-bife` THE SYSTEM SHALL devolver una cadena que termina en `.m3u8` y contiene el perfil de streaming configurado.
- [ ] WHEN el proveedor `cloudinary` arma el poster de un id con relacion `4:5` THE SYSTEM SHALL devolver una cadena que termina en `.jpg` y contiene `ar_4:5`.
- [ ] WHEN el repositorio se busca por importaciones del paquete `cloudinary` fuera de `src/lib/video/cloudinary-provider.ts` THE SYSTEM SHALL no encontrar ninguna.

**Verify**
```bash
pnpm test tests/unit/video-provider.test.ts   # expect: exit 0, 0 failed, 0 skipped
pnpm typecheck                                # expect: exit 0
pnpm lint                                     # expect: exit 0
grep -rn "from \"cloudinary\"" src --include=*.ts --include=*.tsx | grep -v "src/lib/video/cloudinary-provider.ts"; test $? -eq 1
# expect: exit 0 — codigo 1 de grep significa "ningun otro archivo importa el SDK"
```

**Checkpoint**
```bash
git add -A && git commit -m "step 11: abstraccion del proveedor de video"
git tag step-11-video-provider
git ls-files --error-unmatch src/lib/video/provider.ts   # expect: exit 0
```

---

#### Paso 12 — Reproduccion HLS

**Hacer**
- `src/components/menu/video-player.tsx` — `"use client"`. Si el navegador soporta HLS nativo
  (`video.canPlayType("application/vnd.apple.mpegurl")`) usa eso y **no carga `hls.js`**; si no,
  importa `hls.js` **dinamicamente** para que no pese en el bundle inicial. `preload="none"`, `loop`,
  arranca **muteado** con control de sonido visible. Camino de error obligatorio: el poster se queda y
  aparece un boton de reintento.
- `src/app/[slug]/plato/[dishId]/page.tsx` (editar) — resuelve la URL con `getVideoProvider()` y monta
  el reproductor.
- `tests/e2e/video-player.spec.ts`.

**Listo cuando**
- [ ] WHEN se abre `/brasa/plato/<id>` THE SYSTEM SHALL mostrar el poster antes de que exista ningun dato de video cargado.
- [ ] WHEN el reproductor arranca THE SYSTEM SHALL tener el elemento `video` con `muted` en `true` y un control visible para activar el sonido.
- [ ] WHEN el manifiesto de video no se puede cargar THE SYSTEM SHALL mantener el poster visible y mostrar el texto `No pudimos cargar el video` junto a un boton de reintento.
- [ ] WHEN la grilla `/brasa` se carga THE SYSTEM SHALL no solicitar ningun recurso cuyo nombre termine en `.m3u8`.
- [ ] WHEN el navegador declara `prefers-reduced-motion` en `reduce` THE SYSTEM SHALL no reproducir automaticamente y mostrar un boton de reproduccion sobre el poster.

**Verify**
```bash
pnpm typecheck                                  # expect: exit 0
pnpm lint                                       # expect: exit 0
pnpm test:e2e tests/e2e/video-player.spec.ts    # expect: exit 0, 0 failed
pnpm test:e2e tests/e2e/dish-grid.spec.ts       # expect: exit 0 — el gate del paso 9 sigue verde
```

**Checkpoint**
```bash
git add -A && git commit -m "step 12: reproduccion HLS"
git tag step-12-hls
git ls-files --error-unmatch src/components/menu/video-player.tsx   # expect: exit 0
```

---

#### Paso 13 — Panel: CRUD de restaurantes

**Hacer**
- `src/server/admin/restaurants.ts` — capa de servicio sin conciencia de HTTP:
  `createRestaurant`, `updateRestaurant`, `toggleRestaurantActive`. Cada una en el mismo orden:
  `requireAdmin()` → zod `.strict()` → comprobar rol → escribir → `revalidatePath()`. Devuelven
  `{ ok, data } | { ok: false, error: { code, message, details? } }` con los codigos de §5.
- `src/app/admin/restaurantes/**` — lista, formulario y sus Server Actions.
- `tests/integration/admin-restaurants.test.ts` y `tests/e2e/admin-restaurants.spec.ts`.

El choque de `slug` llega como error de Postgres y se traduce a `conflict`; **no se pregunta antes**,
porque preguntar antes es una condicion de carrera.

**Listo cuando**
- [ ] WHEN un `superadmin` crea un restaurante con datos validos THE SYSTEM SHALL insertar exactamente una fila y devolver `{ ok: true }`.
- [ ] WHEN se crea un restaurante con un `slug` que ya existe THE SYSTEM SHALL devolver `{ ok: false }` con `code` igual a `conflict` y no insertar ninguna fila.
- [ ] WHEN se crea un restaurante con `primary_color` igual a `"rojo"` THE SYSTEM SHALL devolver `{ ok: false }` con `code` igual a `validation_error` y un `details` que nombra el campo `primary_color`.
- [ ] WHEN un usuario con rol `owner` invoca la accion de crear restaurante THE SYSTEM SHALL devolver `{ ok: false }` con `code` igual a `forbidden` y no insertar ninguna fila.
- [ ] WHEN un `superadmin` pone `is_active` en `false` THE SYSTEM SHALL hacer que la carta publica de ese slug responda 404 en la siguiente carga.

**Verify**
```bash
pnpm test tests/integration/admin-restaurants.test.ts   # expect: exit 0, 0 failed, 0 skipped
pnpm typecheck                                          # expect: exit 0
pnpm lint                                               # expect: exit 0
pnpm test:e2e tests/e2e/admin-restaurants.spec.ts       # expect: exit 0, 0 failed
```

**Checkpoint**
```bash
git add -A && git commit -m "step 13: panel de restaurantes"
git tag step-13-admin-restaurants
git ls-files --error-unmatch src/server/admin/restaurants.ts   # expect: exit 0
```

---

#### Paso 14 — Panel: categorias, reordenar y borrado bloqueado

**Hacer**
- `src/server/admin/categories.ts` — `createCategory`, `updateCategory`, `deleteCategory`,
  `moveCategory`. El `restaurant_id` **sale del actor, nunca del formulario**. `deleteCategory` cuenta
  los platos primero para poder decir cuantos bloquean, y traduce el rechazo de `on delete restrict` a
  `conflict`.
- `src/app/admin/categorias/**` — lista con botones subir/bajar (**nunca arrastrar**: WCAG 2.5.7 exige
  alternativa de un solo puntero, y con botones se cargan 40 platos mas rapido).
- `tests/integration/admin-categories.test.ts` y `tests/e2e/admin-categories.spec.ts`.

**Listo cuando**
- [ ] WHEN el owner crea una categoria con nombre valido THE SYSTEM SHALL insertar una fila con el `restaurant_id` de su propio restaurante, sin importar lo que venga en el formulario.
- [ ] WHEN el owner intenta borrar una categoria que tiene 3 platos THE SYSTEM SHALL devolver `{ ok: false }` con `code` igual a `conflict` y un `message` que incluye el numero 3.
- [ ] WHEN el owner borra una categoria sin platos THE SYSTEM SHALL eliminar exactamente esa fila.
- [ ] WHEN el owner usa el control de subir sobre la segunda categoria THE SYSTEM SHALL intercambiar su `sort_order` con el de la primera y dejar todos los `sort_order` distintos entre si.
- [ ] WHEN el owner usa el control de subir sobre la primera categoria THE SYSTEM SHALL dejar el orden sin cambios y no devolver error.
- [ ] WHEN el owner de otro restaurante invoca la accion de borrar esa categoria THE SYSTEM SHALL devolver `{ ok: false }` con `code` igual a `not_found` y dejar la categoria en la base.

**Verify**
```bash
pnpm test tests/integration/admin-categories.test.ts   # expect: exit 0, 0 failed, 0 skipped
pnpm typecheck                                         # expect: exit 0
pnpm lint                                              # expect: exit 0
pnpm test:e2e tests/e2e/admin-categories.spec.ts       # expect: exit 0, 0 failed
```

**Checkpoint**
```bash
git add -A && git commit -m "step 14: panel de categorias"
git tag step-14-admin-categories
git ls-files --error-unmatch src/server/admin/categories.ts   # expect: exit 0
```

---

#### Paso 15 — Panel: platos, reordenar y duplicar

**Hacer**
- `src/server/admin/dishes.ts` — `createDish`, `updateDish`, `deleteDish`, `moveDish`, `duplicateDish`.
  **Duplicar es una feature de negocio, no una comodidad**: el cuello de botella real es filmar y
  cargar 40 platos. El duplicado copia `category_id`, `price`, `description` y `pairing_text`, y nace
  con `video_status` en `pending` y `video_playback_id` en `null`, es decir **fuera de la carta
  publica** — lo garantiza la policy, no la consulta. El precio se parsea separando parte entera y
  decimal **como texto**, nunca con `parseFloat` seguido de multiplicacion.
- `src/app/admin/platos/**` — tabla densa, formulario, botones subir/bajar y duplicar.
- `tests/integration/admin-dishes.test.ts` y `tests/e2e/admin-dishes.spec.ts`.

**Listo cuando**
- [ ] WHEN el owner crea un plato con precio escrito como `13500,50` THE SYSTEM SHALL guardar el entero `1350050` en la columna `price`.
- [ ] WHEN el owner crea un plato con precio negativo THE SYSTEM SHALL devolver `{ ok: false }` con `code` igual a `validation_error` y no insertar ninguna fila.
- [ ] WHEN el owner duplica un plato THE SYSTEM SHALL crear exactamente una fila nueva con el mismo `category_id`, `price` y `description`, con `video_status` igual a `pending` y `video_playback_id` nulo.
- [ ] WHEN el owner duplica un plato THE SYSTEM SHALL dejar el plato duplicado fuera de la carta publica hasta que su video quede en `ready`.
- [ ] WHEN el owner asigna un `category_id` que pertenece a otro restaurante THE SYSTEM SHALL devolver `{ ok: false }` con `code` igual a `not_found` y no insertar ninguna fila.
- [ ] WHEN el owner usa el control de bajar sobre un plato THE SYSTEM SHALL intercambiar su `sort_order` con el del siguiente plato de la misma categoria.

**Verify**
```bash
pnpm test tests/integration/admin-dishes.test.ts   # expect: exit 0, 0 failed, 0 skipped
pnpm typecheck                                     # expect: exit 0
pnpm lint                                          # expect: exit 0
pnpm test:e2e tests/e2e/admin-dishes.spec.ts       # expect: exit 0, 0 failed
```

**Checkpoint**
```bash
git add -A && git commit -m "step 15: panel de platos"
git tag step-15-admin-dishes
git ls-files --error-unmatch src/server/admin/dishes.ts   # expect: exit 0
```

---

#### Paso 16 — Subida firmada de video y estado de procesamiento

**Hacer**
- `src/app/api/video/signature/route.ts` — valida con zod `.strict()`, autoriza contra el restaurante
  del plato y firma con `cloudinary.utils.api_sign_request`. Devuelve el sobre de §5. **El archivo no
  pasa por el servidor**: el navegador sube directo al proveedor, porque el limite de 4.5 MB de cuerpo
  de una funcion de Vercel rompe con videos reales.
- `src/server/admin/video.ts` — `markVideoReady` (escribe `video_playback_id`, `thumbnail_url` derivado
  del proveedor y `video_status = 'ready'`) y `markVideoFailed`.
- `src/components/admin/video-uploader.tsx` — cola multi-archivo con progreso y reintento por fila.
- `tests/unit/cloudinary-signature.test.ts` — compara la firma del SDK contra un SHA-1 calculado de
  forma **independiente** con `node:crypto`. Dos calculos, ninguna cadena literal atada a una version.
- `tests/e2e/video-signature.spec.ts`.

Aca las variables de Cloudinary pasan de opcionales a obligatorias, y **solo aca**: promoverlas antes
habria roto el gate de todos los pasos anteriores.

**Listo cuando**
- [ ] WHEN se calcula la firma de un conjunto de parametros THE SYSTEM SHALL producir la misma cadena de 40 caracteres hexadecimales que un SHA-1 calculado de forma independiente sobre los parametros ordenados mas el secreto.
- [ ] WHEN la respuesta de la ruta de firma se serializa THE SYSTEM SHALL no contener en ningun campo el valor de `CLOUDINARY_API_SECRET`.
- [ ] WHEN se hace `POST /api/video/signature` sin sesion THE SYSTEM SHALL responder 401 con `code` igual a `unauthorized`.
- [ ] WHEN se hace `POST /api/video/signature` con sesion y un `publicId` que contiene caracteres fuera de `[a-zA-Z0-9_/-]` THE SYSTEM SHALL responder 422 con `code` igual a `validation_error`.
- [ ] WHEN se hace `POST /api/video/signature` con `VIDEO_PROVIDER` distinto de `cloudinary` THE SYSTEM SHALL responder 503 con `code` igual a `provider_unavailable`.
- [ ] WHEN la subida de un archivo termina y se confirma el video THE SYSTEM SHALL dejar el plato con `video_status` igual a `ready` y hacerlo visible en la carta publica.

**Verify**
```bash
pnpm test tests/unit/cloudinary-signature.test.ts   # expect: exit 0, 0 failed, 0 skipped
pnpm typecheck                                      # expect: exit 0
pnpm lint                                           # expect: exit 0
pnpm test:e2e tests/e2e/video-signature.spec.ts     # expect: exit 0, 0 failed
```

**Checkpoint**
```bash
git add -A && git commit -m "step 16: subida firmada de video"
git tag step-16-video-upload
git ls-files --error-unmatch src/app/api/video/signature/route.ts   # expect: exit 0
```

---

#### Paso 17 — Performance del poster, estados de error, accesibilidad y CI

**Hacer**
- `tests/e2e/perf-poster.spec.ts` — proyecto `slow-4g`. Aplica `Network.emulateNetworkConditions` por
  CDP (400 kbps, 300 ms de latencia), navega a `/brasa` y afirma que el primer poster decodifica
  (`naturalWidth > 0`) en menos de 4000 ms y que ninguna respuesta de imagen supera 60 KB de
  `encodedBodySize`. **Asi se convierte la metrica del producto en un comando que sale con 0.**
- `tests/e2e/a11y.spec.ts` — **sin axe**: `@axe-core/playwright` no tiene pin verificado en §11 y una
  dependencia sin verificar en el gate final es peor que un chequeo mas chico. Afirma la mitad
  estructural, que es donde vive aproximadamente la mitad de las violaciones reales.
- `src/app/error.tsx` y `src/app/[slug]/error.tsx` — fronteras de error con boton que llama `reset()`.
- `.github/workflows/ci.yml` — instalar, typecheck, lint, test, e2e, build.

**Listo cuando**
- [ ] WHEN `/brasa` se carga con la red limitada a 400 kbps y 300 ms de latencia THE SYSTEM SHALL decodificar el primer poster de la grilla en menos de 4000 ms.
- [ ] WHEN `/brasa` termina de cargar THE SYSTEM SHALL haber transferido menos de 60 KB por cada poster de la grilla.
- [ ] WHEN una consulta de la carta lanza un error THE SYSTEM SHALL renderizar la frontera de error con un boton de reintento y sin pantalla en blanco.
- [ ] WHEN el spec de accesibilidad recorre `/brasa` y `/brasa/plato/<id>` THE SYSTEM SHALL encontrar exactamente un `h1` por pagina, un landmark `main`, un enlace de salto al contenido y `alt` en toda imagen.
- [ ] WHEN el spec de accesibilidad recorre esas rutas a 320 CSS px de ancho THE SYSTEM SHALL cumplir `document.documentElement.scrollWidth === document.documentElement.clientWidth`.
- [ ] WHEN el archivo de flujo de trabajo de CI se lee THE SYSTEM SHALL contener cada uno de los comandos del gate global: `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e` y `pnpm build`.

**Verify**
```bash
pnpm typecheck    # expect: exit 0
pnpm lint         # expect: exit 0
pnpm test         # expect: exit 0, 0 failed, 0 skipped
pnpm test:e2e     # expect: exit 0, 0 failed — incluye a11y y perf-poster
for c in 'pnpm install --frozen-lockfile' 'pnpm typecheck' 'pnpm lint' 'pnpm test' 'pnpm test:e2e' 'pnpm build'; do grep -qF "$c" .github/workflows/ci.yml || { echo "falta en CI: $c"; exit 1; }; done
# expect: exit 0 — CI corre exactamente el gate global de §20.1
```

**Checkpoint**
```bash
git add -A && git commit -m "step 17: performance, errores, accesibilidad y CI"
git tag step-17-launch
git ls-files --error-unmatch .github/workflows/ci.yml   # expect: exit 0
git ls-files --error-unmatch .env.example               # expect: exit 0 — la negacion del ignore funciona
```

---

#### Paso 18 — Tarea anti-pausa del proyecto gratis

**Por que es un paso propio.** El proyecto gratis de Supabase se pausa a la semana sin actividad, y
§20.2 califica ese riesgo como probabilidad **alta** e impacto **alto**: el escenario concreto es
abrir la carta delante del dueno de un restaurante y que no cargue. Es la unica pieza del Paso 1 que
no protege al codigo sino a la **demo de ventas**, y por eso no se mezcla con el paso de performance.

**Hacer**
- `src/app/api/keep-alive/route.ts` — una ruta que despierta la base. Cuatro detalles que no son
  opcionales, porque **cada uno la hace fallar en silencio**:
  1. **Exportar `GET`, no `POST`.** Vercel Cron dispara con `GET`; un handler que solo exporte `POST`
     devuelve 405, el panel de Vercel muestra la tarea como sana y el proyecto se pausa igual.
  2. **Consultar la base de verdad** — un `select` de una fila contra `restaurants` con el cliente
     anonimo. Devolver 200 sin tocar Postgres no cuenta como actividad y no evita nada.
  3. **Proteger con `CRON_SECRET`**, comparando el header `Authorization: Bearer <secreto>` dentro
     del handler. Vercel lo manda solo; sin el chequeo la ruta queda abierta a cualquiera.
  4. **Solo lectura e idempotente.** La entrega es best-effort: puede saltear una corrida o
     duplicarla. Nunca escribe.
- `vercel.json` — unicamente la entrada `crons` con `path: "/api/keep-alive"` y frecuencia diaria.
  Entra en el plan gratis de Vercel.
- `tests/integration/keep-alive.test.ts` — cubre los tres codigos de respuesta.

**Listo cuando**
- [ ] WHEN se hace `GET /api/keep-alive` con el header `Authorization: Bearer <CRON_SECRET>` correcto THE SYSTEM SHALL responder 200 despues de haber consultado la tabla `restaurants`.
- [ ] WHEN se hace `GET /api/keep-alive` sin ese header o con uno incorrecto THE SYSTEM SHALL responder 401 sin consultar la base.
- [ ] WHEN se hace `POST /api/keep-alive` THE SYSTEM SHALL responder 405, porque el handler expone `GET` unicamente y Vercel Cron dispara con `GET`.
- [ ] WHEN se lee `vercel.json` THE SYSTEM SHALL declarar exactamente una entrada de `crons` cuyo `path` es `/api/keep-alive`.

**Verify**
```bash
pnpm typecheck                                          # expect: exit 0
pnpm lint                                               # expect: exit 0
pnpm test tests/integration/keep-alive.test.ts          # expect: exit 0, 0 failed, 0 skipped
node -e "const c=require('./vercel.json').crons;if(!c?.some(x=>x.path==='/api/keep-alive'))process.exit(1)"
# expect: exit 0 — la tarea anti-pausa esta declarada
grep -q "export async function GET" src/app/api/keep-alive/route.ts   # expect: exit 0 — GET, no POST
grep -q "CRON_SECRET" src/app/api/keep-alive/route.ts                 # expect: exit 0 — la ruta esta protegida
pnpm build                                              # expect: exit 0
```

**Checkpoint**
```bash
git add -A && git commit -m "step 18: tarea anti-pausa"
git tag step-18-keepalive
git ls-files --error-unmatch vercel.json                # expect: exit 0
test "$(git tag -l 'step-*' | wc -l)" -eq 18            # expect: exit 0 — un tag por paso
```

---

### 9.1 Paridad y cambio de sistema

NOT APPLICABLE — construccion desde cero, no se reemplaza ningun sistema en funcionamiento.

---

## 10. Preparacion del entorno

**Todos los bloques de esta seccion son POSIX shell y se ejecutan con `bash`.** En Windows, el bash
que instala Git for Windows (Git Bash) sirve; no uses PowerShell para estos bloques.

### Prerrequisitos

| Herramienta | Version | Chequeo |
|---|---|---|
| Node.js | 24.x LTS | `node -v` |
| pnpm | 11.17.0 | `pnpm -v` |
| Git | cualquiera reciente | `git --version` |
| bash | cualquiera | `bash --version` |

**No hace falta Docker.** Este proyecto trabaja **directo contra un proyecto de Supabase en la nube**,
no contra un stack local en contenedores. Es una decision deliberada del dueño del proyecto: menos
que instalar, y el plan gratis alcanza de sobra para todo el Paso 1.

Lo que eso implica y hay que tener presente:

- **Las migraciones se aplican sobre una base real.** No hay red de contencion local. Por eso el
  gate del paso 3 corre `supabase db push` y despues verifica el esquema resultante.
- **Los tests de aislamiento de RLS crean y borran datos en esa base.** Estan acotados por el prefijo
  reservado `__test_` (§13) y jamas ejecutan un `delete` sin filtro.
- **El seed es reproducible.** `pnpm db:push` deja la demo en el mismo estado siempre, asi que romperla
  cuesta un comando y no una tarde. Esa propiedad es lo que hace aceptable trabajar sobre un solo
  proyecto.
- **El proyecto gratis se pausa a la semana sin actividad.** El paso 17 instala una tarea programada
  que lo mantiene despierto. Ver §20.2, riesgo 6.

### Cuentas a crear primero

| Servicio | Para que | URL de alta | Primer paso que la necesita |
|---|---|---|---|
| Supabase | Postgres, Auth y RLS gestionados | https://supabase.com/dashboard/sign-up | **Paso 3.** El desarrollo entero corre contra la nube |
| Cloudinary | Encoding, entrega HLS y poster del video | https://cloudinary.com/users/register_free | Paso 16 |
| Vercel | Hosting del frontend | https://vercel.com/signup | Paso 17 |
| GitHub | Repositorio y CI | https://github.com/signup | Paso 17 |

### Variables de entorno

| Variable | Proposito | De donde sale | Requerida por el paso | Secreta |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL de PostgREST/Auth | Supabase > Project Settings > API | 1 | no (publicada) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave publica; llega al navegador | idem | 1 | no (publicada) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Saltea RLS por completo.** Solo scripts y tests, jamas en el navegador | idem | **1** | **si** |
| `SUPABASE_PROJECT_REF` | Identifica el proyecto para `supabase link` | Es el subdominio de la URL: `https://<ref>.supabase.co` | 3 | no |
| `SUPABASE_ACCESS_TOKEN` | Autentica la CLI sin login interactivo | Supabase > Account > Access Tokens > Generate new token | 3 | **si** |
| `SUPABASE_DB_PASSWORD` | La usa `supabase link` y `db push` | La que pusiste al crear el proyecto. Se resetea en Settings > Database | 3 | **si** |
| `TEST_DB_PROJECT_REF` | Confirma explicitamente contra que proyecto pueden correr los tests. **Tiene que ser identico al ref de `NEXT_PUBLIC_SUPABASE_URL`** | lo escribis vos, copiando el mismo ref | **1** | no |
| `VIDEO_PROVIDER` | `direct` o `cloudinary`. Default `direct` | valor fijo por entorno | 11 | no |
| `CLOUDINARY_CLOUD_NAME` | Cuenta de Cloudinary | Cloudinary Console > Dashboard | 11 | no |
| `CLOUDINARY_STREAMING_PROFILE` | Perfil de streaming adaptativo | Cloudinary > Settings > Video | 11 | no |
| `CLOUDINARY_API_KEY` | Firma de subida | Cloudinary > Settings > API Keys | 16 | no |
| `CLOUDINARY_API_SECRET` | Firma de subida. **Nunca sale del servidor** | idem (hay que revelarlo) | 16 | **si** |
| `CLOUDINARY_UPLOAD_FOLDER` | Carpeta destino, un nivel por entorno | valor fijo | 16 | no |
| `NEXT_PUBLIC_SITE_URL` | Origen publico para metadata | valor fijo por entorno | 17 | no |
| `CRON_SECRET` | Protege `/api/keep-alive`. Vercel lo manda como `Authorization: Bearer` | lo generas vos: `openssl rand -hex 32` | 18 | **si** |

**`SUPABASE_SERVICE_ROLE_KEY` y `TEST_DB_PROJECT_REF` se requieren desde el paso 1, no desde el 3.** `tests/setup.ts` esta
registrado como `setupFiles` **global** en `vitest.config.ts`, asi que corre antes de *cualquier*
`pnpm test` — incluso el gate de unitarios del paso 1, que no toca la base. Sin **cualquiera** de esas
dos variables, el primer test del build entero tira antes de ejecutar nada. La regla 9 de §9 (una
variable es obligatoria recien desde el paso que la nombra) alcanza a `src/lib/env.ts`; `tests/setup.ts`
es un gate de arranque igual de temprano y queda cubierto por esta excepcion, escrita a proposito.

`.env.example` se commitea con todas las claves presentes. `.env.local` nunca. **La columna "Requerida
por el paso" es un contrato con §9**: `src/lib/env.ts` trata una variable como obligatoria recien desde
el paso que la nombra, para que la llegada de un paso no rompa el gate de uno anterior (§9 regla 10).

**Listar una variable aca no la carga.** Cada herramienta tiene su mecanismo explicito, escrito en
§19.6: Next lee `.env.local` solo; `vitest.config.ts` y `playwright.config.ts` llaman
`process.loadEnvFile(".env.local")` en su primera linea; los scripts de Node se invocan con
`node --env-file=.env.local ...` desde su propio script de `package.json`.

### Archivos que deben quedar commiteados

| Archivo | Por que se commitea | Linea de excepcion en el ignore |
|---|---|---|
| `.env.example` | Es la lista de claves que necesita cualquiera que clone | `!.env.example` **despues** del patron `.env*` |
| `.gitattributes` | **Verificado en corrida real:** sin el, un clon en Windows llega con CRLF, `biome.json` exige LF y `pnpm lint` sale 1 sobre archivos que nadie edito | — ningun patron lo alcanza |
| `biome.json`, `tsconfig.json`, `vitest.config.ts`, `playwright.config.ts`, `next.config.ts`, `postcss.config.mjs` | Sin ellos ningun gate corre | — ningun patron los alcanza |
| `pnpm-lock.yaml` | Hace reproducible el build | — ningun patron lo alcanza |
| `supabase/migrations/**`, `supabase/seed.sql` | El esquema y la demo son codigo | — ningun patron los alcanza |
| `src/lib/supabase/database.types.ts` | Generado, pero necesario para typecheck en CI | — ningun patron lo alcanza |
| `public/seed/**` | Los posters de la demo | — ningun patron los alcanza |
| `.claude/**`, `CLAUDE.md`, `AGENTS.md` | Configuracion del agente | — ningun patron los alcanza |
| `.github/workflows/ci.yml` | El pipeline | — ningun patron lo alcanza |
| `blueprints/**` | Este bundle vive con el proyecto | — ningun patron lo alcanza |

El `.gitignore` que este blueprint emite en `workspace/` ya contiene esa negacion, y **aterriza antes
del primer commit** del bloque de abajo. Una ruta que git ya trackea no la excluye ninguna regla
posterior, asi que el orden no es cosmetico.

### Bootstrap

```bash
# Ejecutar con bash, desde la RAIZ DEL PROYECTO: el directorio que contiene
# blueprints/carta-video-restaurantes/. Todo el bloque es idempotente: correrlo dos
# veces seguidas sale con 0 y no revierte nada de lo que el build haya cambiado.
#
# EL ORDEN IMPORTA: prerrequisitos -> scaffold -> dependencias -> copiado de workspace/
# (trae .gitignore y .gitattributes, biome.json, tsconfig.json y las configs de los
# runners) -> parches del manifiesto -> reconciliacion de formato -> init de git ->
# PRIMER COMMIT -> servicios locales -> migraciones -> seed -> binarios de Playwright.
# El archivo de ignore entra ANTES del primer commit a proposito.
#
# ARCHIVOS QUE NUNCA SE PISAN: package.json y pnpm-lock.yaml. No estan en workspace/,
# los autoria `pnpm create next-app` y este bloque solo los edita con `npm pkg set`.

set -u
BUNDLE="blueprints/carta-video-restaurantes"

# VERIFICADO EN UNA CORRIDA REAL, y sin esto el bootstrap NO se puede desatender:
# pnpm 11 quiere purgar node_modules cuando cambia la ubicacion del virtual store y
# PIDE CONFIRMACION POR TECLADO. Sin TTY aborta con
# `[ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY] Aborted removal of modules directory`.
# Afecta a `pnpm add` tanto como a `pnpm install`. Probado: un `.npmrc` con
# `confirm-modules-purge=false` NO alcanza — la variable de entorno si.
export CI=true

# --- 0. prerrequisitos --------------------------------------------------------
# Sin Docker: la base es el proyecto de Supabase en la nube. El chequeo de credenciales
# NO va aca sino en el paso 8, porque .env.example recien aterriza en el paso 4.
node -v
git --version

# --- 1. toolchain -------------------------------------------------------------
# `corepack enable` pelado falla con EACCES donde el bin global no es escribible
# (Node instalado como root, casi toda imagen de CI). El directorio propio siempre funciona.
#
# VERIFICADO EN UNA CORRIDA REAL: `--install-directory` NO crea el directorio. Si no
# existe, corepack aborta con `Internal Error: ENOENT: no such file or directory,
# lstat '<dir>'` y sale 1. El `|| true` de mas abajo se traga ese error, `corepack
# prepare` imprime que preparo pnpm, y recien dos comandos despues el build muere con
# `pnpm: command not found` — un error que no se parece en nada a la causa.
# El mkdir -p es obligatorio y va ANTES.
mkdir -p "$HOME/.local/bin"
corepack enable --install-directory "$HOME/.local/bin" || true
export PATH="$HOME/.local/bin:$PATH"
corepack prepare pnpm@11.17.0 --activate
pnpm -v   # gate: si esto no imprime 11.17.0, nada de lo que sigue puede funcionar

# --- 2. scaffold EN EL LUGAR (guardado: si ya hay package.json no hace nada) ---
# create-next-app no puede escribir en un directorio cuyo nombre no sea un nombre de
# paquete valido, asi que anda a un subdirectorio y sube el contenido.
#
# VERIFICADO EN UNA CORRIDA REAL: el subdirectorio NO puede llamarse `_scaffold` ni
# empezar con guion bajo. npm prohibe esos nombres y create-next-app aborta con
# `Could not create a project called "_scaffold" because of npm naming restrictions:
# name cannot start with an underscore` — **saliendo con codigo 0**. Un bloque con
# `set -e` pasa de largo, el `mv` falla con "missing destination file operand", y el
# build muere mas adelante sin package.json. El nombre tiene que ser un nombre de
# paquete npm valido: minusculas, sin guion bajo inicial.
# `--eslint=false` NO desactiva ESLint (la opcion no toma valor): el flag correcto es --biome.
# Este comando aborta su propio install con ERR_PNPM_IGNORED_BUILDS y aun asi sale 0.
if [ ! -f package.json ]; then
  pnpm create next-app@latest scaffold-tmp --ts --app --tailwind --biome --src-dir --use-pnpm --yes < /dev/null
  rm -rf scaffold-tmp/.git          # el repo lo crea este bloque, con rama main
  shopt -s dotglob nullglob
  mv scaffold-tmp/* ./
  shopt -u dotglob nullglob
  rmdir scaffold-tmp
fi

# --- 3. dependencias fijadas --------------------------------------------------
# SIN `|| true`. Ese silenciador estaba mal y una corrida real lo demostro: con el
# prompt de purga activo, el segundo y el tercer `pnpm add` fallaban, `|| true` se
# comia el error, y el `install --frozen-lockfile` restauraba los pines DEL ANDAMIAJE
# — el build seguia con typescript 5.9.3 y sin Supabase, y nada lo avisaba.
# Con `CI=true` exportado arriba, los tres salen 0 y los pines quedan como dice §11.
pnpm approve-builds --all
pnpm add next@16.3.0 react@19.2.8 react-dom@19.2.8
pnpm add @supabase/supabase-js@^2.112.2 @supabase/ssr@^0.12.4 zod@^4.4.3 hls.js@^1.6.17 cloudinary@^2.10.0
pnpm add -D typescript@^6.0.3 @biomejs/biome@2.5.5 vitest@^4.1.10 @playwright/test@^1.62.1 supabase@^2.112.0 tailwindcss@^4.3.3 @tailwindcss/postcss@^4.3.3
pnpm approve-builds --all
pnpm install --frozen-lockfile

# Gate de pines: si el andamiaje gano alguna, esto lo caza aca y no ocho pasos despues.
node -e "const p=require('./package.json'),a={...p.dependencies,...p.devDependencies};for(const[k,v]of Object.entries({next:'16.3.0',react:'19.2.8',typescript:'^6.0.3','@supabase/supabase-js':'^2.112.2'}))if(a[k]!==v){console.error('pin incorrecto:',k,'=',a[k],'esperaba',v);process.exit(1)}"

# --- 4. copiado de workspace/ (marcador: la segunda corrida no hace nada, sale 0) ---
# Con marcador y no con `cp -Rn`: en BSD/macOS `cp -Rn` sale 1 cuando saltea un archivo,
# que es justo el caso que el guard existe para cubrir. Este pisa una sola vez, la primera,
# lo cual es lo que queremos: biome.json y tsconfig.json del blueprint reemplazan a los del
# scaffold. En corridas posteriores no toca nada.
if [ ! -e .workspace-applied ]; then
  cp -R "$BUNDLE/workspace/." ./
  : > .workspace-applied
fi

# --- 5. edits del manifiesto (el scaffold es el autor; el blueprint edita) -----
npm pkg set name="carta-video-restaurantes"
npm pkg set packageManager="pnpm@11.17.0"
npm pkg set scripts.dev="next dev"
npm pkg set scripts.build="next build"
npm pkg set scripts.start="next start"
npm pkg set scripts.typecheck="tsc --noEmit"
npm pkg set scripts.lint="biome check ."
npm pkg set scripts.format="biome check --write ."
npm pkg set scripts.test="vitest run"
npm pkg set "scripts.test:e2e"="playwright test"
npm pkg set scripts.smoke="bash scripts/smoke-http.sh /api/health 200"
npm pkg set "scripts.db:push"="supabase db push --linked --include-all --include-seed"
npm pkg set "scripts.db:reset"="supabase db reset --linked"
npm pkg set "scripts.db:types"="supabase gen types typescript --linked > src/lib/supabase/database.types.ts"
npm pkg set "scripts.db:admin"="node --env-file=.env.local scripts/create-admin.ts"
printf '24\n' > .nvmrc

# --- 6. reconciliar el formato del scaffold con biome.json del blueprint ------
# VERIFICADO EN UNA CORRIDA REAL: los SVG de ejemplo que genera create-next-app
# (file/globe/next/vercel/window.svg) violan `lint/a11y/noSvgWithoutTitle`, asi que
# `pnpm lint` sale 1 sobre un andamiaje intacto — el gate del paso 1 falla antes de
# que exista una linea de codigo propio. Dos defensas, las dos necesarias:
#   1. este borrado: no usamos ninguno de esos assets, el diseno de §7 no tiene el
#      logo de Next ni iconos de ejemplo;
#   2. `!public/**` en biome.json, porque public/ va a guardar los posters del seed
#      y son datos, no codigo fuente.
rm -f public/file.svg public/globe.svg public/next.svg public/vercel.svg public/window.svg
pnpm exec biome check --write . || true   # pasada de arreglo
pnpm exec biome check .                    # gate: ahora si tiene que salir 0

# --- 7. repositorio y PRIMER COMMIT (el .gitignore ya esta en disco, paso 4) ---
git rev-parse --git-dir >/dev/null 2>&1 || git init -b main
git config user.email >/dev/null 2>&1 || git config user.email "build@carta.local"
git config user.name  >/dev/null 2>&1 || git config user.name  "Carta Build"
git add -A
git commit -m "chore: bootstrap" --allow-empty   # --allow-empty: la segunda corrida no tiene nada que commitear

# --- 8. base de datos: proyecto de Supabase en la nube -----------------------
# No hay stack local ni Docker. Todo corre contra el proyecto enlazado.
#
# .env.local NO lo genera este bloque: lo escribis vos una vez, copiando
# .env.example (que aterrizo en el paso 4) y completando los valores desde el panel
# de Supabase. Este guard falla ruidoso y explica exactamente que falta, en vez de
# dejar que `supabase link` pida una contraseña por teclado y cuelgue el build.
if [ ! -f .env.local ]; then
  echo "ERROR: falta .env.local."
  echo "  1) cp .env.example .env.local"
  echo "  2) completa estos valores desde https://supabase.com/dashboard :"
  echo "     SUPABASE_PROJECT_REF       el subdominio de la URL del proyecto"
  echo "     SUPABASE_DB_PASSWORD       Project Settings > Database"
  echo "     SUPABASE_ACCESS_TOKEN      Account > Access Tokens > Generate new token"
  echo "     NEXT_PUBLIC_SUPABASE_URL   Project Settings > API"
  echo "     NEXT_PUBLIC_SUPABASE_ANON_KEY  y  SUPABASE_SERVICE_ROLE_KEY   (idem)"
  echo "     TEST_DB_PROJECT_REF        el MISMO valor que SUPABASE_PROJECT_REF"
  exit 1
fi
set -a; . ./.env.local; set +a
: "${SUPABASE_PROJECT_REF:?falta SUPABASE_PROJECT_REF en .env.local}"
: "${SUPABASE_DB_PASSWORD:?falta SUPABASE_DB_PASSWORD en .env.local}"
: "${SUPABASE_ACCESS_TOKEN:?falta SUPABASE_ACCESS_TOKEN en .env.local}"
export SUPABASE_ACCESS_TOKEN          # la CLI lo lee del entorno; evita el login interactivo

[ -f supabase/config.toml ] || pnpm exec supabase init --force < /dev/null

# link es idempotente: reenlazar al mismo ref reescribe .temp/ y sale 0.
pnpm exec supabase link --project-ref "$SUPABASE_PROJECT_REF" \
                        --password "$SUPABASE_DB_PASSWORD" < /dev/null

# En la PRIMERA corrida supabase/migrations/ esta vacio (las migraciones las escribe
# el paso 3), y `db push` sin nada pendiente sale 0. En corridas posteriores aplica
# solo lo que falte. NO es destructivo: nunca borra datos ni recrea la base.
# --include-seed aplica supabase/seed.sql, que por eso TIENE que ser idempotente
# (`insert ... on conflict do update`) — §4 lo exige y §20.1 lo verifica corriendolo dos veces.
pnpm exec supabase db push --linked --include-all --include-seed < /dev/null

# El admin recien existe desde el paso 6. Guard para que el bootstrap corra igual antes.
if [ -f scripts/create-admin.ts ]; then pnpm db:admin; fi

# --- 9. binarios del runner de e2e -------------------------------------------
pnpm exec playwright install chromium

# --- 10. gate final del bootstrap --------------------------------------------
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
```

---

## 11. Dependencias

Esta seccion es la tabla de procedencia de versiones y **es el unico lugar de la prosa del blueprint
donde aparece un numero de version**. Las filas marcadas `stack-researcher` fueron verificadas contra
los dist-tags de npm el 2026-08-07, en esta sesion. Las marcadas con el archivo del track son pines
cacheados del 2026-07-27 que **no se re-verificaron hoy**, y esa advertencia viaja tal cual.

### Runtime

| Paquete | Version | Fuente | Verificado | Lo instala | Proposito |
|---|---|---|---|---|---|
| `next` | 16.3.0 | registry.npmjs.org/-/package/next/dist-tags | 2026-08-07 | §10 Bootstrap paso 3 | El framework. App Router y Turbopack por defecto |
| `react` | 19.2.8 | registry.npmjs.org/-/package/react/dist-tags | 2026-08-07 | §10 Bootstrap paso 3 | Dentro del rango de peers de Next 16.3.0, que es `"^18.2.0 \|\| 19.0.0-rc-de68d2f4-20241204 \|\| ^19.0.0"` |
| `react-dom` | 19.2.8 | registry.npmjs.org/-/package/react/dist-tags | 2026-08-07 | §10 Bootstrap paso 3 | Par de `react` |
| `@supabase/supabase-js` | ^2.112.2 | registry.npmjs.org/-/package/@supabase/supabase-js/dist-tags | 2026-08-07 | §10 Bootstrap paso 3 | Cliente HTTP contra PostgREST. Es lo que hace que RLS se evalue |
| `@supabase/ssr` | ^0.12.4 | registry.npmjs.org/-/package/@supabase/ssr/dist-tags | 2026-08-07 | §10 Bootstrap paso 3 | Clientes con cookies para Server Components y `proxy.ts`. **Es el paquete correcto** |
| `zod` | ^4.4.3 | registry.npmjs.org/-/package/zod/dist-tags | 2026-08-07 | §10 Bootstrap paso 3 | Validacion en cada borde: entorno, acciones, rutas, color de marca |
| `hls.js` | ^1.6.17 | registry.npmjs.org/-/package/hls.js/dist-tags | 2026-08-07 | §10 Bootstrap paso 3 | Reproduccion HLS donde el navegador no la trae nativa |
| `cloudinary` | ^2.10.0 | registry.npmjs.org/-/package/cloudinary/dist-tags | 2026-08-07 | §10 Bootstrap paso 3 | SDK de Node, **solo servidor**, solo para firmar subidas |

### Desarrollo

| Paquete | Version | Fuente | Verificado | Lo instala | Proposito |
|---|---|---|---|---|---|
| `typescript` | ^6.0.3 | registry.npmjs.org/-/package/typescript/dist-tags | 2026-08-07 | §10 Bootstrap paso 3 | **NO 7.0.2.** Ver la advertencia de abajo |
| `@biomejs/biome` | 2.5.5 | knowledge/runtime-tracks/ts-node.md | 2026-07-27 | §10 Bootstrap paso 3 | Lint y formato en una herramienta. Pin cacheado del track, no re-verificado hoy |
| `vitest` | ^4.1.10 | registry.npmjs.org/-/package/vitest/dist-tags | 2026-08-07 | §10 Bootstrap paso 3 | Tests unitarios y de integracion |
| `@playwright/test` | ^1.62.1 | registry.npmjs.org/-/package/@playwright/test/dist-tags | 2026-08-07 | §10 Bootstrap paso 3 | E2E, incluido el proyecto de red lenta |
| `supabase` | ^2.112.0 | registry.npmjs.org/-/package/supabase/dist-tags | 2026-08-07 | §10 Bootstrap paso 3 | CLI: enlaza el proyecto, aplica migraciones, genera tipos |
| `tailwindcss` | ^4.3.3 | registry.npmjs.org/-/package/tailwindcss/dist-tags | 2026-08-07 | §10 Bootstrap paso 3 | v4, configurado en CSS. v3 es `v3-lts`, solo mantenimiento |
| `@tailwindcss/postcss` | ^4.3.3 | registry.npmjs.org/-/package/tailwindcss/dist-tags | 2026-08-07 | §10 Bootstrap paso 3 | La unica entrada PostCSS valida en v4 |
| `@types/react` | 19.2.17 | knowledge/runtime-tracks/ts-node.md | 2026-07-27 | §10 Bootstrap paso 2 (`pnpm create next-app`) | Pin cacheado del track, no re-verificado hoy |
| `@types/react-dom` | 19.2.3 | knowledge/runtime-tracks/ts-node.md | 2026-07-27 | §10 Bootstrap paso 2 (`pnpm create next-app`) | Pin cacheado del track, no re-verificado hoy |
| `@types/node` | la que resuelva el scaffold | UNVERIFIED — verificar antes de fijar | 2026-08-07, no resuelto | §10 Bootstrap paso 2 (`pnpm create next-app`) | Tipos de Node. `stack-researcher` no lo resolvio; la version efectiva queda en `pnpm-lock.yaml` |

**Advertencia sobre TypeScript, textual:** `typescript@latest` hoy es **7.0.2**, la reescritura en Go.
No tiene API programatica estable del compilador y **Next.js la rechaza salvo que actives
`experimental.useTypeScriptCli: true`**; `next build` sale con instrucciones si no. Fijá `^6.0.3`: **no
existe 6.0.4 ni 6.1.0, 6.0.3 es la ultima version de esa linea.**

### Deliberadamente no usados

| Rechazado | En su lugar | Por que |
|---|---|---|
| `next-cloudinary` | `src/lib/video/cloudinary-provider.ts` propio | Sus `peerDependencies` publicadas llegan hasta `next: ^15` y Next 16 no figura, asi que un install estricto de pnpm **falla**. Ademas expone componentes React atados al proveedor, que viola la regla de abstraccion de la spec §3.5 |
| `@supabase/auth-helpers-nextjs` | `@supabase/ssr` | **Deprecado por Supabase.** La mayoria de los tutoriales que hay online todavia lo usan: se dice aca explicitamente para que nadie "arregle" el codigo instalandolo |
| `drizzle-orm`, `prisma`, cualquier ORM | `@supabase/supabase-js` + tipos generados | **Decision de seguridad.** Un ORM se conecta por TCP con rol administrador y **RLS no se aplica en ese camino**. Ademas, sin conexiones directas no hay agotamiento del pool en serverless |
| `shadcn` / Radix | Componentes propios | Tres pantallas y ~8 componentes. `shadcn init` pide input interactivo y bloquea un build desatendido |
| `@tanstack/react-query` | Server Components | No hay `fetch` desde el cliente en la carta publica. Seria una segunda copia de datos ya renderizados |
| `@axe-core/playwright` | `tests/e2e/a11y.spec.ts` estructural | No tiene pin verificado en esta sesion. Una dependencia sin verificar en el gate final es peor que un chequeo mas chico. Esta en §20.4 |
| `dotenv` | `process.loadEnvFile` de Node 24 y `--env-file` | Node ya lo trae. Una dependencia menos en la superficie de suministro |
| `tailwind.config.js` | El bloque `@theme` de `src/app/globals.css` | En Tailwind v4 un archivo de config JS es basura de v3 que se ignora |

---

## 12. Estrategia de despliegue

### Hosting

**Vercel**, region `gru1` (São Paulo) por ser la mas cercana a Buenos Aires, plan Hobby al inicio.
Build command `pnpm build`, output el de Next (no se configura), runtime Node 24. `vercel.json` existe con un unico proposito —declarar la tarea `crons` anti-pausa del paso 18— y nada mas:
todo lo que el proyecto necesita ya esta en `next.config.ts`.

La base es **Supabase gestionado**, region `sa-east-1`, plan Free al inicio.

### Entornos

| Entorno | Rama | URL | Base de datos | Modo de terceros |
|---|---|---|---|---|
| Local | — | `http://127.0.0.1:3000` | **proyecto Supabase enlazado** (no hay stack local) | `VIDEO_PROVIDER=direct` mientras se construye |
| Preview | cualquier PR | la que asigna Vercel | el mismo proyecto enlazado | Cloudinary con `CLOUDINARY_UPLOAD_FOLDER=carta/preview` |
| Produccion | `main` | el dominio del producto | el mismo proyecto, **hasta el primer cliente que paga** | Cloudinary con `CLOUDINARY_UPLOAD_FOLDER=carta/prod` |

**Hoy los tres entornos comparten un unico proyecto de Supabase**, porque el plan gratis da 2 activos
y el dueño del proyecto tiene uno disponible. Es una decision consciente, no un descuido, y es
sostenible por una razon concreta: **el seed es idempotente y reproducible**, asi que la demo se
reconstruye con `pnpm db:push` cuando haga falta. Romperla cuesta un comando.

Lo que compra esa simplicidad y lo que cuesta:

| | |
|---|---|
| **Cuesta** | Los tests de integracion escriben en la misma base que la demo. Estan acotados al prefijo `__test_` (§13) y ningun `delete` corre sin ese filtro |
| **Cuesta** | Dos PRs corriendo CI a la vez pisan la misma base. Con un solo desarrollador no pasa; con dos, se separa |
| **Se paga cuando** | Entra el primer restaurante que paga. Ese dia su carta deja de compartir base con el laboratorio: proyecto aparte, y los $25/mes del plan Pro salen de lo que el cliente paga |

**El disparador esta escrito, no librado a la memoria:** §20.2 riesgo 7 lo registra con su condicion
de activacion.

### CI/CD

Tier 0-1 de `knowledge/capabilities/deployment.md`. `.github/workflows/ci.yml` (paso 17) corre en cada
PR, en este orden y con estos comandos exactos, que son los mismos de §20.1:

```
pnpm install --frozen-lockfile
pnpm exec supabase link --project-ref "$SUPABASE_PROJECT_REF" --password "$SUPABASE_DB_PASSWORD"
pnpm db:push
pnpm typecheck
pnpm lint
pnpm test
pnpm exec playwright install chromium
pnpm test:e2e
pnpm build
```

El despliegue lo hace la integracion de Vercel con GitHub: cada PR produce una preview, cada merge a
`main` despliega a produccion.

### Release y rollback

- **Rollback de codigo:** en el panel de Vercel, "Promote to Production" sobre el despliegue anterior.
  Es instantaneo y no requiere build. Se ensaya una vez antes del lanzamiento (§20.1).
- **Migraciones:** se aplican con `pnpm exec supabase db push` contra el proyecto de produccion **como
  paso explicito y previo** al despliegue del codigo, nunca durante el arranque de la app. Hacia
  adelante siempre: para cualquier cambio destructivo, expandir → migrar → contraer en despliegues
  separados. "Revertir la migracion" no es un plan una vez que hay filas.

### Dominio, DNS y TLS

Apex y `www`, uno canonico y el otro con redirect 301 permanente. TLS automatico en Vercel: hay que
**verificar que la renovacion automatica este activa**, no asumirlo. Bajar el TTL de DNS un dia antes
del cambio y restaurarlo despues. No se envia correo desde el producto, asi que no hacen falta SPF,
DKIM ni DMARC.

---

## 13. Estrategia de tests

| Capa | Framework | Que cubre | Donde | Cuando corre |
|---|---|---|---|---|
| Estatica | `tsc --noEmit` + Biome | Tipos, lint, formato, reglas de importacion | todo el repo | cada commit |
| Unitaria | Vitest | Logica pura: formato de precio, validacion de color, armado de URLs del proveedor, esquema de entorno, firma | `tests/unit/` | cada commit |
| Integracion | Vitest contra el **proyecto Supabase enlazado** (no hay stack local) | Esquema, constraints, policies de RLS, aislamiento entre restaurantes, Server Actions del panel | `tests/integration/` | cada commit |
| E2E | Playwright | La carta publica, el plato, el video, el login, el panel, accesibilidad, presupuesto del poster | `tests/e2e/` | antes de cada despliegue |

La suite es **pesada en integracion** a proposito: casi todos los defectos de este producto viven en
las costuras (una policy mal escrita, un filtro de restaurante olvidado), no adentro de una funcion.

### Flujos criticos cubiertos E2E

1. Comensal anonimo: escanear → `/brasa` → tocar un plato → ver el video → cerrar.
2. Aislamiento visible: un slug inactivo o inexistente responde 404 y no filtra datos.
3. Acceso al panel: anonimo redirigido, credenciales validas entran, cerrar sesion cierra.
4. Carga de contenido: crear categoria, crear plato, duplicarlo, reordenarlo, subir video.
5. Presupuesto del poster sobre red limitada a 400 kbps.

### Datos de prueba

La base es el **proyecto de Supabase enlazado**; no hay stack local. El esquema lo definen
`supabase/migrations/**` y la demo la siembra `supabase/seed.sql`, ambos aplicados por
`pnpm db:push` (no destructivo). `pnpm db:reset` recrea todo desde cero y **es destructivo** —
existe para volver a un estado limpio a proposito, nunca dentro de un test.

**Los tests corren contra la misma base donde vive BRASA**, asi que el aislamiento es una regla de
codigo y no una esperanza:

| Regla | Por que |
|---|---|
| Toda fila creada por un test lleva `slug`/`email` con prefijo `__test_` | Es lo que hace distinguible lo descartable de la demo |
| Toda limpieza filtra por ese prefijo. **Ningun `delete` sin `where`** | Un `delete` pelado contra esta base borra la demo de ventas |
| Las fabricas de `tests/helpers/` borran lo suyo en `afterAll` | Que un test falle no debe dejar basura para el siguiente |
| `fileParallelism: false` en `vitest.config.ts` | Todos los archivos comparten una unica base remota |
| Ningun test toca una fila cuyo slug sea `brasa` | La demo es un artefacto de venta, no un fixture |

Ese conjunto de reglas lo verifica §20.1: despues de correr toda la suite, un gate comprueba que
`brasa` sigue en pie con su cantidad de platos intacta.

### Lo que deliberadamente no se testea

- **Componentes React de forma aislada.** No hay jsdom ni testing-library: agregarlos son dos
  dependencias sin pin verificado para cubrir lo que Playwright ya cubre sobre el HTML real.
- **El comportamiento de Cloudinary.** Se testea nuestro adaptador y nuestra firma, no su servicio.
- **El SDK de Supabase.** Se testean nuestras consultas y nuestras policies.
- **Estilos, espaciados y textos** dentro de tests funcionales.
- **La entrega real de un `.m3u8`.** Requiere red y un video subido: es un chequeo del checklist de
  lanzamiento (§20.1), no un gate del build.

---

## 14. Seguridad y secretos

| Preocupacion | Control | Implementado en |
|---|---|---|
| Guardado de secretos | Variables de entorno de Vercel y de Supabase; nunca en el repo | Panel de Vercel · `.gitignore` |
| Rotacion de secretos | `SUPABASE_SERVICE_ROLE_KEY` y `CLOUDINARY_API_SECRET` se rotan en el panel del proveedor y se actualizan en Vercel. Cadencia: al alta de cada restaurante nuevo con acceso, y ante cualquier sospecha | Procedimiento en §20.1 |
| Validacion de entrada | `zod` con `.strict()` en toda Server Action y toda route handler | `src/server/admin/**`, `src/app/api/**` |
| Codificacion de salida / XSS | React escapa por defecto. **El unico valor que llega a un atributo `style` es `primary_color`, filtrado por `parseBrandColor`** | `src/components/ui/brand-scope.tsx` |
| Inyeccion SQL | No se construye SQL con strings en ningun lado: todo pasa por el constructor de consultas de `supabase-js` sobre PostgREST | `src/server/**` |
| AuthN / AuthZ | Ver §8. Servidor, en cada request, junto al acceso a datos | `src/lib/auth/require-admin.ts` + policies de RLS |
| CSRF | Cookies `SameSite=Lax` mas el identificador propio de las Server Actions de Next, que un sitio de terceros no puede fabricar | `@supabase/ssr` · Next |
| Rate limiting | Ninguna capa propia. La carta publica es de solo lectura y cacheada; el login lo limita Supabase Auth. **Anotado como riesgo en §20.2** | — |
| Verificacion de webhooks | NO APLICA — el sistema no recibe webhooks de nadie | — |
| Auditoria de dependencias | `pnpm audit --prod` en CI, semanal | `.github/workflows/ci.yml` |
| Cabeceras de seguridad | `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()` | `next.config.ts` |
| Datos personales | Se guardan email y contrasena hasheada de los usuarios del panel, en Supabase Auth. **De los comensales no se guarda nada**: no hay cuentas, ni cookies de seguimiento, ni analytics. Baja: se borra el usuario desde el dashboard | Supabase Auth |
| Higiene de logs | No se loguea ninguna variable de entorno, ningun token y ningun cuerpo de request completo | Convencion en `CLAUDE.md` |

**Reglas duras**

- Ningun secreto se commitea, se imprime en un log, se manda a un rastreador de errores ni se embebe
  en un bundle de cliente. Cualquier cosa que llegue al navegador es publica: tratala asi.
- Toda verificacion de autorizacion del servidor corre **antes** del trabajo, no despues.
- **La `SUPABASE_SERVICE_ROLE_KEY` saltea RLS por completo.** Solo aparece en `scripts/**` y
  `tests/helpers/**`. §20.1 tiene un gate que verifica que no este en el bundle construido.

Este producto no maneja datos regulados: no hay informacion de salud, ni financiera, ni de menores, ni
datos personales de ciudadanos de la UE mas alla del email de los tres usuarios internos. No aplica
ningun regimen especifico mas alla de la ley argentina 25.326 de proteccion de datos personales, cuya
unica obligacion relevante aca —no guardar datos personales que no se necesitan— se cumple por diseno:
**del comensal no se guarda nada**.

---

## 15. Accesibilidad

**Objetivo: WCAG 2.2 nivel AA.** No es pulido: es la diferencia entre una carta que un comensal con
baja vision puede leer en una mesa mal iluminada y una que no.

### Requisitos base

| Requisito | Regla |
|---|---|
| HTML semantico | `header`, `nav`, `main`, un solo `h1` por pagina, encabezados en orden, listas para listas |
| Teclado | Todo elemento interactivo alcanzable y operable por teclado, orden logico, sin trampas, enlace de salto al contenido |
| Foco visible | `outline: 2px solid var(--color-brand); outline-offset: 2px` en todo lo enfocable — 5.5:1 contra el fondo |
| Contraste | Texto 4.5:1, texto grande y bordes de control 3:1. La paleta de §7 ya lo cumple con margen |
| Formularios | Toda entrada con `<label>` asociado; los errores son texto, no solo color, y se anuncian |
| Imagenes | Los posters llevan `alt` con el nombre del plato; las decorativas, `alt=""` |
| Movimiento | Todo lo animado respeta `prefers-reduced-motion: reduce`, incluido el arranque del video |
| Zoom / reflujo | Usable al 200% de zoom y a 320 CSS px de ancho sin scroll horizontal |
| Regiones vivas | El estado de subida de video se anuncia con `aria-live="polite"` |

### Agregados de WCAG 2.2, los que mas se olvidan

| SC | Requisito | Como se cumple aca |
|---|---|---|
| 2.4.11 Foco no oculto | Un elemento enfocado nunca queda tapado por el header sticky | `scroll-margin-top` en los objetivos de foco de la carta |
| 2.5.7 Movimientos de arrastre | Toda interaccion de arrastre tiene alternativa de un solo puntero | **Reordenar es con botones subir/bajar, no arrastrando** — decision de los pasos 14 y 15 |
| 2.5.8 Tamano del objetivo | Objetivos de al menos 24x24 CSS px | Se usan **44x44**: es una carta que se maneja con el pulgar |
| 3.3.7 Entrada redundante | Nada que ya se haya escrito en un flujo se vuelve a pedir | El panel no tiene flujos de varios pasos |
| 3.3.8 Autenticacion accesible | Sin prueba cognitiva sin alternativa; se permite pegar y el gestor de contrasenas | El login es email + contrasena, sin captcha ni puzzle |

### Verificacion

```bash
pnpm test:e2e tests/e2e/a11y.spec.ts   # expect: exit 0, 0 failed
```

**Este chequeo es un subconjunto estructural, y se dice explicitamente.** No corre axe-core: ese
paquete no tiene pin verificado en §11, y una dependencia sin verificar dentro del gate final es peor
que un chequeo mas chico. El spec afirma exactamente un `h1` por pagina, el landmark `main`, el enlace
de salto enfocable primero, `alt` en toda imagen, nombre accesible en todo boton y reflujo sin scroll
horizontal a 320 CSS px. Incorporar axe-core esta en §20.4.

Los chequeos automaticos atrapan alrededor de un tercio de los problemas reales. Antes del lanzamiento
se suman tres pasadas manuales, listadas en §20.1: recorrido solo con teclado de la carta y del panel,
una pasada con lector de pantalla sobre la carta publica, y una pasada al 200% de zoom en el
breakpoint mas angosto.

---

## 16. Observabilidad y costo

### Instrumentacion

| Senal | Herramienta | Que captura | Quien la mira |
|---|---|---|---|
| Errores | Logs de Vercel (runtime logs) | Excepciones no capturadas de Server Components, Server Actions y route handlers | El dueno del producto |
| Logs | `console.error` estructurado como JSON con `event`, `route` y `restaurant_slug` | Un evento por frontera: error de consulta, error de firma, subida fallida | El dueno del producto |
| Metricas | Vercel Analytics (el basico, incluido) | Peticiones, errores y latencia por ruta | El dueno del producto |
| Uptime | Chequeo externo gratuito sobre `/api/health?deep=1`, cada 5 minutos | Que el sitio y la base respondan desde afuera | El dueno del producto |

**Deliberadamente no se instala Sentry, PostHog ni un backend de OpenTelemetry.** Con tres usuarios
internos y menos de cinco restaurantes, los logs de Vercel mas un chequeo de uptime responden todas
las preguntas que hoy se pueden hacer; sumar un proveedor es una cuenta mas, un SDK mas en el bundle y
una politica de datos mas. §20.4 dice cuando revisarlo.

### Las metricas que importan en este proyecto

| Metrica | Objetivo | Alertar en |
|---|---|---|
| Tiempo hasta el primer poster decodificado en 4G lento | menos de 4000 ms | 5000 ms — se verifica en CI, no en produccion |
| Tasa de error 5xx en `/[slug]` | menos de 0.5% | 2% durante 5 minutos |
| Disponibilidad de `/api/health?deep=1` | 99.5% mensual | dos fallos consecutivos |
| Creditos de Cloudinary consumidos en el mes | menos de 20 de 25 | 20 — es el disparador de migracion del riesgo 2 |

### Health check

`GET /api/health` responde 200 mientras el proceso viva. `GET /api/health?deep=1` ademas consulta
`restaurants` con el cliente anonimo y devuelve `"db":"up"`, o 503 si la base no responde. El chequeo
externo apunta a la version `deep`: un health que solo prueba que el proceso arranco deja al balanceador
mandando trafico a una instancia rota.

### Modelo de costo

| Servicio | Free | Costo al volumen v1 | Costo a 10x | Precipicio a vigilar |
|---|---|---|---|---|
| Vercel | Hobby | USD 0 | USD 20/mes (Pro) | Uso comercial: el plan Hobby lo prohibe, asi que **con el primer restaurante que paga hay que pasar a Pro** |
| Supabase | 500 MB de base, 2 proyectos activos | USD 0 | USD 25/mes (Pro) | Pausa por inactividad en Free: un proyecto sin trafico 7 dias se pausa |
| **Cloudinary** | **25 creditos/mes** | **USD 0 mientras sea solo la demo** | **USD 99/mes** | **~830 vistas de video al mes en total.** Ver el riesgo 2 de §20.2 |
| Bunny Stream (destino de migracion) | — | ~USD 1/mes | ~USD 5/mes | Minimo de USD 1/mes |
| GitHub Actions | 2000 minutos/mes | USD 0 | USD 0 | Los minutos de e2e con build completo |

**Costo mensual estimado al lanzar: USD 0 mientras solo exista la demo; USD 20-21 el mes en que entra
el primer restaurante que paga** (Vercel Pro por uso comercial mas el minimo de Bunny). El item que
escala de forma no lineal es el video: 1 GB de entrega equivale a unos 500 segundos de video SD, asi
que **un solo restaurante real —50 comensales por dia mirando 5 platos— son unas 7.500 vistas al mes,
nueve veces el tier gratuito entero de Cloudinary**. La palanca mas barata para cortarlo es
exactamente la migracion del riesgo 2, que la abstraccion del paso 11 ya dejo lista.

---

## 17. Ruteo de modelos

NOT APPLICABLE — este proyecto no llama a ningun LLM en tiempo de ejecucion. El recomendador con IA es
el Paso 2 del producto y esta explicitamente fuera de alcance en §1.

---

## 18. Skills a usar durante el build

Ninguna es obligatoria. Si una no esta disponible, se cae en la guia de este blueprint, se anota en una
linea y se sigue. **Ninguna lleva barra al principio salvo `/humanizalo`**, que si es un slash command;
escribir una barra delante de una skill que se auto-activa es un no-op silencioso.

| Skill | Pasos | Que aporta ahi | Instalar |
|---|---|---|---|
| `ui-ux-pro-max` | 2 | Paleta, escala tipografica y estilo de componente. **No estaba instalada en la sesion de diseno**: §7 salió de `knowledge/capabilities/styling.md` | `/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill` y despues `/plugin install ui-ux-pro-max@ui-ux-pro-max-skill` |
| `frontend-design` | 2, 9, 10, 13, 14, 15 | Pantallas de calidad de produccion sobre los tokens ya definidos | `/plugin marketplace add anthropics/skills` y despues `/plugin install example-skills@anthropic-agent-skills` |
| `emil-design-eng` | 10, 12 | Movimiento y transiciones de la vista de plato y del reproductor. Hay que darle una pregunta concreta: una invocacion vacia devuelve un discurso generico | `npx skills@latest add emilkowalski/skills` |
| `playwright-cli` | 2, 7, 8, 12, 17 | Autoria de specs e2e y diagnostico de fallos con traza | `npm install -g @playwright/cli@latest` y despues `playwright-cli install --skills` |
| `/humanizalo` | 6 | Que las descripciones y los `pairing_text` de BRASA suenen a un dueno de parrilla y no a un modelo. Es la demo de ventas: el texto es parte del producto | `git clone https://github.com/Hainrixz/humanizalo.git ~/.claude/skills/humanizalo` |

---

## 19. Workspace del agente

**Modo bundle.** Los artefactos de esta seccion estan emitidos como **archivos reales** bajo
`blueprints/carta-video-restaurantes/workspace/`, no como bloques de codigo aca. `workspace/` refleja
exactamente el layout del repositorio destino: la ruta de un archivo bajo `workspace/` es su ruta en el
proyecto. El builder copia **el contenido de ese unico directorio** a la raiz del proyecto, con el
guard por marcador del paso 4 de §10 Bootstrap.

```
workspace/
├── CLAUDE.md                     # 19.1
├── AGENTS.md                     # 19.2
├── .gitignore                    # 19.6 — con !.env.example despues de .env*
├── .env.example                  # 19.6
├── biome.json                    # 19.6 — con css.parser.tailwindDirectives
├── tsconfig.json                 # 19.6
├── next.config.ts                # 19.6
├── postcss.config.mjs            # 19.6
├── vitest.config.ts              # 19.6
├── playwright.config.ts          # 19.6
├── tests/setup.ts                # 19.6
├── src/lib/supabase/.gitkeep     # 19.6 — para que `pnpm db:types` pueda redirigir
└── .claude/
    ├── settings.json             # 19.3
    ├── rules/                     # 19.5 — 4 archivos
    └── skills/                    # 19.4 — 2 skills
```

**Archivos que el copiado nunca pisa:** `package.json` y `pnpm-lock.yaml`. No estan en `workspace/`
a proposito — los autoria `pnpm create next-app` y §10 solo los edita con `npm pkg set`. El guard por
marcador (`.workspace-applied`) hace que la segunda corrida de Bootstrap no revierta nada.

**No se emite `.claude/commands/`.** Un slash command solo se dispara cuando lo escribe un humano, y
un builder autonomo no escribe nada.

### 19.1 `CLAUDE.md`

Archivo real en `workspace/CLAUDE.md`. Bajo 200 lineas, comandos primero, con la tabla de fronteras de
importacion, los tokens literales de §7, la tabla de entorno y siete reglas no negociables.

### 19.2 `AGENTS.md`

Archivo real en `workspace/AGENTS.md`. Puente tool-neutral de ~40 lineas: que es el proyecto, la tabla
de comandos, las siete reglas no negociables y un puntero a `CLAUDE.md`. Los agentes que no leen
`CLAUDE.md` leen este y nada mas.

### 19.3 `.claude/settings.json`

Archivo real en `workspace/.claude/settings.json`. **Contiene en `permissions.allow` cada comando que
aparece en un `Verify` de §9 y en el gate de §20.1**: los 15 scripts de `package.json`, `pnpm exec`,
`bash scripts/smoke-http.sh`, `node -e`, `node --env-file=.env.local`, `grep`, `test`, `curl`, `npm pkg
set`, `wc` y las subordenes de git que usan los checkpoints. **`supabase link` y `supabase db push`
estan en `allow`**, porque con la base en la nube son los comandos de todos los dias y los usan los
gates de los pasos 3, 4 y 6. En `deny`: leer `.env` y `.env.local`, `git push`, `pnpm dlx vercel`,
`rm -rf supabase/migrations` y **todo lo destructivo sobre la base** — `pnpm db:reset`,
`supabase db reset` y `supabase db remote`.

### 19.4 Skills del proyecto

| Skill | Se dispara con | Que automatiza |
|---|---|---|
| `.claude/skills/agregar-migracion/SKILL.md` | "agregar una columna", "nueva tabla", "cambiar la policy" | Crear el archivo con la CLI (nunca a mano), escribir el SQL con RLS incluido, aplicar con `db:push`, regenerar tipos y recrear el admin |
| `.claude/skills/agregar-plato-al-seed/SKILL.md` | "agregá un plato a la demo", "cambiá el precio", "falta un postre" | Elegir el plato por la regla del movimiento, precio en centavos, poster SVG, `pairing_text` en voz del dueno, UUID fijo, reaplicar el seed |

### 19.5 `.claude/rules/*.md`

| Archivo | Globs `paths` | Cubre |
|---|---|---|
| `base-de-datos-y-rls.md` | `supabase/**`, `src/server/**`, `src/lib/supabase/**`, `scripts/**` | Convenciones de esquema, migraciones, policies, clientes |
| `estilos-y-tokens.md` | `src/app/**/*.css`, `src/app/**/*.tsx`, `src/components/**` | Tokens, Tailwind v4, tema unico, posters, movimiento, foco |
| `video.md` | `src/lib/video/**`, `src/components/menu/video-player.tsx`, `src/components/admin/video-uploader.tsx`, `src/app/api/video/**` | La abstraccion, la interfaz, el poster, la reproduccion, la subida |
| `tests.md` | `tests/**`, `vitest.config.ts`, `playwright.config.ts` | Reparto de capas, base real, limpieza, prohibicion de numeros magicos y literales del runtime |

### 19.6 Configuracion critica para los `Verify` e infraestructura local

| Archivo | Ruta en el proyecto | Que `Verify` lo necesita | Resolucion / entorno que carga | Exclusion del bundle |
|---|---|---|---|---|
| `vitest.config.ts` | raiz | pasos 1–6, 9, 11, 13–16 | `resolve.alias` `@` → `./src`; `process.loadEnvFile(".env.local")` en la primera linea; `fileParallelism: false` porque los tests comparten una base | `exclude: [..., "blueprints/**"]` |
| `playwright.config.ts` | raiz | pasos 2, 7, 8, 10, 12, 13–17 | `process.loadEnvFile(".env.local")`; `webServer` que hace `pnpm build` y arranca en 3101 | `testIgnore: ["**/blueprints/**", ...]` |
| `.gitattributes` | raiz | todo checkout | Fuerza `eol=lf` en toda plataforma. Sin el, git en Windows (`core.autocrlf=true` por defecto) hace checkout con CRLF, `biome.json` fija `lineEnding: lf`, y `pnpm lint` sale 1 en un clon limpio | n/a |
| `tests/setup.ts` | `tests/setup.ts` | todo `pnpm test` | Falla con nombre si falta alguna de las tres variables de Supabase, y se niega a correr si `TEST_DB_PROJECT_REF` no coincide con el ref parseado de `NEXT_PUBLIC_SUPABASE_URL` | n/a — no recorre el arbol |
| `tsconfig.json` | raiz | `pnpm typecheck` en todos los pasos | `paths` `@/*` → `./src/*`; `allowImportingTsExtensions` y `rewriteRelativeImportExtensions` para que `tsc` acepte los especificadores `.ts` de `scripts/` | `exclude: ["node_modules", "blueprints", ".next"]` |
| `biome.json` | raiz | `pnpm lint` en todos los pasos | `css.parser.tailwindDirectives: true` — sin esa clave `biome check` muere parseando el `@theme` que genero el propio scaffolder; `indentStyle: "space"`, `indentWidth: 2` para coincidir con lo que deja el scaffold | `files.includes: ["**", "!**/blueprints/**", ...]` |
| `next.config.ts` | raiz | `pnpm build` en pasos 1, 3, 8, 10, 17 | Cabeceras de seguridad. Sin bloque `webpack()`: Turbopack lo ignoraria | n/a — solo compila `src/` y `app/` |
| `postcss.config.mjs` | raiz | `pnpm build` | `@tailwindcss/postcss`, la unica entrada valida en v4 | n/a |
| `.env.example` | raiz | ninguno directamente; es el contrato de §10 | Lleva los valores locales literales | n/a |
| `.gitignore` | raiz | los `Checkpoint` de los pasos 6 y 17 | `!.env.example` **despues** de `.env*` | `blueprints/` **no** se ignora: el bundle se commitea |
| `src/lib/supabase/.gitkeep` | `src/lib/supabase/` | `pnpm db:types` (paso 6) | El directorio tiene que existir para que la redireccion `>` funcione sin un `mkdir -p` no portable | n/a |
| `supabase/config.toml` | `supabase/` | `pnpm db:push`, `pnpm db:reset` (pasos 3–6 y todos los de integracion) | **Lo genera la CLI** en §10 Bootstrap paso 8, con guard `[ -f supabase/config.toml ] \|\| supabase init --force < /dev/null`. No se emite a mano porque su forma cambia entre versiones de la CLI | n/a |

#### Matriz de convencion de resolucion

**La convencion, dicha una sola vez:** dentro de `src/` y `tests/` se usa el alias `@/` para cruzar un
directorio de primer nivel y **extension explicita (`.ts` / `.tsx`) en todo import relativo**; dentro
de `scripts/` se usan **unicamente rutas relativas con extension**, nunca `@/`.

| Contexto | Comando que lo ejercita | La convencion ahi | Config y opcion literal que la hace funcionar |
|---|---|---|---|
| Codigo de aplicacion | `pnpm build` | `@/lib/env.ts`, `./dish-card.tsx` | `tsconfig.json` — `paths: { "@/*": ["./src/*"] }` y `allowImportingTsExtensions: true`; el resolvedor de Turbopack lee `paths` |
| Archivos de test | `pnpm test` | `@/lib/format/price.ts`, `./helpers/supabase-clients.ts` | `vitest.config.ts` — `resolve.alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) }`. **El runner no hereda `paths` de tsconfig: por eso el alias esta escrito ahi** |
| Scripts sueltos | `pnpm db:admin` → `node --env-file=.env.local scripts/create-admin.ts` | `./x.ts` relativo, **nunca `@/`** | Node 24 quita tipos y resuelve especificadores **literalmente**: `./x.ts` funciona y `./x.js` daria `ERR_MODULE_NOT_FOUND`. Para que ese mismo archivo pase `tsc --noEmit`, `tsconfig.json` lleva `allowImportingTsExtensions: true`. **Node no lee `paths`, por eso `@/` esta prohibido aca** |
| Build / bundle | `pnpm build` | igual que el codigo de aplicacion | Turbopack, con `paths` de `tsconfig.json`. `next.config.ts` no define alias propios |
| Runner de e2e | `pnpm test:e2e` | rutas relativas dentro de `tests/e2e/` | `playwright.config.ts` — `testDir: "tests/e2e"`; los specs no importan de `src/`, hablan con el servidor por HTTP |

**Desviacion registrada:** `knowledge/runtime-tracks/ts-node.md` recomienda `module: "nodenext"` junto
con esos dos flags. Aca el `tsconfig.json` emitido usa `module: "esnext"` y
`moduleResolution: "bundler"`, que es lo que exige el App Router de Next 16, y conserva los dos flags.
El motivo: con `nodenext` y un `package.json` sin `"type": "module"`, TypeScript trata cada `.ts` como
CommonJS y rechaza los imports de paquetes solo-ESM, ademas de chocar con los tipos del plugin de Next.
El flag que de verdad sostiene la convencion es `allowImportingTsExtensions`, y ese esta.

#### Reconciliacion de valores entre artefactos

| Valor compartido | Fuente unica | Valor literal | Donde mas aparece | Comparado |
|---|---|---|---|---|
| Puerto del servidor de humo | `scripts/smoke-http.sh` (`SMOKE_PORT`) | `3100` | §9 pasos 1, 3, 8, 10 · §20.1 | si |
| Puerto del servidor de e2e | `playwright.config.ts` (`PORT`) | `3101` | `webServer.command`, `webServer.url`, `use.baseURL` | si |
| Ruta del health check | `src/app/api/health/route.ts` | `/api/health` | `scripts/smoke-http.sh`, `playwright.config.ts` `webServer.url`, §9 pasos 1 y 3, §16, §20.1 | si |
| Alias de modulos | `tsconfig.json` (`paths`) | `@/*` → `./src/*` | `vitest.config.ts` `resolve.alias`, §3, §19.1 | si |
| Ruta de los tipos generados | `package.json` (`scripts.db:types`) | `src/lib/supabase/database.types.ts` | `biome.json` (excluido del lint), §3, §9 paso 6, `workspace/src/lib/supabase/.gitkeep` | si |
| Ruta del bundle | este blueprint | `blueprints/` | `biome.json` `files.includes`, `tsconfig.json` `exclude`, `vitest.config.ts` `exclude`, `playwright.config.ts` `testIgnore`, §10 Bootstrap (`BUNDLE`) | si |
| Slug del restaurante demo | `supabase/seed.sql` | `brasa` | §9 pasos 8, 9, 10, 12, 17 · `tests/e2e/**` · §20.1 | si |
| Id del primer plato demo | `supabase/seed.sql` | `d0000000-0000-4000-8000-000000000001` | §9 paso 10, epica 02 | si |
| Color de marca por defecto | `supabase/migrations` (`default '#E8562A'`) | `#E8562A` | §7, `parseBrandColor`, `supabase/seed.sql`, `CLAUDE.md`, §9 paso 2 | si |
| Nombre del archivo de proxy | Next 16 | `proxy.ts` | §3, §8, §9 paso 7, `CLAUDE.md`, `AGENTS.md`, epica 02 | si |

#### Reconciliacion de artefactos byte-exactos

| Artefacto byte-exacto | Lo escribe | Se compara por primera vez en | Reglas del blueprint que lo restringen | Llamada del runtime que lo produce, sobre el pin de §11 | Ambas confirmadas |
|---|---|---|---|---|---|
| `formatPrice(1350000, "ARS")` → `$ 13.500,00` | paso 9 (`src/lib/format/price.ts`) | paso 9 (`tests/unit/price.test.ts`) | §5 *Formato de precio*: miles con `.`, decimal con `,`, siempre 2 decimales, `ARS` → `$`, un espacio U+0020. §4: `price` es entero de centavos, y `1350000` es el mismo literal que usa el criterio del paso 3 | Ninguna. **La funcion es pura y no usa `Intl`**, asi que la salida no depende de los datos ICU de Node ni del navegador: es concatenacion de strings sobre aritmetica entera | si |
| `formatPrice(0, "ARS")` → `$ 0,00` | paso 9 | paso 9 | Mismas reglas de §5; el caso de borde de cero decimales | Ninguna — misma funcion pura | si |
| `formatPrice(380000, "USD")` → `US$ 3.800,00` | paso 9 | paso 9 | §5: `USD` → `US$`. El valor `380000` coincide con el precio de las empanadas del seed del paso 6 | Ninguna — misma funcion pura | si |
| `{"ok":true` (subcadena del health) | paso 1 (`src/app/api/health/route.ts`) | paso 1 (`scripts/smoke-http.sh`) | §5 *`GET /api/health`*: cuerpo `{"ok":true,"service":"carta"}` | `JSON.stringify({ ok: true })` produce `{"ok":true}` sin espacios en **cualquier** motor de JavaScript: el formato lo fija la especificacion del lenguaje, no la version de Node | si |
| `"db":"up"` (subcadena del health profundo) | paso 3 | paso 3 (`scripts/smoke-http.sh`) | §5: con `deep=1` el cuerpo agrega `"db":"up"` | Misma razon: `JSON.stringify` sin espacios, fijado por la especificacion | si |

**Ninguna fila necesita ejecutar codigo para confirmarse**, y eso es una decision de diseno, no una
casualidad: este blueprint no escribe ni un solo literal producido por el runtime. Los mensajes de
error de Postgres, los textos de zod y la salida de `Intl.NumberFormat` cambian entre versiones, asi
que **ningun test los afirma**: los tests afirman conteos de filas, presencia de error, codigos y
propiedades. `formatPrice` es la unica excepcion deliberada, y es una excepcion segura justamente
porque se escribio sin `Intl`.

---

## 20. Gate de aceptacion, riesgos y registro de decisiones

### 20.1 Gate global de aceptacion

El proyecto esta **terminado** cuando cada comando de abajo sale con 0 sobre un checkout limpio, y no
antes. Es el mismo conjunto que corre CI y contra el que se mide cada paso de §9.

```bash
pnpm install --frozen-lockfile   # expect: exit 0, no modifica el lockfile
test -f .env.local                # expect: exit 0 — lo escribe el humano, no el build (§10 paso 8)
pnpm db:push                      # expect: exit 0, migraciones + seed aplicados al proyecto enlazado
pnpm db:push                      # expect: exit 0 OTRA VEZ — prueba que el seed es idempotente
pnpm db:admin                     # expect: exit 0, usuario admin asegurado
pnpm typecheck                    # expect: exit 0, cero errores
pnpm lint                         # expect: exit 0, cero errores y cero warnings
pnpm test                         # expect: exit 0, 0 failed, 0 skipped
pnpm exec playwright install chromium   # expect: exit 0
pnpm test:e2e                     # expect: exit 0, 0 failed — incluye a11y y perf-poster
pnpm build                        # expect: exit 0

# El artefacto construido se EJECUTA, no solo se compila:
bash scripts/smoke-http.sh /api/health 200 "/api/health?deep=1" 200 /brasa 200 /no-existe 404 /admin/platos 307
# expect: exit 0 — el servidor arranca, la carta demo responde, el panel redirige al login

# La clave de servicio no puede estar en nada que llegue al navegador:
grep -rl "$(node -e "process.loadEnvFile('.env.local');process.stdout.write(process.env.SUPABASE_SERVICE_ROLE_KEY)")" .next/static; test $? -eq 1
# expect: exit 0 — codigo 1 de grep significa "ningun archivo del bundle de cliente la contiene"

# La demo de ventas sobrevivio a la suite: los tests comparten base con BRASA (§12).
node --env-file=.env.local -e "
const {createClient}=require('@supabase/supabase-js');
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
db.from('dishes').select('id',{count:'exact',head:true}).eq('restaurant_id','b0000000-0000-4000-8000-000000000001')
  .then(({count,error})=>{if(error||count!==12){console.error('BRASA quedo con',count,'platos, esperaba 12');process.exit(1)}});
"
# expect: exit 0 — la demo sigue completa despues de correr todos los tests

# Ninguna fila de test quedo suelta en la base compartida:
node --env-file=.env.local -e "
const {createClient}=require('@supabase/supabase-js');
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
db.from('restaurants').select('slug').like('slug','__test_%')
  .then(({data,error})=>{if(error||(data&&data.length)){console.error('quedaron restaurantes de test:',data);process.exit(1)}});
"
# expect: exit 0 — las fabricas limpiaron lo suyo

# Los scripts sueltos no pueden usar el alias @/ (Node no lee `paths` de tsconfig):
grep -rn "from \"@/" scripts/; test $? -eq 1
# expect: exit 0 — codigo 1 de grep significa "ninguna coincidencia"
```

Mas estos gates manuales, chequeados una vez antes del lanzamiento:

- [ ] Cada paso de §9 tiene su tag de checkpoint en git: `test "$(git tag -l 'step-*' | wc -l)" -eq 18` sale con 0.
- [ ] Cada archivo que §10 nombra como commiteado esta en el checkout limpio — **un path por invocacion**, para que un fallo sea del archivo y no del comando: `git ls-files --error-unmatch .env.example` sale 0, y lo mismo para `biome.json`, `tsconfig.json`, `vitest.config.ts`, `playwright.config.ts`, `next.config.ts`, `postcss.config.mjs`, `tests/setup.ts`, `scripts/smoke-http.sh`, `pnpm-lock.yaml`, `supabase/seed.sql`, `src/lib/supabase/database.types.ts`, `.github/workflows/ci.yml`.
- [ ] Ninguno de esos paths esta ignorado, **afirmando el codigo especifico** y un path por invocacion: `git check-ignore -q .env.example; test $? -eq 1` sale con 0 (codigo 1 significa "no coincide con ninguna regla"; el 128 de un error de uso ahora falla el gate). Repetir por cada path de la lista anterior.
- [ ] El archivo de ignore estuvo en su lugar antes del primer commit: `git log --diff-filter=A --format=%s -- .gitignore` muestra `chore: bootstrap`, no el mensaje de un paso de §9.
- [ ] Cada fila de la tabla *Reconciliacion de artefactos byte-exactos* de §19.6 dice `si`.
- [ ] El bloque Bootstrap de §10 se corrio una segunda vez sobre un arbol ya inicializado, **salio con 0** y no cambio nada que importe: `package.json` sigue listando cada dependencia instalada y el comando siguiente sigue encontrando sus binarios.
- [ ] Cada fila de la tabla *Reconciliacion de valores entre artefactos* de §19.6 dice `si`, y los gates de lint, formato y typecheck se corrieron desde la raiz del proyecto **con el bundle presente en `blueprints/`**.
- [ ] Cada no-objetivo de §1 sigue sin construirse — en particular: no hay pasarela de pagos, no hay generador de QR, no hay toggle de tema claro y no hay pantalla de registro abierta.
- [ ] Cada variable de §10 esta seteada en Vercel y ausente del repositorio.
- [ ] Los flujos criticos de §13 pasan contra la URL de produccion.
- [ ] Pasada solo con teclado sobre la carta publica y sobre el panel, y una pasada con lector de pantalla sobre la carta (§15).
- [ ] Pasada al 200% de zoom en el breakpoint mas angosto (§15).
- [ ] **Un video real subido de punta a punta contra Cloudinary**: el `.m3u8` que arma `CloudinaryProvider` reproduce en un celular real y el poster `.jpg` derivado carga. Esto necesita una cuenta y red, por eso es un chequeo de lanzamiento y no un gate del build.
- [ ] Un rollback ejecutado una vez, a proposito, en un entorno de preview (§12).
- [ ] El chequeo externo de uptime sobre `/api/health?deep=1` esta configurado y notifico al menos una vez en una prueba deliberada (§16).
- [ ] El consumo de creditos de Cloudinary del mes esta a la vista y hay una alerta puesta en 20 de 25 (§16, riesgo 2).

**Ninguna advertencia se ignora.** Una advertencia tolerada se vuelve permanente, y la proxima de
verdad se esconde adentro.

### 20.2 Registro de riesgos

| Riesgo | Probabilidad | Impacto | Senal temprana | Mitigacion |
|---|---|---|---|---|
| **El cuello de botella real es el contenido, no el codigo.** 40 platos son 40 videos que alguien tiene que filmar, cortar a 15 segundos y subir. Cinco restaurantes son 200 videos, y los filma el dueno del producto | **A** | **A** | El segundo restaurante tarda mas de dos semanas en tener la carta completa | No tiene arreglo tecnico, **pero cambia el panel**: subida multi-archivo, duplicar y reordenar dejan de ser lujos y son criterios de aceptacion de los pasos 15 y 16. El obituario mas probable a seis meses no es "la app fallo" sino "la app anda y tiene 3 clientes porque filmar es el trabajo" |
| **El tier gratuito de Cloudinary muere con el primer restaurante real.** 25 creditos al mes; 1 credito = 1 GB de entrega y 1 GB son ~500 segundos de video SD, o sea **~830 vistas de video al mes en total**. Un restaurante (50 comensales/dia x 5 platos) son ~7.500 vistas: nueve veces el tier entero. El siguiente escalon es **USD 99/mes** | **A** | **M** | El contador de creditos del panel de Cloudinary pasa de 20 en un mes | **Disparador de migracion explicito: el dia que el primer restaurante que paga sale a produccion, se migra a Bunny Stream o se paga el escalon.** Bunny hace lo mismo por ~USD 1/mes a este volumen (almacenamiento USD 0.01/GB, entrega USD 0.005–0.01/GB, encoding gratis, minimo USD 1). La mitigacion ya esta construida: la abstraccion del paso 11 hace que sea un archivo nuevo y una variable de entorno |
| **La metrica que define el producto no tenia test.** La spec §3.4 dice que lo que importa es cuanto tarda el primer frame en un celular con 4G malo, y eso no es un comando que salga con 0 | **A** | **A** | Nadie sabria decir si una version es mas lenta que la anterior | Convertida en dos cosas verificables en el paso 17: **presupuesto de bytes** (menos de 60 KB por poster) y **tiempo de decodificado bajo red limitada** (menos de 4000 ms a 400 kbps y 300 ms de latencia), en el proyecto `slow-4g` de Playwright. La metrica deja de ser una opinion |
| **RLS es lo unico que separa los datos de dos restaurantes.** Un chequeo de alcance olvidado filtra la carta de un competidor | **M** | **A** | Un test de aislamiento que se salta o se comenta "porque molesta" | Los tests de aislamiento son **un paso propio (5) y van ANTES del CRUD**, no despues. Cada afirmacion negativa se confirma dos veces: la respuesta del cliente y el estado real leido con la clave de servicio. Ademas: sin ORM, `with check` en toda policy de escritura, y `restaurant_id` sacado siempre del actor y nunca del formulario |
| Sin rate limiting propio en `/api/video/signature` | B | M | Picos de firmas en los logs de Vercel | La ruta exige sesion y solo hay tres usuarios internos. Si se abre el panel a restaurantes, se agrega limite por usuario antes de dar el primer acceso externo |
| El plan Hobby de Vercel prohibe uso comercial | M | M | El primer restaurante que paga | Pasar a Pro (USD 20/mes) el mismo mes. Esta en el modelo de costo de §16 |
| Un `supabase db push` sin revisar rompe el esquema en vivo. **Sin stack local no hay ensayo previo**: la migracion se estrena sobre una base real | M | A | Un `db push` que sale con error a mitad de camino | `db push` es aditivo y no borra datos, y el gate del paso 3 verifica el esquema resultante inmediatamente. Lo **destructivo** (`pnpm db:reset`, `supabase db reset`) esta en `deny` de `.claude/settings.json`: el agente no lo ejecuta nunca por su cuenta, solo un humano a mano |
| **El proyecto gratis de Supabase se pausa a la semana sin actividad.** El patron de uso de una demo de ventas —se mira poco y de golpe— es exactamente el que la dispara. El escenario concreto: sentarse con un dueno de restaurante, abrir la carta, y que no cargue | **A** | **A** | El panel de Supabase muestra el proyecto en estado *paused* | Tarea programada de Vercel en el paso 17 que hace una consulta trivial una vez por dia. Cae en el plan gratis. **Trampa a respetar: Vercel Cron dispara con `GET`**, asi que un handler que solo exporte `POST` devuelve 405, el panel lo muestra sano y el trabajo nunca ocurre. Ademas: a los 90 dias pausado se pierde el restaurar de un clic |
| **Un unico proyecto de Supabase para desarrollo, tests y demo.** El plan gratis da 2 activos y hay uno disponible. Los tests de integracion escriben en la misma base donde vive BRASA | M | M | Un `delete` sin filtro en un helper de tests, o filas `__test_` que quedan visibles en la carta | Tres capas: prefijo `__test_` obligatorio y toda limpieza filtrada por el; `tests/setup.ts` exige `TEST_DB_PROJECT_REF` igual al ref del proyecto, de modo que pegar credenciales de un cliente real hace que la suite se niegue a arrancar; y el seed es idempotente, asi que `pnpm db:push` reconstruye la demo con un comando. **Disparador de separacion: el primer restaurante que paga sale a produccion en un proyecto propio, financiado por lo que paga** |

### 20.2.1 Lo que se ejecuto de verdad antes de entregar este blueprint

El bloque de arranque de §10 no se escribio desde la documentacion: **se ejecuto**, en un directorio
temporal, con el bundle adentro. Seis defectos aparecieron ahi y **los seis ya estan corregidos en el
texto de arriba**. Se dejan anotados porque cada uno habria costado una tarde y ninguno es visible
leyendo:

| # | Que fallaba | Por que no se veia leyendo |
|---|---|---|
| 1 | `corepack enable --install-directory` aborta con `ENOENT` si el directorio no existe — no lo crea | El `\|\| true` se comia el error; el build moria dos comandos despues con `pnpm: command not found`, que no se parece a la causa |
| 2 | `create-next-app` rechaza el subdirectorio `_scaffold`: npm prohibe nombres con guion bajo inicial — **y sale con codigo 0** | El nombre elegido para esquivar un problema de nombres tenia el mismo problema. Con `set -e` el script sigue de largo |
| 3 | `pnpm install` y `pnpm add` **piden confirmacion por teclado** para purgar `node_modules` y abortan sin TTY | Con `\|\| true`, dos de los tres `pnpm add` fallaban en silencio y `--frozen-lockfile` restauraba los pines del andamiaje: el build seguia con TypeScript 5.9.3 y sin Supabase |
| 4 | `pnpm lint` sale 1 sobre un andamiaje intacto: los SVG de ejemplo de `create-next-app` violan `lint/a11y/noSvgWithoutTitle` | El gate del paso 1 fallaba antes de que existiera una linea de codigo propio |
| 5 | En un clon nuevo en Windows, git entrega CRLF, `biome.json` exige LF y `pnpm lint` sale 1 | Solo aparece al clonar en otra maquina. En la original nunca se reproduce |
| 6 | El `tsconfig.json` que emitia el bundle no pasaba el formateador del propio proyecto | El bootstrap lo tapaba con `biome check --write`; el fallo aparecia recien si el archivo se restauraba desde el bundle |

**Lo que quedo verificado ejecutandolo:** toolchain fijado, andamiaje creado, las 18 dependencias con
los pines de §11, copiado de `workspace/`, edicion del manifiesto, `biome check` en 0, repositorio
inicializado con su primer commit, `.env.example` commiteado a pesar del ignore, `tsc --noEmit` en 0,
`pnpm build` en 0, **el servidor levantado respondiendo 200 en `/` y 404 en una ruta inexistente**,
bootstrap corrido una segunda vez sin romper nada, y un clon limpio pasando el lint.

**Lo que NO se pudo verificar:** todo lo que toca la base. Requiere credenciales de un proyecto de
Supabase real, que no existian al generar esto. Los pasos 3 a 6 se estrenan en tu maquina.

### 20.3 Registro de decisiones

| # | Decision | Alternativa rechazada | Por que | Se revierte si |
|---|---|---|---|---|
| 1 | Track TypeScript/Node con Next.js App Router | Rails o Laravel con vistas server-rendered | La UI *es* el producto y el ecosistema de React para video, streaming y hosting no tiene competencia cercana. Un solo lenguaje en servidor, cliente y scripts | El equipo crezca con gente que no escribe TypeScript |
| 2 | **Sin ORM: `supabase-js` + tipos generados** | Drizzle o Prisma | **Un ORM se conecta por TCP con rol administrador y RLS no se aplica en ese camino.** Tendriamos policies escritas, tests en verde y nada protegido. `supabase-js` va por HTTP con el JWT del usuario, que es lo unico que hace que las policies se ejecuten. Efecto lateral: sin conexiones directas no hay agotamiento del pool | El aislamiento deje de depender de RLS, es decir, si se moviera a un backend propio con un guard de autorizacion en cada consulta y tests que lo prueben |
| 3 | Supabase Auth | Clerk, Auth0 | Los usuarios quedan en **nuestro** Postgres, asi que `auth.uid()` esta disponible dentro de la policy. Con un proveedor externo la identidad vive afuera y RLS deja de poder decidir sola | Aparezca un comprador que exija SAML o SCIM |
| 4 | **Cloudinary ahora, con fecha de vencimiento escrita** | Bunny Stream o Mux desde el dia uno | Cloudinary tiene el mejor tier gratuito para *construir* y para la demo, y deriva el poster del propio video sin subir una foto por plato. Bunny es mas barato en produccion pero no aporta nada durante el desarrollo | El primer restaurante que paga salga a produccion — ver el riesgo 2. **Ese es el disparador, no una sugerencia** |
| 5 | Abstraccion del proveedor de video en `src/lib/video/provider.ts` | Llamar al SDK desde los componentes | Es lo que convierte la decision 4 de una apuesta en una decision reversible: cambiar de proveedor es un archivo nuevo y una variable | Nunca; es la mitigacion del riesgo 2 |
| 6 | Tailwind v4 con tokens como custom properties CSS | CSS Modules o CSS-in-JS | Las custom properties son lo que permite reskinear la carta entera de un restaurante con **una** variable inyectada desde la base. CSS-in-JS en runtime obligaria a marcar componentes como cliente y mataria el server-render | El producto deje de ser multi-marca |
| 7 | **Un solo tema oscuro, sin toggle** | Claro + oscuro con interruptor | El video es el producto y una UI clara le compite. Un toggle son dos paletas que mantener, un test de parpadeo de tema y una cookie, para un comensal que ve la carta durante cuatro minutos | Un restaurante con identidad clara sea un cliente que paga y lo pida por contrato |
| 8 | **Borrar una categoria con platos esta bloqueado** (`on delete restrict`) | `on delete cascade` | El cascade silencioso es de donde sale "se me borro media carta". Un mensaje que dice cuantos platos bloquean el borrado es informacion; un borrado silencioso es una perdida de datos | Nunca |
| 9 | Sin paginacion, sin cursores | Paginacion por cursor en la carta y el panel | El techo asumido es menos de 50 restaurantes y hasta 100 platos cada uno. Cursores para 100 filas es complejidad sin beneficio | Un restaurante supere ~300 platos o la grilla tarde mas de 200 ms en el servidor |
| 10 | Precios como entero en centavos, moneda por restaurante | `numeric` en Postgres | Los float en dinero producen errores de redondeo que no reconcilian con nada. El entero es exacto y el formateo es trabajo de la vista | Nunca |
| 11 | Formateo de precio propio, sin `Intl` | `Intl.NumberFormat("es-AR", ...)` | La salida de `Intl` depende de los datos ICU del runtime: el separador y el tipo de espacio cambian entre versiones de Node y entre Node y el navegador, asi que un test sobre su salida falla por razones ajenas al codigo | Se necesiten mas de tres monedas con reglas de formato distintas |
| 12 | Posters con `<img>` plano, no `next/image` | `next/image` con `remotePatterns` | Cloudinary ya entrega la imagen optimizada y cacheada; cada transformacion de `next/image` en Vercel se cobra; y `next/image` bloquea SVG, que es lo que usa el seed | Los posters dejen de venir de un CDN que ya optimiza |
| 13 | Sin Sentry, sin PostHog, sin OpenTelemetry | Sentry desde el dia uno | Con tres usuarios internos y menos de cinco restaurantes, los logs de Vercel mas un chequeo de uptime responden todas las preguntas que hoy se pueden formular | Haya mas de cinco restaurantes o aparezca el primer "un cliente dice que no le anda y no lo puedo reproducir" |
| 14 | El spec de accesibilidad no usa axe-core | `@axe-core/playwright` en el gate | El paquete no tiene pin verificado en esta sesion, y una dependencia sin verificar dentro del gate final es peor que un chequeo mas chico. El spec estructural cubre aproximadamente la mitad de las violaciones reales | Se verifique la version en el registro y se agregue a §11 — esta en §20.4 |
| 15 | Componentes propios, sin shadcn ni Radix | shadcn con Radix | Tres pantallas y ~8 componentes. `shadcn init` pide input interactivo y bloquea un build desatendido; instalarlo trae 40 primitivos para usar 3 | El panel crezca a mas de diez pantallas con dialogos, combobox y tablas complejas |

### 20.4 Que construir despues

En orden, cada uno con el disparador de la tabla de no-objetivos de §1:

1. **Migrar el video a Bunny Stream.** Disparador: el primer restaurante que paga sale a produccion.
   Es un archivo nuevo en `src/lib/video/` y un valor distinto en `VIDEO_PROVIDER`. Es lo primero de
   esta lista porque el riesgo 2 lo vuelve urgente en cuanto el producto funciona.
2. **Agregar `@axe-core/playwright` al spec de accesibilidad.** Disparador: verificar la version contra
   el registro y agregarla a §11. Sube la cobertura automatica de a11y de la mitad estructural al
   conjunto que axe detecta.
3. **Panel de metricas por restaurante.** Disparador: un restaurante pregunte "cuanta gente miro mi
   carta" durante una renovacion. Es la primera cosa que un cliente va a pedir y que hoy no existe.
4. **Onboarding self-service y alta de usuarios.** Disparador: vender el producto a un restaurante que
   se administre solo. Hoy los usuarios se crean a mano a proposito.
5. **Recomendador con IA (el Paso 2 del producto).** Disparador: cinco restaurantes pagando y evidencia
   de que los comensales piden ayuda para elegir. Recien ahi hay volumen que justifique el costo por
   consulta.

---

*Fin del blueprint. El orden de construccion es §9. Se termina cuando §20.1 esta en verde.*
