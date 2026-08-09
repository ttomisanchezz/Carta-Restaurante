# Proyecto: Carta interactiva con video para restaurantes

Este archivo es la fuente de verdad del proyecto. Leelo completo antes de escribir una sola línea de código.

---

## 1. Qué estamos construyendo

Una carta digital para restaurantes a la que el comensal accede escaneando un QR en la mesa. A diferencia de un PDF o una carta de texto, **cada plato tiene un video corto**. El comensal navega por categorías, toca un plato y ve el video a pantalla completa con la descripción, el precio y una recomendación de maridaje/acompañamiento escrita por el propio dueño del restaurante.

El producto se vende por suscripción a restaurantes. Hoy construimos el **Paso 1**.

**Paso 1 (esto):** carta pública + panel de carga de contenido.
**Paso 2 (más adelante, NO ahora):** recomendador con IA que conversa con el comensal.
**Paso 3 (más adelante, NO ahora):** pedidos desde la carta directo a cocina.

---

## 2. Stack fijo — no proponer alternativas

- **Next.js** (App Router, TypeScript estricto)
- **Supabase** — Postgres + Auth + RLS
- **Tailwind CSS**
- **Vercel** para deploy
- **Video: proveedor externo con HLS** (Bunny Stream o Mux). Los videos NO se guardan en Supabase Storage ni se sirven como MP4 desde el origen.

Estas decisiones ya están tomadas. No abrir debate sobre el stack.

---

## 3. Decisiones de arquitectura ya cerradas

### 3.1 Multi-tenant desde el día 1
`restaurants` es la entidad raíz. **Toda** tabla de contenido cuelga de un `restaurant_id`. Aunque al principio cargue el contenido una sola persona, el modelo tiene que soportar N restaurantes independientes desde la primera migración.

### 3.2 Un solo panel de administración
No hay un "cargador rápido para el dueño del producto" y otro panel para restaurantes después. Se construye **un** panel, funcional y sin adornos, protegido con Supabase Auth. Al principio lo usa el dueño del producto; después se le da acceso a cada restaurante con su usuario. La estructura tiene que soportar eso desde ya.

### 3.3 Planes sí, cobros no
Cada restaurante tiene una columna `plan`. Las features se activan por flag leído de la base. **No** integrar Stripe, Mercado Pago ni ninguna pasarela. El cobro es manual por fuera del sistema. Los planes previstos:

- `basico` — carta con videos + recomendaciones del dueño
- `pedidos` — todo lo del básico + pedido desde la mesa (no se construye ahora)

### 3.4 El video es el producto
La métrica que define si esto funciona: **cuánto tarda en verse el primer frame en un celular con 4G malo dentro de un restaurante**. Todo lo demás es secundario. Esto implica:

- HLS con calidades adaptativas, servido por el proveedor de video
- Imagen poster de cada plato que carga primero (el grid nunca muestra un cuadro negro esperando video)
- El video de un plato se carga **solo cuando el usuario lo abre**, nunca los 40 en paralelo
- Sin autoplay de videos en la grilla de categorías

### 3.5 Abstraer el proveedor de video
Todo acceso al proveedor va detrás de una interfaz en `lib/video/provider.ts`. Ningún componente ni ruta llama al SDK del proveedor directamente. Cambiar de Bunny a Mux tiene que ser tocar un solo archivo.

### 3.6 Precios como enteros
Los precios se guardan como **entero en la unidad mínima** (centavos), nunca como float. Moneda configurable por restaurante. El formateo es responsabilidad de la vista.

---

## 4. Modelo de datos inicial

Proponer las migraciones SQL antes de aplicarlas. Base de partida:

**restaurants** — `id`, `slug` (único, es la URL pública), `name`, `logo_url`, `primary_color`, `currency`, `plan`, `is_active`, `created_at`

**categories** — `id`, `restaurant_id` (FK), `name`, `sort_order`

**dishes** — `id`, `restaurant_id` (FK), `category_id` (FK), `name`, `description`, `price` (int), `pairing_text` (la recomendación del dueño), `video_playback_id`, `video_status`, `thumbnail_url`, `is_available`, `sort_order`, `created_at`

**profiles** — `id` (FK a auth.users), `restaurant_id` (nullable), `role` (`owner` | `staff` | `superadmin`)

`restaurant_id` va desnormalizado en `dishes` a propósito, aunque se pueda derivar vía `category_id`: simplifica las policies de RLS y evita joins en cada lectura pública.

### RLS obligatorio
- Lectura pública anónima: solo filas de restaurantes con `is_active = true`
- Escritura: solo usuarios autenticados cuyo `profiles.restaurant_id` coincida con la fila, o `role = 'superadmin'`
- Nada de service_role key en el cliente, nunca

---

## 5. Alcance del Paso 1

### Entra
- Carta pública en `/[slug]`: header del restaurante, navegación por categorías, grilla de platos con poster + nombre + precio
- Vista de plato a pantalla completa: video HLS, descripción, precio, `pairing_text`, botón de cerrar
- Panel en `/admin`: login, CRUD de restaurantes, categorías y platos, subida de video al proveedor, reordenamiento
- Estados vacíos y de carga reales (un restaurante sin platos no puede romper)
- Responsive real, diseñado mobile-first — el 99% del tráfico es un celular en una mesa

### No entra — no construir ni dejar preparado "por las dudas"
- Recomendador con IA
- Pedidos, carrito, comandas, integración con cocina
- Pasarela de pagos, facturación, onboarding self-service
- Panel de métricas o analytics
- App nativa
- Multi-idioma

Si algo de esta lista aparece como "es fácil dejarlo listo ahora", la respuesta es no.

---

## 6. Cómo quiero que trabajes

1. **No escribas código hasta tener 90% de confianza en lo que hay que construir.** Si algo del spec es ambiguo, preguntá antes. Una pregunta cuesta mucho menos que reescribir un módulo.
2. **Trabajá por fases y frená al final de cada una** para que yo revise antes de seguir.
3. **No instales dependencias sin justificar** por qué no alcanza con lo que ya hay.
4. **TypeScript estricto.** Nada de `any`.
5. **No inventes features** que no estén en este documento.
6. Antes de tocar el esquema de la base, mostrame el SQL y esperá aprobación.
7. Si detectás que una decisión de este documento es un error técnico, decilo explícitamente en vez de implementarla en silencio o de ignorarla.

---

## 7. Fases

**Fase 0 — Setup.** Proyecto Next.js, Tailwind, cliente Supabase, variables de entorno, estructura de carpetas. Sin features.

**Fase 1 — Base de datos.** Migraciones, tablas, RLS, tipos TypeScript generados desde el esquema, seed con un restaurante de ejemplo.

**Fase 2 — Carta pública.** Ruta `/[slug]`, categorías, grilla de platos con posters. Todavía sin video: solo imágenes.

**Fase 3 — Video.** Integración del proveedor detrás de `lib/video/provider.ts`, vista de plato a pantalla completa, reproducción HLS.

**Fase 4 — Panel.** Auth, CRUD completo, subida de video.

**Fase 5 — Pulido.** Performance en 4G, estados de error, accesibilidad básica, deploy en Vercel.

---

## 8. Primera tarea

Leé este documento completo. Después, **antes de escribir código**:

1. Decime qué partes del spec te parecen ambiguas o riesgosas.
2. Recomendame entre Bunny Stream y Mux para este caso concreto (pocos restaurantes al inicio, videos de 5-15 segundos, presupuesto ajustado, tráfico en Argentina), con el criterio de decisión explícito.
3. Proponé la estructura de carpetas del proyecto.

Recién cuando yo apruebe eso, arrancamos con la Fase 0.
