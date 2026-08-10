---
description: Abstraccion del proveedor de video, URLs de entrega y reproduccion HLS
paths:
  - "src/lib/video/**"
  - "src/components/menu/video-player.tsx"
  - "src/components/admin/video-uploader.tsx"
  - "src/app/api/video/**"
---

# Video

## La abstraccion es la regla, no una sugerencia

- **Todo acceso al proveedor pasa por `src/lib/video/provider.ts`.** Ningun componente, ninguna ruta
  y ningun Server Action importa `cloudinary` ni arma una URL de `res.cloudinary.com` a mano.
- El unico archivo que puede importar el SDK `cloudinary` es `src/lib/video/cloudinary-provider.ts`.
- Cambiar a Bunny Stream tiene que ser **un archivo nuevo** que implemente `VideoProvider` mas un
  valor distinto en `VIDEO_PROVIDER`. Si un cambio de proveedor toca un componente, la abstraccion
  esta rota.
- **No instalar `next-cloudinary`.** Sus `peerDependencies` publicadas llegan hasta `next: ^15`, asi
  que un install estricto con Next 16 falla; y expone componentes React atados al proveedor, que es
  exactamente lo que esta regla existe para impedir.

## La interfaz

```ts
export type VideoProvider = {
  readonly name: string;
  playbackUrl(playbackId: string): string;
  posterUrl(playbackId: string, opts: { width: number; ratio: "9:16" | "4:5" }): string;
};
```

- `CloudinaryProvider` — produccion. Arma las URLs de entrega como strings; son patrones predecibles
  y documentados, no hace falta una libreria de componentes para eso.
- `DirectUrlProvider` — dev, tests y seed. El `playbackId` es una ruta o URL directa. Es lo que
  permite que la suite corra sin salir a la red.

## Poster

- El poster **lo genera el proveedor a partir del video** (mismo public id, extension `.jpg`), salvo
  que la fila traiga un `thumbnail_url` guardado: **ese gana**. La regla al reves hacia que los platos
  del seed pidieran un poster a Cloudinary que no existe, y la demo mostraba una imagen rota.
  La decision vive en `elegirPosterUrl`, con tests.
- El poster carga primero, siempre. La grilla nunca muestra un cuadro negro esperando video.

## Video en la grilla

**La grilla SI reproduce video.** Esto reemplaza la regla anterior, que prohibia todo `<video>` en una
tarjeta. Se cambio a pedido del dueno del producto, con los ojos abiertos: el riesgo que la regla
vieja evitaba —doce manifiestos en paralelo sobre datos moviles, y que no se vea ninguno— es real.

Por eso reproducir en la grilla solo es aceptable con estos cuatro frenos, y **ninguno es opcional**:

1. **Solo lo que esta en pantalla.** `IntersectionObserver` con `rootMargin` chico. El video se pide
   al entrar y se **libera** al salir: `pause()` no alcanza, hay que soltar el `src` y destruir el
   `Hls`, o los segmentos siguen bajando.
2. **Tope de concurrencia.** Un registro a nivel de modulo limita cuantos reproducen a la vez
   (`MAX_A_LA_VEZ`). Subir ese numero es volver al problema.
3. **El poster manda.** Visible desde el primer instante, y se retira recien en `onPlaying`, cuando
   hay cuadros de verdad. Nunca un rectangulo negro.
4. **Se respeta al usuario.** Con `prefers-reduced-motion: reduce`, con `saveData`, o con una conexion
   `2g`, no se reproduce nada: queda el poster.

En la grilla, un video que falla **no muestra cartel de error**: se queda el poster. Doce mensajes de
error serian peor que el silencio. El camino de error con texto y reintento es el de la vista de plato.

## Reproduccion

- HLS con `hls.js` dentro de nuestro propio componente. Se usa HLS nativo **solo si
  `video.canPlayType("application/vnd.apple.mpegurl") === "probably"`**. No alcanza con que
  devuelva algo: Chrome contesta `"maybe"` y despues no puede reproducirlo. Con el chequeo por
  cadena no vacia, el video no se veia en Chrome ni en Android — solo en Safari.
- Vertical 9:16, `loop`, arranca **muteado** con un control de sonido visible. Un video que arranca
  con audio en una mesa de restaurante es una razon para cerrar la carta.
- `preload="none"` hasta que el medio entra en pantalla. Nunca 40 manifiestos en paralelo.
- **Camino de error obligatorio:** si el manifiesto no carga, el poster se queda visible y aparece un
  boton de reintento. Nunca un cuadro negro, nunca un spinner infinito.
- `hls.js` solo puede importarse dentro de un componente `"use client"`, y con import dinamico para
  que no entre al bundle inicial de la carta.

## Subida

- El navegador sube **directo al proveedor**. El archivo nunca pasa por una funcion de Vercel: el
  limite de 4.5 MB de body la haria fallar con videos reales.
- La firma se calcula en el servidor con el SDK (`cloudinary.utils.api_sign_request`), en
  `src/app/api/video/signature/route.ts`, y solo para usuarios autenticados del restaurante dueno.
- `CLOUDINARY_API_SECRET` nunca sale del servidor.
