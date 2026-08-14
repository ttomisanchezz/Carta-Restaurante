---
description: Convenciones de esquema, migraciones y policies de RLS
paths:
  - "supabase/**"
  - "src/server/**"
  - "src/lib/supabase/**"
  - "scripts/**"
---

# Base de datos y RLS

- **Las migraciones mandan.** Toda modificacion de esquema es un archivo nuevo creado con
  `pnpm exec supabase migration new <nombre>`. El editor del dashboard de Supabase es de solo lectura.
- **Nunca editar una migracion ya aplicada.** Se agrega una nueva que corrige.
- **El nombre del archivo de migracion lo pone la CLI** (lleva un timestamp). Nunca lo escribas a mano
  ni lo cites por nombre en una tarea: citá el comando que lo crea.
- Tablas en plural y snake_case. Columnas snake_case. Los booleanos se leen como afirmaciones
  (`is_active`, `is_available`).
- Claves foraneas `<tabla_singular>_id`. Indices `idx_<tabla>_<columnas>`.
- Toda tabla lleva `id uuid primary key default gen_random_uuid()`, `created_at timestamptz not null
  default now()` y `updated_at timestamptz not null default now()` con el trigger `set_updated_at`.
- **Toda tabla de contenido lleva `restaurant_id` con indice.** En `dishes` esta desnormalizado a
  proposito aunque se derive de `category_id`: simplifica las policies y evita un join en cada lectura
  publica. No lo "normalices".
- **Los enums son columnas `text` con `check`**, no tipos enum de Postgres: alterarlos es doloroso.
- **Precios: `integer` en centavos.** Nunca `numeric`, nunca `real`.
- `primary_color` lleva `check (primary_color ~ '^#[0-9A-Fa-f]{6}$')`. El zod del servidor es la
  segunda linea de defensa, no la unica.

## RLS

- **RLS habilitado en las cuatro tablas.** Una tabla nueva sin `enable row level security` es publica
  para cualquiera con la clave anon, que llega al navegador.
- Toda policy privada se apoya en `public.current_restaurant_id()`, que es `security definer`.
  Consultar `profiles` directo dentro de una policy de `profiles` es recursion infinita.
- **Lectura anonima:** solo filas de restaurantes con `is_active = true`, y en `dishes` ademas
  `is_available = true and video_status = 'ready'`.
- **Escritura:** solo si `restaurant_id = current_restaurant_id()`. Siempre con `using` **y**
  `with check`: sin `with check` un UPDATE puede mover una fila a otro restaurante.
- **Rol unico:** `profiles.role` solo acepta `owner`. Los estados operativos de pedidos, incluida
  `cocina`, no son roles. El alta de restaurantes y owners se provisiona con scripts de servicio.
- Borrar una categoria con platos esta **bloqueado** (`on delete restrict`). No es cascade: el cascade
  silencioso es de donde sale "se me borro media carta".
- Despues de tocar policies, agregá `notify pgrst, 'reload schema';` al final de la migracion.

## Clientes

- `src/lib/supabase/server.ts` — cliente de servidor con cookies (`@supabase/ssr`). Importa
  `next/headers`: **jamas lo importes desde un test o un script**, no hay contexto de request.
- Los tests y los scripts construyen su propio cliente con `createClient` de `@supabase/supabase-js`.
- La `SUPABASE_SERVICE_ROLE_KEY` solo aparece en `scripts/**` y `tests/helpers/**`. Nunca en `src/app`,
  nunca en `src/components`.
