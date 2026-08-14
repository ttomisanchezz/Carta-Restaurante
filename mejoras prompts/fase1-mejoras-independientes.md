# Fase 1 — Mejoras de carta y panel (independientes entre sí)

## Contexto
Carta digital con video para restaurantes (demo: BRASA). Estas 5 mejoras no dependen de ninguna infraestructura nueva ni entre sí — se pueden hacer en cualquier orden. Cada una tiene que pasar el gate (`pnpm typecheck && pnpm lint && pnpm test`) antes de pasar a la siguiente.

Antes de tocar código: leé CLAUDE.md completo, y `.claude/rules/estilos-y-tokens.md` para todo lo visual, `.claude/rules/video.md` para lo que toca el reproductor. Si algo de lo que sigue contradice una regla ya escrita ahí, decímelo en dos frases con la alternativa que sí cumple — no lo apliques en silencio ni te frenes a discutir.

## 1. Indicador de reproducción sobre el poster
Cada tarjeta de plato en la carta pública necesita una señal visual de que es un video y no una foto: un ícono de play o un anillo sutil superpuesto sobre el poster. Chico — no debe tapar el nombre ni el precio del plato. Sin colores nuevos: usá los tokens que ya existen. Si lleva animación, solo `transform`/`opacity`, respetando `prefers-reduced-motion`. Sin bytes de red nuevos: SVG inline o CSS, no una imagen.

## 2. Skeleton de carga con identidad propia
Durante la precarga de posters/video, reemplazá cualquier spinner genérico por un skeleton que use los tokens de superficie y borde del proyecto. Nada de gris neutro puro — ya está documentado por qué (se lee azulado al lado de un poster de brasas). Si el shimmer es animado, que respete `prefers-reduced-motion`.

## 3. Vista expandida del plato
Al tocar una tarjeta, abrí un modal a pantalla completa con el video, el maridaje en Fraunces (más grande que en la tarjeta), nombre y precio. Es un modal — no cambia la URL ni rompe el link compartible de la carta pública. Al abrirse, pausá el video de la tarjeta de origen para que no se superpongan dos audios. Usá los 220ms que ya están definidos en el sistema de diseño para "abrir el plato" — ese token ya existe, no inventes uno nuevo. Mismas reglas de autoplay que ya aplican en la grilla: nada de autoplay con `prefers-reduced-motion`, ahorro de datos o 2G.

## 4. Checklist de activación en el panel
Solo en el panel del dueño — nunca en la carta pública. Una vista de progreso de activación: platos con `video_status = 'ready'` sobre el total, y platos con maridaje cargado sobre el total. Formato simple: barra de progreso o lista con checks. No bloquea nada, es solo guía.

## 5. Aviso de inactividad
Solo en el panel del dueño — nunca en la carta pública. Un banner que aparece si hace más de 14 días que el dueño no inicia sesión (ajustable si te parece que el número no tiene sentido). Supabase Auth guarda `last_sign_in_at` en `auth.users` — confirmá que está poblado en este proyecto antes de asumirlo, así no reinventás tracking de sesión que ya existe. El banner se muestra la próxima vez que el dueño sí entra al panel; no manda mail ni notificación externa, es solo in-app.
