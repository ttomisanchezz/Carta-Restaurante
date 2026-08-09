# Carta interactiva con video — instrucciones para agentes

Carta digital de restaurante con un video vertical por plato, a la que el comensal llega escaneando
un QR. Next.js 16 + Supabase (Postgres + Auth + RLS) + Tailwind v4 + Cloudinary. Sin ORM.

## Comandos

| Tarea | Comando |
|---|---|
| Instalar | `pnpm install --frozen-lockfile` |
| Dev | `pnpm dev` — http://127.0.0.1:3000 |
| Build | `pnpm build` |
| Typecheck | `pnpm typecheck` |
| Lint / format | `pnpm lint` · `pnpm format` |
| Tests unit + integracion | `pnpm test` · un archivo: `pnpm test tests/unit/price.test.ts` |
| Tests e2e | `pnpm test:e2e` |
| Humo HTTP | `pnpm build && bash scripts/smoke-http.sh /api/health 200` |
| Migraciones + seed | `pnpm db:push` (no destructivo) · `pnpm db:reset` (**destructivo**) |
| Tipos de la base | `pnpm db:types` |
| Asegurar usuario admin | `pnpm db:admin` |

**Gate:** `pnpm typecheck && pnpm lint && pnpm test` en verde antes de dar nada por terminado.

## No negociable

1. La `SUPABASE_SERVICE_ROLE_KEY` nunca llega al navegador. Saltea RLS por completo.
2. El esquema lo mandan las migraciones en `supabase/migrations/`. El dashboard de Supabase es de
   solo lectura.
3. Ningun componente ni ruta importa el SDK de Cloudinary: todo pasa por `src/lib/video/provider.ts`.
4. En Next 16 el archivo es `proxy.ts` y la funcion exportada es `proxy`. `middleware.ts` no existe.
5. No instalar `next-cloudinary` ni `@supabase/auth-helpers-nextjs`, ni ningun ORM (Drizzle, Prisma):
   un ORM se conecta con rol administrador y RLS no se aplica en ese camino.
6. Precios en enteros (centavos). Nunca float.
7. Nunca commitear secretos ni `.env.local`; nunca editar a mano archivos generados.

Arquitectura completa, fronteras entre capas y tokens de diseno: `CLAUDE.md` en este mismo directorio.
Orden de construccion: `blueprints/carta-video-restaurantes/tasks.json` y `epics/`.
