# Fase 2 — Métricas por plato

## Contexto
Es la feature de la que van a depender después la insignia de "plato destacado" automática y el resumen semanal descargable (Fase 3) — no toques esas todavía, vienen en otra ronda una vez que esto esté funcionando con datos reales.

Antes de escribir nada: leé CLAUDE.md completo y `.claude/rules/base-de-datos-y-rls.md`. Esto es un patrón de escritura que hoy no existe en el proyecto — todas las policies de escritura actuales exigen `restaurant_id = current_restaurant_id()` o `is_superadmin()`, y un comensal anónimo no cumple ninguna de las dos. Vas a tener que diseñar una policy para un rol sin sesión, y quiero que la pares antes de aplicarla (ver más abajo).

## Qué capturar
No alcanza con "lo vieron" — el diferencial de tener video en vez de fotos es la profundidad: cuánto mira la gente del video, no solo si lo abrió. Necesito eventos con estos momentos como mínimo: iniciado, 25%, 50%, 75%, completo.

## Esquema
Proponé una tabla de eventos (`dish_view_events` o el nombre que prefieras, respetando la convención plural/snake_case del proyecto) con `restaurant_id` y `dish_id` denormalizados — mismo criterio que ya usa `dishes` con `restaurant_id` aunque se derive de `category_id`: simplifica la policy de lectura y evita joins.

## RLS — pará acá antes de aplicar nada
No expongas un INSERT directo al rol `anon` sobre la tabla. Preferí una función RPC `security definer` (mismo mecanismo que ya usan `current_restaurant_id()` e `is_superadmin()`) que:
- valide que el plato pertenece a un restaurante activo, disponible y con video listo — las mismas tres condiciones que ya usa la policy de lectura pública, no inventes otras nuevas
- aplique algún control anti-abuso básico. No tengo el mecanismo exacto decidido — proponé el que te parezca razonable, pero tiene que existir algo que evite que un script infle los números

Para la lectura del dashboard, reusá `current_restaurant_id()`/`is_superadmin()` tal como están — mismo patrón que ya existe, el dueño solo ve sus propios datos.

**Antes de escribir la migración de RLS**, contame en dos o tres frases la policy y la función que pensás crear, y esperá mi confirmación. Es la parte más nueva y más sensible de todo el proyecto hasta ahora — no quiero enterarme después de qué quedó abierto al público.

No te olvides de `notify pgrst, 'reload schema';` al final de la migración que toca policies.

## Agregación y dashboard
Para no pegarle a la tabla de eventos cruda desde el panel, armá una vista (o vista materializada, a tu criterio) que agregue por plato: vistas totales y % que llega a completar el video. Esto se muestra en el panel del dueño — nunca en la carta pública. El comensal no ve ningún número, solo genera los eventos en silencio desde ahí.

## Cliente
Agrupá los eventos del lado del navegador en vez de mandar un request por cada punto de progreso suelto. Batching simple alcanza, no hace falta sumar una librería nueva para esto.

## Gate
`pnpm typecheck && pnpm lint && pnpm test` en verde antes de dar esto por terminado.
