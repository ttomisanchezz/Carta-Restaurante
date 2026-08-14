-- Migracion 6 — dos correcciones a los pedidos, encontradas por los tests de la migracion 5.
--
-- Se agrega en vez de editar la anterior: una migracion aplicada no se toca.

-- ============================================================================
-- 1. La hora de cierre la pone Postgres, no el que llama
-- ============================================================================

-- El bug: `cerrarSesionDeMesa` mandaba `closed_at` con `new Date()` desde el runtime de
-- Next, y el reloj de ese proceso NO es el mismo que el de Postgres. Con unos segundos de
-- desfasaje, `closed_at` quedaba ANTES que `opened_at` y la constraint
-- `table_sessions_cierre_posterior` rechazaba el cierre. La mesa no se podia cerrar, que es
-- justamente la operacion sin la cual el sistema se rompe al segundo dia.
--
-- Lo peor del caso es que fallaba de forma intermitente y dependiente del entorno: en una
-- maquina con el reloj adelantado no pasa nunca, y en un contenedor con NTP flojo pasa
-- siempre.
--
-- Este es exactamente el mismo criterio que ya usaba `orders_validar_transicion` para
-- sellar las horas de cada transicion. Lo que faltaba era aplicarlo tambien acá: si el
-- sellado vive en el codigo que hace el UPDATE, hay tantos lugares para equivocarse como
-- llamadores, y cada uno con el reloj de su propio proceso.
--
-- El llamador sigue mandando `closed_at` para expresar la INTENCION de cerrar; el valor
-- concreto lo pisa Postgres con el suyo.
create or replace function public.table_sessions_sellar_cierre()
returns trigger
language plpgsql
as $$
begin
  if new.closed_at is not null and old.closed_at is null then
    new.closed_at := now();
  end if;
  return new;
end;
$$;

-- BEFORE, y antes que el de `updated_at` por orden alfabetico del nombre: los triggers
-- BEFORE de una misma tabla corren en orden alfabetico, y este tiene que haber normalizado
-- la fila antes de que se evalue la constraint.
create trigger trg_table_sessions_sellar_cierre before update on public.table_sessions
  for each row execute function public.table_sessions_sellar_cierre();

-- ============================================================================
-- 2. El limite de frecuencia pasa a ser solo por minuto
-- ============================================================================

-- El bug: la version anterior rechazaba toda tanda que llegara a menos de 5 segundos de la
-- anterior de esa mesa. Suena razonable hasta que se mira quien se sienta en una mesa: son
-- CUATRO personas con CUATRO telefonos. Dos comensales apretando "Pedir" con tres segundos
-- de diferencia es el caso normal, no un abuso, y al segundo le contestabamos un error.
--
-- Queda el tope por minuto, que es el que de verdad protege a la cocina. El doble toque lo
-- ataja el cliente —el boton se deshabilita mientras manda— y si igual pasara, el mostrador
-- ve dos tandas identicas y cancela una. Eso es recuperable; perderle el pedido a un
-- comensal porque su companero de mesa pidio primero, no.

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

  -- --- limite de frecuencia por mesa: cinco por minuto y nada mas ---
  if (select count(*) from public.orders
       where table_id = v_table_id and created_at > now() - interval '1 minute') >= 5 then
    raise exception 'demasiados pedidos seguidos desde esta mesa' using errcode = 'CT004';
  end if;

  -- --- la sesion ---
  select id into v_session_id
  from public.table_sessions
  where table_id = v_table_id and closed_at is null;

  if v_session_id is null then
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

  perform 1 from public.table_sessions where id = v_session_id for update;

  select coalesce(max(sequence), 0) + 1 into v_sequence
  from public.orders where session_id = v_session_id;

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

  -- EL PRECIO SE CALCULA ACA, DEL LADO DEL SERVIDOR, LEYENDO `dishes`.
  --
  -- Jamas se confia en un precio que llega del navegador. `p_items` solo aporta QUE plato y
  -- CUANTOS; `name_snapshot` y `price_snapshot` salen de la fila real. Un cliente adulterado
  -- que mande `price: 1` no cambia un centavo, porque ese campo no se lee en ningun lado.
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

notify pgrst, 'reload schema';
