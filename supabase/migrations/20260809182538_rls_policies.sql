-- Migracion 2 — RLS.
--
-- Sin esto las cuatro tablas son publicas para cualquiera con la clave anon, que
-- viaja al navegador. Las policies son la unica proteccion de esa clave.

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
