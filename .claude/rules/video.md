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

- El poster **lo genera el proveedor a partir del video** (mismo public id, extension `.jpg`). No hay
  subida de foto por plato. Si aparece un campo "subi una foto", esta de mas.
- El poster carga primero, siempre. La grilla nunca muestra un cuadro negro esperando video.

## Reproduccion

- HLS con `hls.js` dentro de nuestro propio componente. Si el navegador soporta HLS nativo
  (`video.canPlayType("application/vnd.apple.mpegurl")`), se usa eso y no se carga `hls.js`.
- Vertical 9:16, `loop`, arranca **muteado** con un control de sonido visible. Un video que arranca
  con audio en una mesa de restaurante es una razon para cerrar la carta.
- `preload="none"` hasta que el plato se abre. Nunca 40 manifiestos en paralelo.
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
