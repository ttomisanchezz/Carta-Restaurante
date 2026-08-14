-- Migracion 5 — metricas de visualizacion por plato.
--
-- Es el primer camino de ESCRITURA para un comensal anonimo en todo el proyecto, y por eso
-- esta escrito al reves de todos los anteriores: la tabla no le da ningun privilegio a
-- `anon`, y lo unico que ese rol puede ejecutar es una funcion que decide ella misma que
-- fila entra. El comensal nunca elige el `restaurant_id`, nunca elige la marca de tiempo y
-- no puede escribir sobre un plato que la carta publica no le mostraria.
--
-- Lo que se captura no es "lo vio": es cuanto vio. El diferencial del producto frente a una
-- carta con fotos es la profundidad, asi que los momentos son iniciado / 25 / 50 / 75 /
-- completo, y el numero que le importa al dueño es que porcentaje llega al final.

-- ============================================================================
-- 1. La tabla de eventos
-- ============================================================================

-- `restaurant_id` va desnormalizado aunque se derive de `dish_id`, con el mismo criterio
-- que ya usa `dishes` con el suyo: la policy de lectura del panel se resuelve sin join y
-- el indice por restaurante sirve para todo lo que el dashboard vaya a preguntar.
--
-- `session_token` NO identifica a una persona: es un valor efimero que el navegador genera
-- por visita y que no se guarda en ninguna cookie ni se cruza con nada. Existe para dos
-- cosas concretas y para ninguna mas: contar visitas distintas en vez de eventos sueltos, y
-- sostener el anti-abuso de mas abajo.
create table public.dish_view_events (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  dish_id       uuid not null references public.dishes(id) on delete cascade,
  -- Enum como `text` + `check`, no un tipo enum de Postgres: alterarlos es doloroso.
  momento       text not null check (momento in ('iniciado', '25', '50', '75', 'completo')),
  session_token text not null check (session_token ~ '^[0-9a-f]{32}$'),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- La tabla es de solo-append: nada la actualiza nunca. El trigger va igual porque la
-- convencion del proyecto es que TODA tabla lo lleve, y una excepcion silenciosa acá
-- obliga a quien lea el esquema en seis meses a averiguar si fue decision o descuido.
create trigger trg_dish_view_events_updated before update on public.dish_view_events
  for each row execute function public.set_updated_at();

-- EL FRENO PRINCIPAL. Un mismo momento, de un mismo plato, en una misma sesion, entra UNA
-- sola vez: reenviar el lote diez veces deja el contador igual. Sin esto, "infla los
-- numeros" es literalmente apretar F5, y con esto pasa a costar una sesion nueva por cada
-- punto que se quiera sumar.
create unique index idx_dish_view_events_unico
  on public.dish_view_events (dish_id, session_token, momento);

create index idx_dish_view_events_restaurant on public.dish_view_events (restaurant_id);
create index idx_dish_view_events_dish on public.dish_view_events (dish_id);
-- Para que el conteo por ventana del anti-abuso no sea un scan de la tabla entera.
create index idx_dish_view_events_sesion on public.dish_view_events (session_token, created_at);

alter table public.dish_view_events enable row level security;

-- ============================================================================
-- 2. RLS: leer si es tuyo, escribir por ningun lado
-- ============================================================================

-- Lectura, con los mismos dos helpers de siempre. El dueño ve lo suyo y nadie mas.
create policy dish_view_events_select on public.dish_view_events for select
  to authenticated
  using (restaurant_id = public.current_restaurant_id() or public.is_superadmin());

-- NO HAY POLICY DE INSERT, Y ESO ES EL DISEÑO.
--
-- Con RLS habilitada y sin policy de insert, un INSERT por PostgREST afecta cero filas para
-- cualquier rol, incluido `authenticated`. La unica puerta de escritura es la funcion de
-- la seccion 3, que es `security definer` y valida antes de escribir. Tampoco hay update ni
-- delete: un evento registrado no se corrige, y una metrica que el dueño puede editar deja
-- de ser una metrica.
--
-- Segunda linea, para el dia que alguien escriba una policy `to public` sin pensarla: sin
-- privilegio de tabla el rol anonimo no llega ni a que se evalue.
revoke all on public.dish_view_events from anon;

-- ============================================================================
-- 3. La unica puerta de escritura
-- ============================================================================

-- Recibe el LOTE completo de momentos de un plato, no un evento suelto: el cliente agrupa y
-- manda una vez, asi que un plato mirado entero son cinco filas y UN request.
--
-- Las tres condiciones del `where` no son nuevas: son exactamente las mismas que decide la
-- policy `dishes_select` para el publico —restaurante activo, plato disponible, video
-- 'ready'—. Escribir un cuarto criterio propio acá seria abrir una rendija por la que se
-- registran platos que la carta no muestra.
--
-- `security definer` porque tiene que insertar donde el que llama no tiene ningun permiso.
-- `search_path` fijo por lo de siempre: sin eso, quien pueda crear un esquema en el path
-- secuestra los nombres `dishes`, `restaurants` y `dish_view_events`.
create or replace function public.record_dish_views(
  p_dish_id  uuid,
  p_session  text,
  p_momentos text[]
)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_restaurant_id uuid;
begin
  -- Formato del token antes que nada: es lo unico que llega del cliente sin pasar por una
  -- clave foranea, y es la columna sobre la que se apoya todo el anti-abuso.
  if p_session is null or p_session !~ '^[0-9a-f]{32}$' then
    return;
  end if;

  if p_momentos is null or cardinality(p_momentos) = 0 then
    return;
  end if;

  -- El `restaurant_id` sale del PLATO, nunca del que llama. Si viniera por parametro, un
  -- script podria imputarle vistas al restaurante de al lado.
  select d.restaurant_id into v_restaurant_id
  from public.dishes d
  join public.restaurants r on r.id = d.restaurant_id
  where d.id = p_dish_id
    and r.is_active
    and d.is_available
    and d.video_status = 'ready';

  -- Plato inexistente, no disponible, sin video listo o de un restaurante dado de baja: se
  -- sale en silencio. Un error acá le confirmaria a quien sondea que el id existe, y la
  -- respuesta es la misma en los cuatro casos justamente para que no distinga.
  if v_restaurant_id is null then
    return;
  end if;

  -- Techo por ventana. El indice unico ya hace que repetir sea gratis para el contador,
  -- asi que esto ataca el otro lado: el script que inventa un token nuevo por cada visita
  -- falsa. No lo vuelve imposible —sin IP ni captcha nada lo vuelve imposible— pero le
  -- pone un costo por sesion en vez de dejarlo escribir en un loop.
  if (
    select count(*) from public.dish_view_events e
    where e.session_token = p_session
      and e.created_at > now() - interval '1 minute'
  ) >= 120 then
    return;
  end if;

  -- Los momentos desconocidos se FILTRAN, no revientan. Dejar que el `check` de la columna
  -- levante una excepcion convertiria cualquier entrada basura en un 500 en la pantalla de
  -- un comensal que no hizo nada malo.
  insert into public.dish_view_events (restaurant_id, dish_id, momento, session_token)
  select v_restaurant_id, p_dish_id, m, p_session
  from unnest(p_momentos) as m
  where m in ('iniciado', '25', '50', '75', 'completo')
  on conflict (dish_id, session_token, momento) do nothing;
end;
$$;

revoke all on function public.record_dish_views(uuid, text, text[]) from public;
grant execute on function public.record_dish_views(uuid, text, text[]) to anon, authenticated;

-- ============================================================================
-- 4. La vista que lee el panel
-- ============================================================================

-- Vista comun, no materializada: los volumenes de una carta son chicos y una materializada
-- agrega un refresco que mantener y numeros viejos que explicar.
--
-- `security_invoker = true` es lo que hace que esto sea seguro y NO es el default: una
-- vista corre con los permisos de quien la creo, asi que sin esta opcion la vista leeria
-- la tabla como su dueño y le mostraria a cualquier dueño los eventos de TODOS los
-- restaurantes, salteando la policy de la seccion 2 sin que nadie lo note.
create view public.dish_view_metrics
with (security_invoker = true)
as
select
  d.id           as dish_id,
  d.restaurant_id,
  d.name         as dish_name,
  -- Una "vista" es una sesion que arranco el video, no un evento: cinco momentos de la
  -- misma persona son una vista, no cinco.
  count(distinct e.session_token) filter (where e.momento = 'iniciado')  as vistas,
  count(distinct e.session_token) filter (where e.momento = 'completo')  as completos,
  case
    when count(distinct e.session_token) filter (where e.momento = 'iniciado') = 0 then null
    else round(
      100.0
      * count(distinct e.session_token) filter (where e.momento = 'completo')
      / count(distinct e.session_token) filter (where e.momento = 'iniciado')
    )
  end as porcentaje_completo
from public.dishes d
left join public.dish_view_events e on e.dish_id = d.id
group by d.id, d.restaurant_id, d.name;

-- `left join` mas este grant: un plato sin una sola vista aparece en cero, no desaparece.
-- Un plato que no figura en la lista se lee como un error del panel.
revoke all on public.dish_view_metrics from anon;
grant select on public.dish_view_metrics to authenticated;

notify pgrst, 'reload schema';
