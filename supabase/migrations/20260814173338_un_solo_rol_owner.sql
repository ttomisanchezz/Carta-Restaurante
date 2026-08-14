-- Un unico rol de panel: owner.
--
-- Los estados operativos de los pedidos (por ejemplo `cocina`) no son roles y se
-- conservan. Cualquier owner del restaurante puede recorrer el flujo completo.

-- Primero se normalizan las filas existentes mientras el CHECK anterior todavia acepta
-- sus valores. Despues se cierra el dominio a `owner` y no queda ningun permiso especial
-- escondido detras de `superadmin`.
update public.profiles set role = 'owner' where role <> 'owner';

alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role = 'owner');

-- Restaurants: la lectura publica de los activos se conserva. Un owner puede leer y
-- actualizar su propio restaurante. El alta y la baja fisica se hacen exclusivamente por
-- provision con service_role, fuera de PostgREST/RLS.
drop policy restaurants_select on public.restaurants;
drop policy restaurants_insert on public.restaurants;
drop policy restaurants_update on public.restaurants;
drop policy restaurants_delete on public.restaurants;

create policy restaurants_select on public.restaurants for select
  using (is_active or id = public.current_restaurant_id());
create policy restaurants_update on public.restaurants for update
  to authenticated
  using (id = public.current_restaurant_id())
  with check (id = public.current_restaurant_id());

-- Carta: lectura publica sin cambios; todas las escrituras quedan acotadas al restaurante
-- del owner autenticado.
drop policy categories_select on public.categories;
drop policy categories_insert on public.categories;
drop policy categories_update on public.categories;
drop policy categories_delete on public.categories;

create policy categories_select on public.categories for select
  using (
    exists (select 1 from public.restaurants r
             where r.id = categories.restaurant_id and r.is_active)
    or categories.restaurant_id = public.current_restaurant_id()
  );
create policy categories_insert on public.categories for insert
  to authenticated
  with check (restaurant_id = public.current_restaurant_id());
create policy categories_update on public.categories for update
  to authenticated
  using (restaurant_id = public.current_restaurant_id())
  with check (restaurant_id = public.current_restaurant_id());
create policy categories_delete on public.categories for delete
  to authenticated
  using (restaurant_id = public.current_restaurant_id());

drop policy dishes_select on public.dishes;
drop policy dishes_insert on public.dishes;
drop policy dishes_update on public.dishes;
drop policy dishes_delete on public.dishes;

create policy dishes_select on public.dishes for select
  using (
    (
      exists (select 1 from public.restaurants r
               where r.id = dishes.restaurant_id and r.is_active)
      and dishes.is_available
      and dishes.video_status = 'ready'
    )
    or dishes.restaurant_id = public.current_restaurant_id()
  );
create policy dishes_insert on public.dishes for insert
  to authenticated
  with check (restaurant_id = public.current_restaurant_id());
create policy dishes_update on public.dishes for update
  to authenticated
  using (restaurant_id = public.current_restaurant_id())
  with check (restaurant_id = public.current_restaurant_id());
create policy dishes_delete on public.dishes for delete
  to authenticated
  using (restaurant_id = public.current_restaurant_id());

-- El perfil es de solo lectura para su propia cuenta. La provision de usuarios usa
-- service_role y por eso no necesita una policy de escritura.
drop policy profiles_select on public.profiles;
drop policy profiles_write on public.profiles;

create policy profiles_select on public.profiles for select
  to authenticated
  using (id = auth.uid());

drop policy restaurant_tables_select on public.restaurant_tables;
drop policy restaurant_tables_insert on public.restaurant_tables;
drop policy restaurant_tables_update on public.restaurant_tables;

create policy restaurant_tables_select on public.restaurant_tables for select
  to authenticated
  using (restaurant_id = public.current_restaurant_id());
create policy restaurant_tables_insert on public.restaurant_tables for insert
  to authenticated
  with check (restaurant_id = public.current_restaurant_id());
create policy restaurant_tables_update on public.restaurant_tables for update
  to authenticated
  using (restaurant_id = public.current_restaurant_id())
  with check (restaurant_id = public.current_restaurant_id());

drop policy dish_view_events_select on public.dish_view_events;
create policy dish_view_events_select on public.dish_view_events for select
  to authenticated
  using (restaurant_id = public.current_restaurant_id());

-- Pedidos: el owner puede ver precios, confirmar, rechazar, marcar listo, entregar,
-- cancelar y cerrar la mesa. El trigger sigue siendo quien valida las transiciones.
drop policy table_sessions_select on public.table_sessions;
drop policy table_sessions_update on public.table_sessions;

create policy table_sessions_select on public.table_sessions for select
  to authenticated
  using (restaurant_id = public.current_restaurant_id());
create policy table_sessions_update on public.table_sessions for update
  to authenticated
  using (restaurant_id = public.current_restaurant_id() and closed_at is null)
  with check (restaurant_id = public.current_restaurant_id() and closed_at is not null);

drop policy orders_select on public.orders;
drop policy orders_update_cocina on public.orders;
drop policy orders_update_mostrador on public.orders;

create policy orders_select on public.orders for select
  to authenticated
  using (restaurant_id = public.current_restaurant_id());
create policy orders_update_owner on public.orders for update
  to authenticated
  using (restaurant_id = public.current_restaurant_id())
  with check (restaurant_id = public.current_restaurant_id());

drop policy order_items_select on public.order_items;
create policy order_items_select on public.order_items for select
  to authenticated
  using (restaurant_id = public.current_restaurant_id());

-- La vista operativa de cocina sigue sin devolver dinero, pero ya no discrimina por rol.
create or replace function public.kitchen_queue()
returns table (
  order_id    uuid,
  table_label text,
  sequence    integer,
  status      text,
  created_at  timestamptz,
  items       jsonb
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select o.id,
         t.label,
         o.sequence,
         o.status,
         o.created_at,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'name', i.name_snapshot,
                    'quantity', i.quantity
                  ) order by i.created_at)
           from public.order_items i where i.order_id = o.id
         ), '[]'::jsonb)
  from public.orders o
  join public.restaurant_tables t on t.id = o.table_id
  where o.restaurant_id = public.current_restaurant_id()
    and o.status in ('cocina', 'listo')
  order by o.created_at;
$$;

-- Ya no hay consumidores de estos helpers ni un privilegio global que representar.
drop function public.current_role();
drop function public.is_superadmin();

notify pgrst, 'reload schema';
