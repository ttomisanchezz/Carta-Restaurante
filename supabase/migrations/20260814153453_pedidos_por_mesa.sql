-- Migracion 5 — pedidos por mesa.
--
-- El modelo en una frase: cada envio del comensal es una TANDA propia (`orders`), y todas
-- las tandas de una mesa se agrupan en una SESION (`table_sessions`) que el mostrador cierra
-- cuando la mesa paga y se va.
--
-- NO incluye llamado al mozo (Fase 3), ni ABM de carta (Fase 4), ni pagos.
--
-- Dos decisiones estructurales que conviene leer antes que el SQL:
--
-- 1. `orders` NO TIENE COLUMNA DE TOTAL, y la ausencia es deliberada. El total se calcula
--    sumando `order_items`. Si el total viviera en `orders`, esconderle `order_items` a un
--    usuario de cocina no le escondería la plata, y "cocina no ve precios" seria mentira en
--    la base aunque el componente no la dibujara.
-- 2. El comensal NUNCA escribe directo. No hay policy de INSERT en ninguna de las tres
--    tablas nuevas: todo entra por `create_order`, que es `security definer`. Un INSERT por
--    PostgREST afecta cero filas para cualquiera, incluido el dueño.

-- ============================================================================
-- 1. Como entra una tanda: automatico o a mano
-- ============================================================================

-- Sin UI en esta fase, a proposito: se cambia por SQL y el toggle va al panel en Fase 4.
-- El default `manual` es el comportamiento conservador — nadie empieza a mandar comida a la
-- cocina sin que una persona la haya mirado.
alter table public.restaurants
  add column order_flow text not null default 'manual'
  check (order_flow in ('auto', 'manual'));

-- ============================================================================
-- 2. Sesiones de mesa
-- ============================================================================

-- `table_id` va con ON DELETE RESTRICT y no CASCADE: una mesa no se borra nunca (su tabla
-- no tiene policy de delete desde Fase 1), pero si alguien lo forzara con la clave de
-- servicio, el cascade se llevaria en silencio la historia de todo lo que se comio ahi.
--
-- `opened_at` convive con `created_at` y no es duplicacion por descuido: `opened_at` es el
-- dato del dominio —cuando se sento la mesa— y `created_at`/`updated_at` son la auditoria
-- que la regla del repo exige en toda tabla. Casi siempre van a coincidir.
create table public.table_sessions (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_id      uuid not null references public.restaurant_tables(id) on delete restrict,
  opened_at     timestamptz not null default now(),
  closed_at     timestamptz,
  closed_by     uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint table_sessions_cierre_posterior check (closed_at is null or closed_at >= opened_at)
);

-- ESTA es la constraint que sostiene toda la fase: UNA SOLA SESION ABIERTA POR MESA.
--
-- Va en la base y no en el codigo porque el caso que tiene que atajar es de concurrencia:
-- dos comensales de la misma mesa apretando "pedir" en el mismo segundo. Cualquier chequeo
-- en TypeScript —leer si hay sesion abierta y despues insertarla— tiene una ventana entre
-- las dos operaciones, y en esa ventana entran las dos. El indice unico parcial no tiene
-- ventana: la segunda transaccion choca y `create_order` la manda a reusar la que gano.
create unique index idx_table_sessions_abierta
  on public.table_sessions (table_id)
  where closed_at is null;

create index idx_table_sessions_restaurant on public.table_sessions (restaurant_id, opened_at desc);

create trigger trg_table_sessions_updated before update on public.table_sessions
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 3. Tandas
-- ============================================================================

-- `channel` existe desde ahora aunque hoy solo se use 'mesa': la fase de WhatsApp reusa
-- esta tabla y agregar una columna con check a una tabla con pedidos adentro es una
-- migracion mas cara y mas riesgosa que preverla vacia.
--
-- `sequence` es el numero de tanda DENTRO de la sesion: 1, 2, 3. El unique contra
-- `session_id` no es cosmetico — es lo que hace que dos tandas concurrentes no puedan
-- quedarse las dos con el numero 2.
create table public.orders (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.table_sessions(id) on delete restrict,
  restaurant_id   uuid not null references public.restaurants(id) on delete cascade,
  table_id        uuid not null references public.restaurant_tables(id) on delete restrict,
  channel         text not null default 'mesa' check (channel in ('mesa', 'whatsapp')),
  sequence        integer not null check (sequence > 0),
  status          text not null default 'pendiente'
                  check (status in ('pendiente', 'cocina', 'listo', 'entregado', 'rechazado', 'cancelado')),
  rejected_reason text,
  -- Handle opaco que devuelve `create_order`. Mismo criterio que el token de mesa: CSPRNG
  -- del lado del servidor, 128 bits, nada derivable del numero de tanda.
  token           text not null unique
                  default encode(gen_random_bytes(16), 'hex')
                  check (token ~ '^[0-9a-f]{32}$'),
  confirmed_at    timestamptz,
  ready_at        timestamptz,
  delivered_at    timestamptz,
  rejected_at     timestamptz,
  cancelled_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint orders_tanda_unica_en_sesion unique (session_id, sequence),
  -- Rechazar sin decir por que deja al comensal mirando un cartel que no explica nada.
  constraint orders_rechazo_con_nota check (
    status <> 'rechazado'
    or (rejected_reason is not null and length(trim(rejected_reason)) > 0)
  )
);

create index idx_orders_restaurant_status on public.orders (restaurant_id, status, created_at);
create index idx_orders_session           on public.orders (session_id, sequence);

create trigger trg_orders_updated before update on public.orders
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 4. Items, con el precio congelado
-- ============================================================================

-- `name_snapshot` y `price_snapshot` son el corazon de la honestidad de la cuenta: el plato
-- puede cambiar de precio o de nombre a las tres horas de tomado el pedido, y la cuenta del
-- comensal no puede moverse sola despues de que la pidio. Se copian una vez, al insertar, y
-- no se tocan nunca mas — por eso esta tabla no tiene policy de UPDATE.
--
-- `dish_id` es RESTRICT: no se puede borrar un plato que figura en una cuenta.
create table public.order_items (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders(id) on delete cascade,
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  dish_id        uuid not null references public.dishes(id) on delete restrict,
  quantity       integer not null check (quantity > 0 and quantity <= 20),
  name_snapshot  text not null check (length(trim(name_snapshot)) > 0),
  price_snapshot integer not null check (price_snapshot >= 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index idx_order_items_order      on public.order_items (order_id);
create index idx_order_items_restaurant on public.order_items (restaurant_id);

create trigger trg_order_items_updated before update on public.order_items
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 5. La maquina de estados, en la base
-- ============================================================================

-- Las policies dicen QUIEN puede tocar una tanda. Este trigger dice QUE es un estado
-- valido, y corre venga el cambio por donde venga: por una policy, por un RPC `security
-- definer`, o por la clave de servicio en un script. Es la unica forma de que
-- "pendiente no salta a entregado" sea cierto y no una convencion que alguien respeta.
--
-- Sella ademas la hora de cada transicion. Si el sellado viviera en el codigo que hace el
-- UPDATE, existirian tantos lugares para olvidarselo como llamadores.
create or replace function public.orders_validar_transicion()
returns trigger
language plpgsql
as $$
begin
  -- Estas columnas identifican a la tanda: no se reescriben jamas. Sin esto, un usuario de
  -- cocina podria aprovechar su UPDATE legitimo de `cocina -> listo` para mudar la tanda a
  -- otra sesion o cambiarle el numero en el mismo viaje.
  if new.session_id    is distinct from old.session_id
     or new.restaurant_id is distinct from old.restaurant_id
     or new.table_id     is distinct from old.table_id
     or new.sequence     is distinct from old.sequence
     or new.channel      is distinct from old.channel
     or new.token        is distinct from old.token then
    raise exception 'no se puede reescribir la identidad de una tanda'
      using errcode = 'check_violation';
  end if;

  if new.status = old.status then
    return new;
  end if;

  if not (
    (old.status = 'pendiente' and new.status in ('cocina', 'rechazado', 'cancelado'))
    or (old.status = 'cocina' and new.status in ('listo', 'cancelado'))
    or (old.status = 'listo'  and new.status in ('entregado', 'cancelado'))
  ) then
    raise exception 'transicion de estado invalida: % -> %', old.status, new.status
      using errcode = 'check_violation';
  end if;

  if new.status = 'cocina'    then new.confirmed_at := now(); end if;
  if new.status = 'listo'     then new.ready_at     := now(); end if;
  if new.status = 'entregado' then new.delivered_at := now(); end if;
  if new.status = 'rechazado' then new.rejected_at  := now(); end if;
  if new.status = 'cancelado' then new.cancelled_at := now(); end if;

  return new;
end;
$$;

create trigger trg_orders_transicion before update on public.orders
  for each row execute function public.orders_validar_transicion();

-- ============================================================================
-- 6. RLS
-- ============================================================================

alter table public.table_sessions enable row level security;
alter table public.orders         enable row level security;
alter table public.order_items    enable row level security;

-- Segunda linea, por si alguien escribe mañana una policy con `to public` sin pensarlo: sin
-- privilegio de tabla, el rol anonimo no llega ni a que se evalue una policy. El comensal
-- entra por los dos RPC de mas abajo y por ningun otro lado.
revoke all on public.table_sessions from anon;
revoke all on public.orders         from anon;
revoke all on public.order_items    from anon;

-- --- table_sessions -------------------------------------------------------------------

create policy table_sessions_select on public.table_sessions for select
  to authenticated
  using (restaurant_id = public.current_restaurant_id() or public.is_superadmin());

-- La UNICA operacion posible sobre una sesion es cerrarla, y eso lo dicen los dos candados
-- juntos: el `using` exige que la fila entre ABIERTA y el `with check` exige que salga
-- CERRADA. Reabrir una sesion cerrada no pasa el `using`; dejarla abierta no pasa el
-- `with check`. Un `cocina` no entra por ninguna de las dos puertas.
create policy table_sessions_update on public.table_sessions for update
  to authenticated
  using (
    closed_at is null
    and (
      (restaurant_id = public.current_restaurant_id()
       and public.current_role() in ('mostrador', 'owner'))
      or public.is_superadmin()
    )
  )
  with check (
    closed_at is not null
    and (
      (restaurant_id = public.current_restaurant_id()
       and public.current_role() in ('mostrador', 'owner'))
      or public.is_superadmin()
    )
  );

-- Sin policy de INSERT: las sesiones las abre `create_order`, que es la unica que sabe
-- mirar si ya hay una abierta. Sin policy de DELETE: una sesion borrada se lleva la
-- historia de lo que comio esa mesa.

-- --- orders ---------------------------------------------------------------------------

-- Cocina, mostrador y owner leen las tandas de su restaurante. Que un `cocina` pueda leer
-- esta tabla entera no le muestra un solo numero de dinero: acá no hay ninguno.
create policy orders_select on public.orders for select
  to authenticated
  using (restaurant_id = public.current_restaurant_id() or public.is_superadmin());

-- Cocina tiene exactamente UN movimiento: `cocina -> listo`.
--
-- El `using` fija que la fila entre en `cocina` y el `with check` fija que salga en
-- `listo`. Son dos candados distintos sobre la misma operacion y hacen falta los dos: con
-- solo el `using`, cocina podria mover una tanda de `cocina` a `entregado`; con solo el
-- `with check`, podria llevar a `listo` una tanda que todavia esta en `pendiente` y que
-- nadie confirmo.
create policy orders_update_cocina on public.orders for update
  to authenticated
  using (
    restaurant_id = public.current_restaurant_id()
    and public.current_role() = 'cocina'
    and status = 'cocina'
  )
  with check (
    restaurant_id = public.current_restaurant_id()
    and public.current_role() = 'cocina'
    and status = 'listo'
  );

-- Mostrador y owner: confirmar, rechazar, entregar y cancelar. Que transiciones son legales
-- lo decide el trigger de arriba, no esta policy — acá solo se decide quien.
create policy orders_update_mostrador on public.orders for update
  to authenticated
  using (
    (restaurant_id = public.current_restaurant_id()
     and public.current_role() in ('mostrador', 'owner'))
    or public.is_superadmin()
  )
  with check (
    (restaurant_id = public.current_restaurant_id()
     and public.current_role() in ('mostrador', 'owner'))
    or public.is_superadmin()
  );

-- Sin policy de INSERT ni de DELETE. Rechazada y cancelada son ESTADOS, no ausencias: una
-- tanda borrada es una discusion con el comensal que no se puede reconstruir.

-- --- order_items ----------------------------------------------------------------------

-- ACA es donde "cocina no ve precios" es cierto en la base y no en un componente.
--
-- Un usuario `cocina` que consulte esta tabla directamente, con su propio JWT y sin pasar
-- por ninguna pantalla nuestra, recibe CERO FILAS. Su unico camino a los items es
-- `kitchen_queue()`, que no devuelve la columna de precio.
create policy order_items_select on public.order_items for select
  to authenticated
  using (
    (restaurant_id = public.current_restaurant_id()
     and public.current_role() in ('mostrador', 'owner'))
    or public.is_superadmin()
  );

-- Sin INSERT, UPDATE ni DELETE para nadie: los items los escribe `create_order` una sola
-- vez y despues no se mueven. Son el snapshot que hace que la cuenta no cambie sola.

-- ============================================================================
-- 7. Acotar la escritura de la carta a `owner`
-- ============================================================================

-- Hasta Fase 1 estas policies decian "cualquier usuario autenticado de este restaurante", y
-- alcanzaba: el unico rol de restaurante era `owner`. Con `mostrador` y `cocina` en la base,
-- tal como estaban, un usuario de cocina podria editar y borrar platos.
--
-- Fase 1 dejo escrito "no toques las policies de dishes". Esta fase pide explicitamente que
-- cocina no toque la carta, y las dos cosas no pueden ser ciertas a la vez: prevalece esta.
-- El cambio es un no-op para todo usuario que existia antes de hoy — `owner` y `superadmin`
-- conservan todo — y cierra la puerta que abrieron los roles nuevos.
--
-- Las policies de LECTURA no se tocan: la carta publica sigue exactamente igual.

drop policy dishes_insert on public.dishes;
create policy dishes_insert on public.dishes for insert
  with check (
    (restaurant_id = public.current_restaurant_id() and public.current_role() = 'owner')
    or public.is_superadmin()
  );

drop policy dishes_update on public.dishes;
create policy dishes_update on public.dishes for update
  using (
    (restaurant_id = public.current_restaurant_id() and public.current_role() = 'owner')
    or public.is_superadmin()
  )
  with check (
    (restaurant_id = public.current_restaurant_id() and public.current_role() = 'owner')
    or public.is_superadmin()
  );

drop policy dishes_delete on public.dishes;
create policy dishes_delete on public.dishes for delete
  using (
    (restaurant_id = public.current_restaurant_id() and public.current_role() = 'owner')
    or public.is_superadmin()
  );

drop policy categories_insert on public.categories;
create policy categories_insert on public.categories for insert
  with check (
    (restaurant_id = public.current_restaurant_id() and public.current_role() = 'owner')
    or public.is_superadmin()
  );

drop policy categories_update on public.categories;
create policy categories_update on public.categories for update
  using (
    (restaurant_id = public.current_restaurant_id() and public.current_role() = 'owner')
    or public.is_superadmin()
  )
  with check (
    (restaurant_id = public.current_restaurant_id() and public.current_role() = 'owner')
    or public.is_superadmin()
  );

drop policy categories_delete on public.categories;
create policy categories_delete on public.categories for delete
  using (
    (restaurant_id = public.current_restaurant_id() and public.current_role() = 'owner')
    or public.is_superadmin()
  );

-- ============================================================================
-- 8. El comensal pide
-- ============================================================================

-- Codigos de error propios, en una clase SQLSTATE que el estandar no usa. Existen para que
-- la aplicacion y los tests puedan ramificar por CODIGO y nunca por el texto del mensaje,
-- que cambia entre versiones de Postgres y no es contrato:
--
--   CT001  la mesa no resuelve (token invalido, mesa o restaurante dados de baja)
--   CT002  el pedido esta mal formado (items, cantidades, topes)
--   CT003  algun plato no es de este restaurante o no esta a la venta
--   CT004  demasiados pedidos desde esta mesa en poco tiempo

create or replace function public.create_order(p_table_token text, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_table_id      uuid;
  v_restaurant_id uuid;
  v_order_flow    text;
  v_session_id    uuid;
  v_sequence      integer;
  v_status        text;
  v_order_id      uuid;
  v_token         text;
  v_unidades      integer;
  v_lineas        integer;
  v_insertados    integer;
begin
  -- --- la mesa ---
  select t.id, t.restaurant_id, r.order_flow
    into v_table_id, v_restaurant_id, v_order_flow
  from public.restaurant_tables t
  join public.restaurants r on r.id = t.restaurant_id
  where t.token = p_table_token and t.is_active and r.is_active;

  if v_table_id is null then
    raise exception 'mesa inexistente o dada de baja' using errcode = 'CT001';
  end if;

  -- --- forma del pedido ---
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'el pedido tiene que ser una lista' using errcode = 'CT002';
  end if;

  v_lineas := jsonb_array_length(p_items);
  if v_lineas < 1 or v_lineas > 30 then
    raise exception 'un pedido lleva entre 1 y 30 renglones' using errcode = 'CT002';
  end if;

  -- Cantidades: enteras, positivas y con techo. El techo por item evita el "500 provoletas"
  -- de un dedo apoyado; el techo por ticket evita el mismo chiste repartido en 30 renglones.
  if exists (
    select 1
    from jsonb_array_elements(p_items) e
    where jsonb_typeof(e.value -> 'dish_id') <> 'string'
       or e.value ->> 'dish_id' !~ '^[0-9a-fA-F-]{36}$'
       or jsonb_typeof(e.value -> 'quantity') <> 'number'
       or (e.value ->> 'quantity')::numeric <> trunc((e.value ->> 'quantity')::numeric)
       or (e.value ->> 'quantity')::numeric < 1
       or (e.value ->> 'quantity')::numeric > 20
  ) then
    raise exception 'cantidades invalidas' using errcode = 'CT002';
  end if;

  select coalesce(sum((e.value ->> 'quantity')::integer), 0)
    into v_unidades
  from jsonb_array_elements(p_items) e;

  if v_unidades > 50 then
    raise exception 'demasiadas unidades en un solo pedido' using errcode = 'CT002';
  end if;

  -- --- limite de frecuencia por mesa ---
  -- No es antifraude, es anti-doble-toque y anti-inundacion: una mesa real no manda dos
  -- tandas en cinco segundos, y la cocina no puede con veinte por minuto.
  if exists (
    select 1 from public.orders
    where table_id = v_table_id and created_at > now() - interval '5 seconds'
  ) then
    raise exception 'esperá unos segundos antes de mandar otro pedido' using errcode = 'CT004';
  end if;

  if (select count(*) from public.orders
       where table_id = v_table_id and created_at > now() - interval '1 minute') >= 5 then
    raise exception 'demasiados pedidos seguidos desde esta mesa' using errcode = 'CT004';
  end if;

  -- --- la sesion ---
  select id into v_session_id
  from public.table_sessions
  where table_id = v_table_id and closed_at is null;

  if v_session_id is null then
    -- `on conflict` contra el indice unico parcial: si otra transaccion abrio la sesion
    -- entre el select de arriba y este insert, no explota — no inserta nada y la buscamos
    -- de nuevo. Esta es la mitad de la respuesta al caso concurrente.
    insert into public.table_sessions (restaurant_id, table_id)
    values (v_restaurant_id, v_table_id)
    on conflict (table_id) where closed_at is null do nothing
    returning id into v_session_id;

    if v_session_id is null then
      select id into v_session_id
      from public.table_sessions
      where table_id = v_table_id and closed_at is null;
    end if;
  end if;

  -- La otra mitad: bloquear la fila de la sesion serializa a las tandas concurrentes de la
  -- MISMA mesa. Sin esto, dos transacciones leerian el mismo `max(sequence)` y las dos
  -- intentarian ser la tanda 2; una moriria contra el unique en vez de ser la tanda 3.
  perform 1 from public.table_sessions where id = v_session_id for update;

  select coalesce(max(sequence), 0) + 1 into v_sequence
  from public.orders where session_id = v_session_id;

  -- REGLA DEL NEGOCIO, no un detalle de implementacion: solo la PRIMERA tanda puede entrar
  -- derecho a la cocina, y solo si el restaurante esta en 'auto'. Todo agregado posterior
  -- pasa por una persona siempre. Si un agregado entrara solo a la cocina, le estariamos
  -- mostrando al comensal un "aceptado" que nadie miro.
  if v_sequence = 1 and v_order_flow = 'auto' then
    v_status := 'cocina';
  else
    v_status := 'pendiente';
  end if;

  insert into public.orders (session_id, restaurant_id, table_id, sequence, status, confirmed_at)
  values (
    v_session_id, v_restaurant_id, v_table_id, v_sequence, v_status,
    case when v_status = 'cocina' then now() end
  )
  returning id, token into v_order_id, v_token;

  -- --- los items ---
  --
  -- EL PRECIO SE CALCULA ACA, DEL LADO DEL SERVIDOR, LEYENDO `dishes`.
  --
  -- Jamas se confia en un precio que llega del navegador. `p_items` solo aporta QUE plato y
  -- CUANTOS; `name_snapshot` y `price_snapshot` salen de la fila real del plato. Un cliente
  -- adulterado que mande `price: 1` no cambia un centavo de lo que se guarda, porque el
  -- precio que manda no se lee en ningun lado de esta funcion.
  --
  -- El JOIN es tambien la validacion de pertenencia: un plato de otro restaurante, dado de
  -- baja o sin el video listo simplemente no matchea, y el conteo de abajo lo delata.
  with pedido as (
    select (e.value ->> 'dish_id')::uuid as dish_id,
           (e.value ->> 'quantity')::integer as quantity
    from jsonb_array_elements(p_items) e
  )
  insert into public.order_items (order_id, restaurant_id, dish_id, quantity, name_snapshot, price_snapshot)
  select v_order_id, v_restaurant_id, d.id, p.quantity, d.name, d.price
  from pedido p
  join public.dishes d
    on d.id = p.dish_id
   and d.restaurant_id = v_restaurant_id
   and d.is_available
   and d.video_status = 'ready';

  get diagnostics v_insertados = row_count;

  -- Si entraron menos renglones de los que pidieron, alguno no era de este restaurante o no
  -- estaba a la venta. Se cae toda la transaccion: la tanda y la sesion recien creada
  -- desaparecen con ella, y el comensal no queda con media cuenta abierta.
  if v_insertados <> v_lineas then
    raise exception 'algun plato no es de este restaurante o no esta disponible'
      using errcode = 'CT003';
  end if;

  return jsonb_build_object(
    'order_token', v_token,
    'sequence', v_sequence,
    'status', v_status,
    'items', v_insertados
  );
end;
$$;

revoke all on function public.create_order(text, jsonb) from public;
grant execute on function public.create_order(text, jsonb) to anon, authenticated;

-- ============================================================================
-- 9. El comensal mira como va
-- ============================================================================

-- Devuelve la sesion ABIERTA de esa mesa y nada mas: sus tandas, sus items y el total
-- acumulado. Nada de otras mesas, nada de otros restaurantes, nada de sesiones cerradas.
-- Sin sesion abierta devuelve `null`, que es como la carta sabe que el comensal arranca
-- limpio.
--
-- El total EXCLUYE lo rechazado y lo cancelado: cobrarle a alguien un plato que la cocina
-- rechazo es la clase de error que termina en una discusion en la mesa.
create or replace function public.get_session_status(p_table_token text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  with mesa as (
    select t.id as table_id, t.label
    from public.restaurant_tables t
    join public.restaurants r on r.id = t.restaurant_id
    where t.token = p_table_token and t.is_active and r.is_active
  ),
  sesion as (
    select s.id, s.opened_at, m.label
    from public.table_sessions s
    join mesa m on m.table_id = s.table_id
    where s.closed_at is null
  ),
  tandas as (
    select o.sequence,
           o.status,
           o.rejected_reason,
           o.created_at,
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'name', i.name_snapshot,
                      'quantity', i.quantity,
                      'price', i.price_snapshot,
                      'subtotal', i.price_snapshot * i.quantity
                    ) order by i.created_at)
             from public.order_items i where i.order_id = o.id
           ), '[]'::jsonb) as items,
           coalesce((
             select sum(i.price_snapshot * i.quantity)
             from public.order_items i where i.order_id = o.id
           ), 0) as subtotal
    from public.orders o
    join sesion s on s.id = o.session_id
  )
  select jsonb_build_object(
    'table_label', (select label from sesion),
    'opened_at', (select opened_at from sesion),
    'total', coalesce((
      select sum(subtotal) from tandas where status not in ('rechazado', 'cancelado')
    ), 0),
    'orders', coalesce((
      select jsonb_agg(jsonb_build_object(
               'sequence', sequence,
               'status', status,
               'rejected_reason', rejected_reason,
               'created_at', created_at,
               'subtotal', subtotal,
               'items', items
             ) order by sequence)
      from tandas
    ), '[]'::jsonb)
  )
  where exists (select 1 from sesion);
$$;

revoke all on function public.get_session_status(text) from public;
grant execute on function public.get_session_status(text) to anon, authenticated;

-- ============================================================================
-- 10. La cocina mira su cola
-- ============================================================================

-- El unico camino de un usuario `cocina` a los items de una tanda, y NO DEVUELVE PRECIO.
-- No es que el precio se oculte en el componente: esta funcion no lo selecciona, y la tabla
-- `order_items` le da cero filas por RLS. Las dos cosas a la vez.
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
    and public.current_role() in ('cocina', 'mostrador', 'owner')
    and o.status in ('cocina', 'listo')
  order by o.created_at;
$$;

revoke all on function public.kitchen_queue() from public, anon;
grant execute on function public.kitchen_queue() to authenticated;

-- ============================================================================
-- 11. Realtime
-- ============================================================================

-- La publicacion `supabase_realtime` ya existia pero SIN UNA SOLA TABLA adentro, que es la
-- forma mas silenciosa posible de fallar: el cliente se suscribe, recibe SUBSCRIBED, y no
-- llega nunca un evento. Se verifico con una suscripcion real antes de escribir esto.
--
-- Realtime respeta RLS, asi que esto NO le abre nada al comensal anonimo: no tiene SELECT
-- sobre ninguna de las dos tablas. El que se suscribe es el panel autenticado.
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.table_sessions;

notify pgrst, 'reload schema';
