"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Reproductor del plato.
 *
 * ## Las reglas que no se negocian, y por que
 *
 * - **Arranca muteado, con un control de sonido visible.** Un video que suena solo en una
 *   mesa de restaurante es una razon para cerrar la carta.
 * - **El poster manda.** Se ve desde el primer instante y se queda ahi hasta que hay video
 *   de verdad reproduciendose. Si el manifiesto falla, el poster no se va: aparece el
 *   mensaje y un boton de reintento. Nunca un cuadro negro, nunca un spinner infinito.
 * - **`hls.js` entra por import dinamico**, y solo si hace falta. Safari y iOS reproducen
 *   HLS nativo: ahi cargar la libreria seria medio megabyte de JavaScript para nada.
 * - **`preload="none"`.** El video se pide cuando el comensal abre el plato, no antes.
 * - **`prefers-reduced-motion: reduce` desactiva el autoplay** y deja un boton de play
 *   sobre el poster. No es un detalle de accesibilidad opcional: hay gente a la que el
 *   movimiento automatico le produce nauseas.
 */

type Props = {
  playbackUrl: string;
  posterUrl: string;
  /** Nombre del plato: va al `alt` del poster y al `aria-label` del video. */
  titulo: string;
};

type Estado = "inicial" | "cargando" | "reproduciendo" | "error";

const MIME_HLS = "application/vnd.apple.mpegurl";

export function VideoPlayer({ playbackUrl, posterUrl, titulo }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Se guarda para poder destruirlo: un Hls vivo sigue pidiendo segmentos aunque el
  // componente ya no este en pantalla.
  const hlsRef = useRef<{ destroy: () => void } | null>(null);

  const [estado, setEstado] = useState<Estado>("inicial");
  const [conSonido, setConSonido] = useState(false);
  const [intento, setIntento] = useState(0);
  // `null` mientras no se sabe: en el servidor no hay matchMedia, y arrancar asumiendo
  // que no hay preferencia haria reproducir un instante antes de corregirse.
  const [movimientoReducido, setMovimientoReducido] = useState<boolean | null>(null);

  useEffect(() => {
    setMovimientoReducido(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  const arrancar = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    setEstado("cargando");

    try {
      /**
       * `=== "probably"`, y NO `!== ""`. La diferencia es la que hacia que el video no se
       * viera nunca en Chrome.
       *
       * Chrome contesta `"maybe"` a `canPlayType("application/vnd.apple.mpegurl")` y
       * despues **no puede reproducirlo**. Con un chequeo por cadena no vacia, `"maybe"`
       * pasaba, se le enchufaba el manifiesto directo al elemento, nunca se cargaba
       * hls.js y el reproductor caia siempre en el cartel de error. Safari, que si lo
       * soporta de verdad, contesta `"probably"`.
       */
      const soportaNativo = video.canPlayType(MIME_HLS) === "probably";
      const esManifiesto = playbackUrl.endsWith(".m3u8");

      if (!esManifiesto || soportaNativo) {
        // Archivo suelto (el proveedor directo) o HLS nativo de verdad: el elemento solo.
        video.src = playbackUrl;
      } else {
        const { default: Hls } = await import("hls.js");

        if (!Hls.isSupported()) {
          // Sin MSE y sin HLS nativo no queda nada por intentar, pero el manifiesto
          // directo es mejor que rendirse: algun navegador viejo puede sorprender.
          video.src = playbackUrl;
          await video.play();
          setEstado("reproduciendo");
          return;
        }

        const hls = new Hls({ enableWorker: true });
        hlsRef.current = hls;
        hls.on(Hls.Events.ERROR, (_evento, datos) => {
          // Los no fatales hls.js los recupera solo; entrar en estado de error por uno de
          // esos haria parpadear el cartel en cualquier red mala.
          if (datos.fatal) setEstado("error");
        });
        hls.loadSource(playbackUrl);
        hls.attachMedia(video);
      }

      await video.play();
      setEstado("reproduciendo");
    } catch {
      // Incluye el rechazo de autoplay del navegador y el 404 del manifiesto.
      setEstado("error");
    }
  }, [playbackUrl]);

  useEffect(() => {
    if (movimientoReducido === null) return;
    // Con movimiento reducido no se arranca solo: espera el boton de play.
    if (movimientoReducido && intento === 0) return;

    void arrancar();
  }, [movimientoReducido, arrancar, intento]);

  useEffect(() => {
    return () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, []);

  const alternarSonido = () => {
    const video = videoRef.current;
    if (!video) return;
    const siguiente = !conSonido;
    video.muted = !siguiente;
    setConSonido(siguiente);
  };

  const posterVisible = estado !== "reproduciendo";

  return (
    <div className="relative mt-4 aspect-4/5 w-full overflow-hidden rounded-card bg-surface">
      {/* biome-ignore lint/performance/noImgElement: decision del proyecto — next/image bloquea SVG (el formato de los posters del seed), cobra por transformacion en Vercel y Cloudinary ya optimiza. Ver CLAUDE.md y .claude/rules/estilos-y-tokens.md. */}
      <img
        src={posterUrl}
        alt={titulo}
        width={480}
        height={600}
        decoding="async"
        loading="eager"
        fetchPriority="high"
        data-testid="poster-plato"
        // No se desmonta al reproducir: se tapa. Desmontarlo dejaria un hueco negro en el
        // instante entre que el video arranca y pinta su primer cuadro.
        className={`absolute inset-0 h-full w-full object-cover transition-opacity ${
          posterVisible ? "opacity-100" : "opacity-0"
        }`}
      />

      <video
        ref={videoRef}
        aria-label={titulo}
        muted
        loop
        playsInline
        preload="none"
        // El `catch` de `arrancar` no siempre alcanza: si el recurso muere despues de que
        // `play()` resolvio, el fallo llega por este evento y por ningun otro lado.
        onError={() => setEstado("error")}
        data-testid="video-plato"
        className="absolute inset-0 h-full w-full object-cover"
      >
        <track kind="captions" />
      </video>

      {estado === "error" ? (
        <div
          data-testid="error-video"
          className="absolute inset-x-0 bottom-0 flex flex-col gap-2 bg-bg/80 p-4"
        >
          <p className="text-small">No pudimos cargar el video</p>
          <button
            type="button"
            onClick={() => setIntento((n) => n + 1)}
            data-testid="reintentar-video"
            className="min-h-[44px] self-start rounded-control bg-brand px-4 text-small font-semibold text-on-brand"
          >
            Reintentar
          </button>
        </div>
      ) : null}

      {movimientoReducido && estado === "inicial" ? (
        <button
          type="button"
          onClick={() => setIntento((n) => n + 1)}
          data-testid="reproducir-video"
          aria-label="Reproducir video"
          className="absolute inset-0 flex items-center justify-center"
        >
          <span className="min-h-[44px] rounded-chip bg-brand px-6 py-3 text-small font-semibold text-on-brand">
            Reproducir
          </span>
        </button>
      ) : null}

      <button
        type="button"
        onClick={alternarSonido}
        data-testid="alternar-sonido"
        aria-pressed={conSonido}
        className="absolute right-4 top-4 min-h-[44px] min-w-[44px] rounded-chip border border-border-strong bg-bg/80 px-4 text-small font-semibold"
      >
        {conSonido ? "Silenciar" : "Activar sonido"}
      </button>
    </div>
  );
}
