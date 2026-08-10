---
name: agregar-plato-al-seed
description: Usar al agregar, sacar o editar un plato, una categoria o un dato del restaurante BRASA en supabase/seed.sql. BRASA es la demo de ventas que se le muestra a los restaurantes candidatos, asi que el seed es un entregable, no relleno. Cubre precios en centavos, poster SVG obligatorio, texto de maridaje en voz del dueno y como no romper los tests que dependen de los UUID fijos.
---

# Agregar un plato al seed

## Cuando usarla

- "agregá un plato a la demo", "cambiá el precio de la entrana", "falta un postre",
  "el maridaje del ojo de bife no convence", "sumá una categoria a BRASA".

## Por que importa mas de lo que parece

`/brasa` **es la demo de ventas**. Es la pantalla que se le muestra a un restaurante candidato para
venderle la suscripcion. Un plato con descripcion floja o sin poster no es un dato de prueba: es una
reunion perdida.

## Pasos

1. **Elegir el plato por una sola regla:** comida que *gana* con movimiento y *pierde* en una foto.
   Provoleta burbujeando, el ojo de bife abriendose bajo el cuchillo, humo saliendo de la parrilla.
   Una ensalada quieta no demuestra nada, aunque sea rica.

2. **Editar `supabase/seed.sql`.** El plato nuevo lleva:
   - `id` — un UUID fijo de la serie `d0000000-0000-4000-8000-0000000000NN`, con `NN` sin usar.
     **Fijo, no `gen_random_uuid()`**: hay tests que buscan platos por id.
   - `restaurant_id` — `b0000000-0000-4000-8000-000000000001` (BRASA).
   - `category_id` — uno de los cuatro `c0000000-0000-4000-8000-00000000000X`.
   - `price` — **entero en centavos**. `$13.500,00` se escribe `1350000`. Nunca un decimal.
   - `description` — una o dos frases concretas: corte, coccion, con que viene. Sin adjetivos vacios.
   - `pairing_text` — la recomendacion del dueno, en primera persona y en rioplatense. Es lo unico
     que ninguna carta en PDF tiene y es lo que vende el producto. Que suene a persona, no a ficha.
   - `thumbnail_url` — `/seed/<slug-del-plato>.svg`.
   - `video_playback_id` — `seed/<slug-del-plato>`.
   - `video_status` — `'ready'`. Un plato que no esta `ready` **no aparece en la carta publica**
     (lo impide la propia policy de RLS), asi que un plato de demo en `pending` es un plato invisible.
   - `sort_order` — entero, unico dentro de su categoria.

3. **Crear el poster.** No se escribe a mano: se agrega el plato a la lista `POSTERS` de
   `scripts/generar-posters-seed.ts` y se corre

   ```bash
   node --experimental-strip-types scripts/generar-posters-seed.ts
   ```

   Sale un `public/seed/<slug-del-plato>.svg` de 4:5 con las brasas bajo la parrilla, en la paleta
   del proyecto y con el rescoldo en una posicion propia. **Sin el nombre del plato adentro**: la
   tarjeta ya lo muestra justo debajo, y repetirlo se lee como un error de maquetado. Es SVG y no
   JPG a proposito: se escribe como texto, pesa ~2 KB y se ve terminado.

   El orden de `POSTERS` decide la posicion del rescoldo de cada plato, asi que reordenar la lista
   cambia los doce archivos. Agregá al final salvo que quieras eso.

4. **Reaplicar el seed.**
   ```bash
   pnpm db:push && pnpm db:admin
   ```

   **Ojo:** `db:push` NO vuelve a ejecutar el seed sobre una base que ya existe — solo registra el
   hash nuevo, y sale con exito igual. Sirve para un entorno nuevo. Para una base ya sembrada hay
   que aplicar el cambio aparte o recrearla con `db:reset` (destructivo, a mano, nunca en un test).

## Verify

```bash
pnpm db:push                                    # expect: exit 0
pnpm db:admin                                   # expect: exit 0
pnpm test tests/integration/seed.test.ts        # expect: exit 0, 0 failed, 0 skipped
pnpm build                                       # expect: exit 0
pnpm test:e2e tests/e2e/dish-grid.spec.ts       # expect: exit 0, 0 failed
```

## No hacer

- **No usar float ni decimales para el precio.** `13500.00` es un bug esperando reconciliacion.
- **No dejar `pairing_text` en `null` en la demo.** Es el argumento de venta del producto.
- **No apuntar `thumbnail_url` a una URL externa.** El seed tiene que funcionar sin red: los tests de
  la grilla y el de presupuesto de bytes del poster dependen de eso.
- **No reciclar un `id` de un plato que borraste.** Agregá el siguiente `NN` libre.
- **No borrar ni renumerar las categorias existentes:** hay tests que las referencian por id.
