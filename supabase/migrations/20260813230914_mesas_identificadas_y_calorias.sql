-- Migracion 4 — mesas identificadas por QR, rol de tres valores y calorias por plato.
--
-- Fundacion del sistema de pedidos. NO incluye pedidos ni llamado al mozo: eso es Fase 2 y 3.
--
-- La idea central es el token opaco. Si la URL de una mesa fuera `/brasa/mesa/5`, cualquiera
-- pide desde su casa escribiendo un numero; ese es exactamente el ataque que cierra este
-- archivo. El token sale de un CSPRNG del lado del servidor y no se deriva de nada visible.

-- ============================================================================
-- 1. Rol de usuario: owner, mostrador, cocina, superadmin
-- ============================================================================

-- El backfill va ANTES de mover el CHECK, y el orden no es estetico: mientras corre este
-- UPDATE la constraint vieja sigue vigente, y 'owner' es un valor que ya acepta. Al reves
-- —cambiar el CHECK primero— la constraint nueva tendria que validar contra filas en
-- 'staff' que todavia no migraron, y la migracion se cae a la mitad.
--
-- `where role <> 'superadmin'` esta acotado a proposito. Un superadmin degradado a 'owner'
-- se queda sin `is_superadmin()`, que es lo que sostiene las 16 policies y el alta de
-- restaurantes: la plataforma se quedaria sin nadie que pueda administrarla.
update public.profiles
set role = 'owner'
where role <> 'superadmin';

alter table public.profiles drop constraint profiles_role_check;

-- 'staff' desaparece. Se verifico antes de tirarlo que no tenia un solo uso vivo en `src/`:
-- solo aparecia en una union de tipos de TypeScript, nunca en una rama de autorizacion.
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('owner', 'mostrador', 'cocina', 'superadmin'));

-- OJO, esto es lo unico que hay que recordar de esta seccion:
--
-- `mostrador` y `cocina` TODAVIA NO CAMBIAN NINGUN PERMISO. Las 16 policies que ya existen
-- no los distinguen de un `owner`: siguen preguntando "esta fila es de tu restaurante?", y
-- para las tres respuestas es la misma. Separar lo que puede hacer cada uno es trabajo de
-- Fase 2, cuando existan los pedidos que le den sentido a la division.
--
-- En Fase 1 la unica pantalla con permiso propio es `/admin/mesas`, y se protege A NIVEL
-- APP (solo `owner`), no con RLS. Si esto te resulta poco: lo es a proposito, y es
-- deliberado que quede escrito acá y no descubierto por alguien dentro de seis meses.

-- Mismo patron `security definer` que `current_restaurant_id()` e `is_superadmin()`: una
-- policy sobre `profiles` que consultara `profiles` seria recursion infinita.
--
-- LLAMALA SIEMPRE CALIFICADA: `public.current_role()`, nunca `current_role()` pelado.
-- CURRENT_ROLE es palabra reservada del estandar SQL, y sin el `public.` delante el parser
-- resuelve el keyword y te devuelve el rol de POSTGRES (`anon`, `authenticator`) en vez del
-- nuestro. Lo peor del caso es que no falla: devuelve un texto plausible y equivocado.
create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select role from public.profiles where id = auth.uid();
$$;

grant execute on function public.current_role() to anon, authenticated;

-- ============================================================================
-- 2. Mesas
-- ============================================================================

-- `token` es la seguridad entera de esta tabla, y por eso lleva tres cosas y no una:
--
--   * el DEFAULT decide de DONDE sale: `gen_random_bytes` es el CSPRNG de pgcrypto, del
--     lado del servidor. 16 bytes son 128 bits — no se recorre por fuerza bruta.
--   * el CHECK impide que un INSERT desde la app lo degrade a algo corto o adivinable,
--     aunque alguien mande el token a mano en vez de dejar que lo ponga el default.
--   * el UNIQUE es global, no por restaurante: un token identifica una mesa en todo el
--     sistema, asi que la URL nunca depende de que el slug sea el correcto para resolver.
create table public.restaurant_tables (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  label         text not null check (length(trim(label)) > 0),
  token         text not null unique
                default encode(gen_random_bytes(16), 'hex')
                check (token ~ '^[0-9a-f]{32}$'),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_restaurant_tables_restaurant on public.restaurant_tables (restaurant_id);

create trigger trg_restaurant_tables_updated before update on public.restaurant_tables
  for each row execute function public.set_updated_at();

alter table public.restaurant_tables enable row level security;

-- Las tres policies van `to authenticated`: el rol anonimo ni siquiera se evalua.
create policy restaurant_tables_select on public.restaurant_tables for select
  to authenticated
  using (restaurant_id = public.current_restaurant_id() or public.is_superadmin());

create policy restaurant_tables_insert on public.restaurant_tables for insert
  to authenticated
  with check (restaurant_id = public.current_restaurant_id() or public.is_superadmin());

-- El `with check` no es copia del `using`: el `using` decide que filas ve para editar y el
-- `with check` decide como pueden quedar despues. Sin el segundo, un UPDATE podria
-- reescribir `restaurant_id` y mudarle la mesa al restaurante de al lado.
create policy restaurant_tables_update on public.restaurant_tables for update
  to authenticated
  using (restaurant_id = public.current_restaurant_id() or public.is_superadmin())
  with check (restaurant_id = public.current_restaurant_id() or public.is_superadmin());

-- NO HAY POLICY DE DELETE, y la ausencia es la funcionalidad.
--
-- Con RLS habilitada y sin policy de delete, un DELETE por PostgREST afecta cero filas para
-- cualquiera, incluido el dueño de la mesa. Las mesas se DESACTIVAN (`is_active = false`),
-- nunca se borran: un token borrado y reusado apunta pedidos viejos a la mesa equivocada, y
-- eso se descubre cuando un plato sale a la mesa que no lo pidio. Solo `service_role`
-- (scripts y limpieza de tests) puede borrar, porque saltea RLS por completo.

-- Segunda linea, por si alguien escribe mañana una policy con `to public` sin pensarlo: sin
-- privilegio de tabla, el rol anonimo no llega ni a que se evalue una policy.
revoke all on public.restaurant_tables from anon;

-- ============================================================================
-- 3. Calorias
-- ============================================================================

-- Nullable a proposito: los platos de BRASA ya existen y sus valores reales no los tenemos.
-- `null` significa "no sabemos", y la vista NO dibuja nada en ese caso — ni "s/d", ni un
-- guion, ni un hueco reservado. Inventar un numero en la carta de un restaurante es peor
-- que no mostrarlo.
--
-- No se toca ninguna policy de `dishes`: una columna nueva queda cubierta por las que la
-- tabla ya tiene, asi que las calorias se leen exactamente en los mismos platos que ya eran
-- legibles (restaurante activo, plato disponible, video 'ready').
alter table public.dishes
  add column calories integer check (calories is null or calories >= 0);

-- ============================================================================
-- 4. El comensal resuelve su mesa
-- ============================================================================

-- El unico camino por el que un anonimo toca `restaurant_tables`, y esta escrito para que
-- no pueda devolver de mas:
--
--   * filtra por token EXACTO, asi que como mucho vuelve una fila;
--   * exige que el slug de la URL sea el del restaurante dueño de esa mesa, o sea que un
--     token valido de otro restaurante no renderiza nada bajo este slug;
--   * no devuelve el `token` de vuelta, ni ninguna otra mesa, ni el listado;
--   * token inexistente, mesa desactivada, restaurante desactivado y slug que no coincide
--     dan todos CERO FILAS, indistinguibles entre si. La ruta traduce eso a un 404.
--
-- `security definer` porque tiene que leer una tabla que el anonimo no puede leer. Va con
-- `search_path` fijo: sin eso, quien pueda crear un esquema en el path secuestra los
-- nombres `restaurant_tables` y `restaurants` y la funcion lee de sus tablas.
create or replace function public.resolve_table(p_slug text, p_token text)
returns table (table_id uuid, restaurant_id uuid, label text)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select t.id, t.restaurant_id, t.label
  from public.restaurant_tables t
  join public.restaurants r on r.id = t.restaurant_id
  where t.token = p_token
    and t.is_active
    and r.slug = p_slug
    and r.is_active;
$$;

revoke all on function public.resolve_table(text, text) from public;
grant execute on function public.resolve_table(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
