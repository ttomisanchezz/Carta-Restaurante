-- BRASA — la demo de ventas.
--
-- Esta no es data de relleno: `/brasa` es la pantalla que se le muestra a un restaurante
-- candidato para venderle la suscripcion. Un plato con descripcion floja o sin poster no es
-- un dato de prueba, es una reunion perdida.
--
-- IDEMPOTENTE, y no por prolijidad: `pnpm db:push` corre este archivo en CADA invocacion.
-- Todo va con `on conflict (id) do update set`, nunca un insert pelado, que reventaria con
-- violacion de clave primaria en la segunda corrida y voltearia el gate. Los UUID fijos son
-- justamente lo que hace posible el `on conflict` — y ademas hay tests que buscan por id.
--
-- Los platos se eligieron por una sola regla: comida que GANA con el movimiento y PIERDE en
-- una foto. Provoleta burbujeando, el ojo de bife abriendose bajo el cuchillo, la yema
-- rompiendose. Una ensalada quieta no demuestra nada, aunque sea rica.
--
-- Los precios son ENTEROS EN CENTAVOS. $13.500,00 se escribe 1350000.
--
-- El texto que ve el comensal va con ortografia correcta, acentos y enes incluidas: esto es
-- material de venta. Los SLUGS en cambio son ASCII (`entrana-fina`), porque son URL publicas
-- y el constraint del slug es `^[a-z0-9-]{2,40}$`.
--
-- El usuario administrador NO se crea aca: lo crea `scripts/create-admin.ts` (`pnpm db:admin`)
-- con la API de administracion de Auth. Insertar a mano en `auth.users` depende de columnas
-- que cambian entre versiones de Supabase.
--
-- ATENCION, y esto cuesta caro descubrirlo solo: `supabase db push --include-seed` NO
-- vuelve a ejecutar este archivo cuando cambia. La primera vez imprime "Seeding data
-- from..." y lo corre; despues, aunque lo edites, imprime "Updating seed hash to..." y se
-- limita a registrar el hash nuevo. Sale con exit 0 en los dos casos.
--
-- O sea: **editar este archivo y correr `pnpm db:push` no cambia una base que ya existe.**
-- El seed vale para un entorno nuevo. Para una base ya sembrada hay que aplicar el cambio
-- aparte, o recrearla con `db:reset` (destructivo, a mano, nunca en un test).
--
-- Correccion de una nota anterior que estaba mal: se creia haber verificado el camino
-- `on conflict` forzando un reseed y viendo que las cantidades seguian en 1/4/12. Las
-- cantidades quedan igual tambien cuando el seed NO corre, asi que esa observacion no
-- probaba nada. Se descubrio al cambiar los video_playback_id y ver que la base seguia con
-- los valores viejos.
--
-- ---------------------------------------------------------------------------------------
-- VIDEOS
--
-- Los `video_playback_id` son public_id reales de la cuenta de Cloudinary, no rutas del
-- proyecto. Estan ACA y no puestos a mano en la base porque este archivo corre en cada
-- `db:push` con `on conflict do update`: cualquier cambio hecho directo contra Postgres lo
-- revierte el proximo push.
--
-- Asignacion EN ORDEN, decidida asi a sabiendas: es una demo, y el video no siempre
-- corresponde con el plato. `comida3_xbyysv` quedo afuera porque es horizontal (3840x2160)
-- y el reproductor es 9:16.
--
-- **Cuatro platos REPITEN video**, porque hay 8 usables para 12 platos:
--   cebollas-asadas       repite el de provoleta            (comida1_tiowzz)
--   champinones-al-ajillo repite el de empanadas            (comida2_usftrg)
--   flan-mixto            repite el de chorizo              (comida4_uemxwo)
--   panqueque-flambeado   repite el de ojo de bife          (comida5_rksq7x)
--
-- Se eligio repetir en vez de dejarlos sin video: un plato en `pending` desaparece de la
-- carta —lo tapa la policy— y uno apuntando a un video inexistente muestra el cartel de
-- error. En una reunion de venta, repetido se nota menos que roto. Con cuatro videos mas,
-- se reemplazan estas cuatro lineas y listo.

insert into public.restaurants (id, slug, name, primary_color, currency, plan, is_active)
values (
  'b0000000-0000-4000-8000-000000000001',
  'brasa',
  'BRASA',
  '#E8562A',
  'ARS',
  'basico',
  true
)
on conflict (id) do update set
  slug          = excluded.slug,
  name          = excluded.name,
  primary_color = excluded.primary_color,
  currency      = excluded.currency,
  plan          = excluded.plan,
  is_active     = excluded.is_active;

insert into public.categories (id, restaurant_id, name, sort_order)
values
  ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'Para empezar',   0),
  ('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'De la parrilla', 1),
  ('c0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', 'Guarniciones',   2),
  ('c0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001', 'Postres',        3)
on conflict (id) do update set
  restaurant_id = excluded.restaurant_id,
  name          = excluded.name,
  sort_order    = excluded.sort_order;

insert into public.dishes (
  id, restaurant_id, category_id, name, description, price, pairing_text,
  video_playback_id, video_status, thumbnail_url, is_available, sort_order
)
values
  -- Para empezar ------------------------------------------------------------------
  (
    'd0000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000001',
    'Provoleta a la parrilla',
    'Provolone hilado sobre disco de hierro, con orégano y un hilo de aceite de oliva. Sale burbujeando y se come ahí mismo.',
    1250000,
    'Pedila apenas te sentás y compartila. Si la dejás para el final se enfría y ya no es lo mismo, creeme.',
    'comida1_tiowzz',
    'ready',
    '/seed/provoleta.svg',
    true,
    0
  ),
  (
    'd0000000-0000-4000-8000-000000000002',
    'b0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000001',
    'Empanadas de carne cortada a cuchillo',
    'Dos unidades, masa criolla al horno de barro. Carne cortada a cuchillo, cebolla de verdeo y huevo.',
    780000,
    'Mordela de una punta y esperá un segundo: suelta el jugo. Mi vieja las hacía así y no le cambié nada.',
    'comida2_usftrg',
    'ready',
    '/seed/empanadas-de-carne.svg',
    true,
    1
  ),
  (
    'd0000000-0000-4000-8000-000000000003',
    'b0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000001',
    'Chorizo criollo con chimichurri',
    'Chorizo de cerdo y vacuno de nuestra carnicería, abierto en mariposa sobre las brasas. Va con chimichurri de la casa.',
    990000,
    'Éste es el que te dice si la parrilla está bien prendida. Pedilo con pan y hacete un sanguchito.',
    'comida4_uemxwo',
    'ready',
    '/seed/chorizo-criollo.svg',
    true,
    2
  ),

  -- De la parrilla ----------------------------------------------------------------
  (
    'd0000000-0000-4000-8000-000000000004',
    'b0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000002',
    'Ojo de bife 400g',
    'Corte de novillo con marmoleo parejo, sellado fuerte y terminado al costado de las brasas. Punto a elección.',
    2890000,
    'Pedilo jugoso. Cuando lo abrís con el cuchillo se ve el centro rosado, y ahí entendés por qué es el plato de la casa.',
    'comida5_rksq7x',
    'ready',
    '/seed/ojo-de-bife.svg',
    true,
    0
  ),
  (
    'd0000000-0000-4000-8000-000000000005',
    'b0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000002',
    'Entraña fina',
    'Entraña de novillo, sellada de los dos lados y descansada cinco minutos antes de salir a la mesa.',
    2650000,
    'Yo la pido siempre a punto. Vuelta y vuelta queda dura, y bien cocida perdés todo el jugo que la hace.',
    'comida6_r3haf4',
    'ready',
    '/seed/entrana-fina.svg',
    true,
    1
  ),
  (
    'd0000000-0000-4000-8000-000000000006',
    'b0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000002',
    'Asado de tira',
    'Tira ancha de tres costillas, tres horas a fuego bajo. La grasa se derrite y la carne se separa del hueso sola.',
    2490000,
    'Es el corte más argentino que hay. Comelo con la mano si nadie te mira, que es la única forma correcta.',
    'comida7_tzxmjh',
    'ready',
    '/seed/asado-de-tira.svg',
    true,
    2
  ),
  (
    'd0000000-0000-4000-8000-000000000007',
    'b0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000002',
    'Mollejas al limón',
    'Mollejas de corazón, blanqueadas y terminadas sobre brasa fuerte hasta que quedan crocantes. Limón exprimido arriba.',
    1950000,
    'Si nunca comiste mollejas, empezá por éstas. Crocantes afuera, cremosas adentro, y el limón te corta la grasa.',
    'comdia_8_m5fxmy',
    'ready',
    '/seed/mollejas-al-limon.svg',
    true,
    3
  ),

  -- Guarniciones ------------------------------------------------------------------
  (
    'd0000000-0000-4000-8000-000000000008',
    'b0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000003',
    'Papas fritas con huevo roto',
    'Papas cortadas a mano, fritas dos veces, con dos huevos de campo por encima y sal gruesa.',
    890000,
    'Rompé la yema apenas te la traen y mezclá todo. Si esperás se cuaja y te perdés la salsa.',
    'comida_9_jbidjp',
    'ready',
    '/seed/papas-con-huevo-roto.svg',
    true,
    0
  ),
  (
    'd0000000-0000-4000-8000-000000000009',
    'b0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000003',
    'Cebollas asadas con manteca de hierbas',
    'Cebollas enteras asadas en su cáscara sobre las brasas, abiertas al medio con manteca de perejil y tomillo.',
    650000,
    'Parece simple y es la guarnición que más nos piden repetir. La manteca se derrite adentro de la cebolla.',
    'comida1_tiowzz',
    'ready',
    '/seed/cebollas-asadas.svg',
    true,
    1
  ),
  (
    'd0000000-0000-4000-8000-000000000010',
    'b0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000003',
    'Champiñones al ajillo',
    'Champiñones enteros a la plancha con ajo laminado, perejil fresco y un golpe de vino blanco.',
    720000,
    'Van bien con cualquier corte, pero con la entraña son otra cosa. Mojá el pan en lo que queda en la cazuela.',
    'comida2_usftrg',
    'ready',
    '/seed/champinones-al-ajillo.svg',
    true,
    2
  ),

  -- Postres -----------------------------------------------------------------------
  (
    'd0000000-0000-4000-8000-000000000011',
    'b0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000004',
    'Flan mixto',
    'Flan casero de huevo con dulce de leche repostero y crema batida sin azúcar.',
    750000,
    'Mixto siempre, no elijas. El que pide sólo dulce de leche vuelve a los diez minutos a pedir la crema.',
    'comida4_uemxwo',
    'ready',
    '/seed/flan-mixto.svg',
    true,
    0
  ),
  (
    'd0000000-0000-4000-8000-000000000012',
    'b0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000004',
    'Panqueque de dulce de leche flambeado',
    'Panqueque relleno de dulce de leche, flambeado con ron en la mesa y espolvoreado con azúcar impalpable.',
    820000,
    'Lo prendemos delante tuyo. Es el único postre que hace que la mesa de al lado gire la cabeza.',
    'comida5_rksq7x',
    'ready',
    '/seed/panqueque-flambeado.svg',
    true,
    1
  )
on conflict (id) do update set
  restaurant_id     = excluded.restaurant_id,
  category_id       = excluded.category_id,
  name              = excluded.name,
  description       = excluded.description,
  price             = excluded.price,
  pairing_text      = excluded.pairing_text,
  video_playback_id = excluded.video_playback_id,
  video_status      = excluded.video_status,
  thumbnail_url     = excluded.thumbnail_url,
  is_available      = excluded.is_available,
  sort_order        = excluded.sort_order;
