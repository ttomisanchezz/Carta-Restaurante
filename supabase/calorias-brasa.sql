-- Calorias de los platos de BRASA. **SE APLICA A MANO, no es una migracion.**
--
-- Por que vive fuera de `supabase/migrations/`:
--
--   * Los valores todavia no existen. Este archivo esta listo para que vos los completes,
--     y una migracion no se edita despues de aplicada.
--   * Son datos de UN restaurante, no esquema. El esquema —la columna `dishes.calories`—
--     ya lo puso la migracion `20260813230914_mesas_identificadas_y_calorias.sql`.
--   * `supabase db push --include-seed` NO re-ejecuta `seed.sql` en una base que ya existe:
--     registra el hash nuevo, imprime "Updating seed hash to..." y sale con exit 0. Meter
--     esto ahi seria escribirlo para que nunca corra.
--
-- Como aplicarlo, cuando tengas los numeros:
--
--   psql "$DATABASE_URL" -f supabase/calorias-brasa.sql
--
-- o pegandolo en el SQL editor del dashboard. Esto ultimo esta permitido acá y solo acá:
-- la regla que prohibe el editor del dashboard es sobre el ESQUEMA. Esto son doce UPDATE
-- de datos y no dejan deriva de esquema.
--
-- Es idempotente: correrlo dos veces deja el mismo resultado.
--
--
-- NO INVENTES ESTOS NUMEROS, y no dejes que nadie los complete "a ojo".
--
-- BRASA es la carta que se le muestra a un restaurante candidato para venderle la
-- suscripcion, no data de prueba. Una calorias inventada en una pantalla de venta es una
-- afirmacion nutricional falsa sobre comida — el tipo de detalle que hunde una reunion si
-- el dueño conoce sus propios platos, y que en varios paises tiene consecuencias legales
-- cuando se publica. Mientras el valor sea NULL la carta NO MUESTRA NADA, que es la
-- respuesta correcta a "no sabemos".
--
-- Un ojo de bife de 400g ronda las 900 kcal y una provoleta las 500, pero esos son numeros
-- de tabla generica: dependen del corte, del gramaje real y de con cuanta grasa sale de esa
-- parrilla. Los tiene que dar la cocina.

begin;

-- ---------------------------------------------------------------------------- Para empezar
update public.dishes set calories = NULL  -- Provoleta a la parrilla
 where id = 'd0000000-0000-4000-8000-000000000001';

update public.dishes set calories = NULL  -- Empanadas de carne cortada a cuchillo
 where id = 'd0000000-0000-4000-8000-000000000002';

update public.dishes set calories = NULL  -- Chorizo criollo con chimichurri
 where id = 'd0000000-0000-4000-8000-000000000003';

-- -------------------------------------------------------------------------- De la parrilla
update public.dishes set calories = NULL  -- Ojo de bife 400g
 where id = 'd0000000-0000-4000-8000-000000000004';

update public.dishes set calories = NULL  -- Entraña fina
 where id = 'd0000000-0000-4000-8000-000000000005';

update public.dishes set calories = NULL  -- Asado de tira
 where id = 'd0000000-0000-4000-8000-000000000006';

update public.dishes set calories = NULL  -- Mollejas al limón
 where id = 'd0000000-0000-4000-8000-000000000007';

-- ---------------------------------------------------------------------------- Guarniciones
update public.dishes set calories = NULL  -- Papas fritas con huevo roto
 where id = 'd0000000-0000-4000-8000-000000000008';

update public.dishes set calories = NULL  -- Cebollas asadas con manteca de hierbas
 where id = 'd0000000-0000-4000-8000-000000000009';

update public.dishes set calories = NULL  -- Champiñones al ajillo
 where id = 'd0000000-0000-4000-8000-000000000010';

-- --------------------------------------------------------------------------------- Postres
update public.dishes set calories = NULL  -- Flan mixto
 where id = 'd0000000-0000-4000-8000-000000000011';

update public.dishes set calories = NULL  -- Panqueque de dulce de leche flambeado
 where id = 'd0000000-0000-4000-8000-000000000012';

-- Control: los doce platos de BRASA, con lo que quedo cargado. Las filas que sigan en NULL
-- son las que todavia no tienen dato, y en la carta no muestran nada.
select d.name, d.calories
from public.dishes d
join public.restaurants r on r.id = d.restaurant_id
where r.slug = 'brasa'
order by d.sort_order;

commit;
