---
name: agregar-migracion
description: Usar al cambiar el esquema de la base — agregar una tabla, una columna, un indice, una constraint o una policy de RLS. Cubre el orden correcto (crear el archivo con la CLI, escribir el SQL, resetear, regenerar tipos) y evita el error mas caro del proyecto, que es tocar el editor del dashboard de Supabase o inventar el nombre del archivo de migracion.
---

# Agregar una migracion

## Cuando usarla

- "agregar una columna", "nueva tabla", "hace falta un indice", "cambiar la policy",
  "permitir que el staff edite platos", "el borrado tiene que bloquear".
- Cualquier cosa que cambie lo que Postgres sabe.

## Pasos

1. **Crear el archivo con la CLI. Nunca a mano.**
   ```bash
   pnpm exec supabase migration new <nombre_en_snake_case>
   ```
   La CLI imprime la ruta que creo. Ese nombre lleva un timestamp: no lo adivines, no lo cites de
   memoria, leelo de la salida.

2. **Escribir el SQL** en ese archivo, con estas reglas:
   - `id uuid primary key default gen_random_uuid()`, `created_at`, `updated_at` en toda tabla nueva,
     mas el trigger `set_updated_at`.
   - `restaurant_id uuid not null references public.restaurants(id) on delete cascade` con indice, en
     toda tabla de contenido.
   - Si la tabla es nueva: `alter table public.<tabla> enable row level security;` **en la misma
     migracion**, mas al menos una policy de lectura y una de escritura, cada una con `using` y
     `with check`.
   - Enums como `text` con `check`. Dinero como `integer` en centavos.
   - Ultima linea si tocaste funciones o policies: `notify pgrst, 'reload schema';`

3. **Aplicar (aditivo, no recrea nada).**
   ```bash
   pnpm db:push
   ```

4. **Regenerar los tipos** — si no, TypeScript sigue viendo el esquema viejo.
   ```bash
   pnpm db:types
   ```

5. **Asegurar el usuario admin.** `pnpm db:admin` es idempotente: si ya existe no hace nada. Se corre por higiene, no porque se haya perdido nada.
   ```bash
   pnpm db:admin
   ```

## Verify

```bash
pnpm db:push                           # expect: exit 0, aplica migraciones + seed (aditivo)
pnpm db:types                          # expect: exit 0, reescribe src/lib/supabase/database.types.ts
pnpm db:admin                          # expect: exit 0, "admin listo"
pnpm typecheck                         # expect: exit 0
pnpm test tests/integration            # expect: exit 0, 0 failed, 0 skipped
```

## No hacer

- **No abrir el editor de SQL del dashboard de Supabase.** Dos sistemas de migracion sobre una base
  derivan, y la deriva se descubre en produccion.
- **No editar una migracion que ya se aplico.** Se agrega una nueva que corrige.
- **No escribir el nombre del archivo de migracion en una tarea ni en un blueprint.** Lo elige la CLI.
- **No crear una tabla sin RLS.** La clave anon llega al navegador: una tabla sin policies es publica.
- **No poner `on delete cascade` entre `categories` y `dishes`.** Es `restrict` a proposito.
