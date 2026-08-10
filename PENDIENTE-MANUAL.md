# Pendiente manual

Lo que **no** puede resolver el agente solo: cuentas, claves y decisiones que dependen de vos.
Todo lo demas sale de `blueprints/carta-video-restaurantes/blueprint.md` y `tasks.json`.

> Este archivo se habia perdido: no estaba commiteado en el repo cuando se retomo el proyecto
> el 2026-08-09. Esta reconstruido a partir del blueprint y del estado real de la maquina.

## Estado

**18 de 18 tareas hechas.** Los tres epicos completos, cada uno commiteado y etiquetado.

Gate global: **121 tests de unidad e integracion, 130 de e2e**, los cinco comandos en 0.

## Hecho

- **Repo pusheado**: 18 commits y los 18 tags en `origin/main`.
- **Cloudinary conectado**: las tres claves estan en `.env.local` y se verificaron con un
  ping de solo lectura a `api.cloudinary.com/v1_1/<cloud>/ping` → `{"status":"ok"}`.

### ⚠️ `VIDEO_PROVIDER` se queda en `direct` en esta maquina

No es un pendiente: es lo correcto, y cambiarlo acá **rompe la suite**.

El seed apunta a `seed/<slug>`, que son los SVG de `public/seed/` y no existen en la cuenta
de Cloudinary. Con `VIDEO_PROVIDER=cloudinary` en local, el proveedor arma URLs de
`res.cloudinary.com` para posters que no estan ahi, y se caen los tests de la grilla, los de
accesibilidad, el de presupuesto de bytes y el que exige `503 provider_unavailable`.

`cloudinary` va **solo en produccion**, donde los videos se suben de verdad por el panel.
Lo dice `.env.example`: *"En local y en tests siempre direct"*.

## Lo que falta para que esto este en produccion

1. **Cuenta de Vercel.** Conectar el repo y cargar las variables de entorno del proyecto:

   | Variable | Valor en produccion |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | el mismo de `.env.local` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | idem |
   | `SUPABASE_SERVICE_ROLE_KEY` | idem — marcala como secreta |
   | `VIDEO_PROVIDER` | **`cloudinary`** (acá si) |
   | `CLOUDINARY_CLOUD_NAME` | `dfap1n82b` |
   | `CLOUDINARY_API_KEY` | el de `.env.local` |
   | `CLOUDINARY_API_SECRET` | idem — secreta |
   | `CLOUDINARY_UPLOAD_FOLDER` | `carta/prod` (no `carta/dev`: un nivel por entorno evita mezclar) |
   | `CLOUDINARY_STREAMING_PROFILE` | `hd` |
   | `NEXT_PUBLIC_SITE_URL` | el dominio real, sin barra final |
   | `CRON_SECRET` | el de `.env.local` |

   **Si falta `CRON_SECRET`, el cron anti-pausa recibe 401 todos los dias en silencio** y a
   la semana Supabase pausa el proyecto: el QR de la mesa deja de abrir.

2. **Secretos del CI en GitHub** (Settings > Secrets and variables > Actions):
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `TEST_DB_PROJECT_REF`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`,
   `CRON_SECRET`. Sin ellos el workflow corre y muere en el primer test de integracion.

3. **Cambiar la contrasena del admin.** El default `carta-admin-local` esta escrito en el
   repo. Se cambia con `ADMIN_PASSWORD` en `.env.local` y `pnpm db:admin`.

4. **Revisar el copy de BRASA.** Los 12 platos, sus precios y los textos de maridaje los
   escribio el agente. Es la pantalla de venta: convienen los ojos del que conoce el mercado.

### Hallazgos corregidos en el camino

Cosas que el plan daba por buenas y no lo eran, o bugs que aparecieron al construir. Cada
una esta explicada en el commit de su tarea y anotada en el campo `nota` de `tasks.json`:

1. **`proxy.ts` iba en la raiz.** Con un directorio `src/`, Next lo busca en `src/` e ignora
   el de la raiz **en silencio**. El gate del blueprint (`test -f proxy.ts`) pasaba igual. La
   sesion no se refrescaba nunca: con `jwt_expiry` en 3600, cualquiera se quedaba afuera a la
   hora.
2. **El 404 no se puede devolver desde la pagina.** Next la envuelve en Suspense y la
   streamea, asi que cuando termina su `await` el 200 ya salio. La comprobacion vive ahora en
   el layout del segmento, que es parte del shell.
3. **`loading.tsx` tapaba el 404 del plato.** Su Suspense cubre todo el subarbol. Se movio al
   grupo de rutas `(carta)` para que la ruta del plato quede afuera.
4. **El criterio 1 de E1-T5 no era satisfacible** tal como estaba escrito: la policy
   `dishes_select` tiene una rama publica deliberada, asi que el owner de A **si** ve el plato
   listo de B. El aislamiento se mide con platos borrador. Convendria reescribir ese criterio.
5. **`subirCategoria` devolvia exito sin mover nada** cuando la categoria era de otro
   restaurante. Un UPDATE filtrado por RLS **no da error**: da exito con cero filas. Lo
   mismo aplicaba a platos. Ahora se compara el dueño antes y los updates piden la fila de
   vuelta con `.select()`.
6. **`duplicarPlato` creaba empates de orden** al usar `sort_order + 1`, que ya es el del
   plato siguiente. Con empates, el orden de la carta lo decide el planificador de Postgres.
7. **El panel mostraba la cartera de clientes.** La policy deja leer todo restaurante
   activo —lo necesita la carta publica—, asi que un owner veia la lista completa. El panel
   ahora acota por `restaurant_id`.
8. **Un fallo de la base se veia como un 404.** `getMenuBySlug` ignoraba el error y
   devolvia `null`, que significa "no existe". Ahora lanza y lo atiende la frontera de error.

### Una trampa del entorno, por si te muerde

En PowerShell, los corchetes de un segmento dinamico (`[slug]`) son un **comodin de clase
de caracteres**. `Move-Item "src\app\[slug]\loading.tsx"` no mueve nada y **tampoco se
queja**. Hay que usar `-LiteralPath`. Costo dos diagnosticos en falso.

## Como entrar al panel

`pnpm db:admin` crea o asegura el usuario administrador. Las credenciales por defecto:

| | |
|---|---|
| Email | `admin@carta.local` |
| Contrasena | `carta-admin-local` |

Se pisan con `ADMIN_EMAIL` y `ADMIN_PASSWORD` en `.env.local` si querés otras. Son de
desarrollo: el dia que esto vaya a produccion, cambialas y no las dejes en el default.

## Entorno de esta maquina — decisiones ya tomadas

| Cosa | Decision | Por que |
|---|---|---|
| **Node 24** | Instalado en `%LOCALAPPDATA%\node\node-v24.19.0-win-x64`, **fuera** del PATH global | La maquina tenia Node **v20.20.2** en `C:\Program Files\nodejs` (PATH de sistema). pnpm 11.17 exige >= 22.13 y `process.loadEnvFile` de `vitest.config.ts` exige 22+. Se instalo al lado en vez de reemplazar el v20, para no cambiarle la version de Node a todos tus otros proyectos. |
| **pnpm 11.17.0** | corepack, shims en `%USERPROFILE%\.local\bin`, **si** en el PATH de usuario permanente | Es lo que pide `packageManager` en `package.json`. |
| **`.env.local`** | Los 7 valores de Supabase ya estan puestos | Se le quitaron 4 marcadores `# <<< FALTA` que quedaban como comentario al final de la linea, despues del valor real. |

### Lo que tenes que decidir: Node 24 global

Hoy Node 24 **no** es el `node` por defecto de tu terminal — sigue siendo el v20. Cada sesion
nueva necesita esto antes de correr cualquier comando del proyecto:

```powershell
$env:Path = "$env:LOCALAPPDATA\node\node-v24.19.0-win-x64;$env:USERPROFILE\.local\bin;$env:Path"
```

Opciones, en orden de recomendacion:

1. **Instalar [fnm](https://github.com/Schniz/fnm)** y dejar que lea el `.nvmrc` (que ya dice 24).
   Es lo que hace que el proyecto elija su version solo, sin tocarle nada al resto.
2. Instalar Node 24 con el MSI oficial y pisar el v20. Necesita permisos de administrador y le
   cambia la version de Node a todos tus otros proyectos.
3. Dejarlo como esta y prependear el PATH a mano cada vez.

## Lo que depende de una cuenta que todavia no hay

| Que | Lo pide | Bloquea | Estado |
|---|---|---|---|
| **Cuenta de Cloudinary** — `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_STREAMING_PROFILE` | Paso 11 / **E2-T5** | El proveedor de video real | Falta. Hoy `VIDEO_PROVIDER=direct`, que sirve para todo hasta el paso 11. |
| **Claves de API de Cloudinary** — `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Paso 16 / **E3-T4** | La subida firmada de videos | Falta. `CLOUDINARY_API_SECRET` es secreto: nunca sale del servidor. |
| **Cuenta de Vercel** | Pasos 17-18 / **E3-T5**, **E3-T6** | Deploy y el cron anti-pausa | Falta. |
| **`NEXT_PUBLIC_SITE_URL`** | Paso 17 / **E3-T5** | Metadata y URLs absolutas | Hoy `http://127.0.0.1:3000`. Cambiar al dominio real al desplegar. |
| **`CRON_SECRET`** | Paso 18 / **E3-T6** | `/api/keep-alive` | Vacio. Generalo con `openssl rand -hex 32` y pegalo en `.env.local` **y** en las env vars de Vercel. |

**Nada de esto bloquea E1-T5 ni E1-T6.** Se pueden hacer las dos sin abrir una cuenta nueva.

## Pendiente de entorno, sin cuenta de por medio

- **Navegadores de Playwright: no instalados.** `pnpm test:e2e` va a fallar hasta que corras
  `pnpm exec playwright install`. Es una descarga grande y no hace falta hasta **E2-T1**; el
  gate e2e de E1-T2 tampoco se puede volver a correr sin esto.
- **Docker: no instalado.** No hace falta — este proyecto no usa stack local. `pnpm db:push`
  avisa `failed to cache migrations catalog: failed to run docker` y **igual aplica bien** contra
  el proyecto remoto, con exit 0. Es ruido, no un error.

## Decisiones del proyecto que ya estan cerradas

No hace falta volver a discutirlas; estan en `CLAUDE.md` y en `.claude/rules/`.

- **Sin ORM.** Un ORM entra por TCP con rol admin y **RLS no se aplica en ese camino**.
- **La `SUPABASE_SERVICE_ROLE_KEY` nunca llega al navegador**, ni a un log.
- **El esquema lo mandan las migraciones.** El editor del dashboard es de solo lectura.
- **Prohibidos:** `next-cloudinary`, `@supabase/auth-helpers-nextjs`, Drizzle, Prisma.
- **Next 16 usa `proxy.ts`**, no `middleware.ts`.
- **Los tests comparten base con la demo BRASA:** prefijo `zzz-test-` en slugs, `__test_` en
  emails, y **ningun `delete` sin `where`**.
- **Tema oscuro unico**, sin toggle. Precios enteros en centavos.

## Discrepancias encontradas al retomar (2026-08-09)

Quedan anotadas porque el plan original decia otra cosa:

1. **La migracion de RLS no existia.** El plan la daba por escrita en
   `supabase/migrations/20260809083003_rls_policies.sql`. Ese archivo nunca estuvo en el repo.
   Se creo con `pnpm exec supabase migration new rls_policies` — la CLI le puso el timestamp
   real, **`20260809182538_rls_policies.sql`** — con el bloque SQL completo de §4 del blueprint.
2. **E1-T3 figuraba como `in_progress`** en `tasks.json` aunque su commit y su tag
   `step-03-schema` ya existian. Se volvieron a correr sus gates (verdes) y se paso a `done`.
3. **Este archivo no estaba en el repo.** Reconstruido.
