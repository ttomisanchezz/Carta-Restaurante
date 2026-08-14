"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { enviarLoteDeVistas } from "@/lib/metrics/enviar-vistas";
import { crearRegistradorDeVistas, obtenerTokenDeSesion } from "@/lib/metrics/vistas-de-plato";
import { convieneTraerVideo } from "@/lib/video/preferencias-de-red";

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
 * - **Movimiento reducido, ahorro de datos y 2G desactivan el autoplay** y dejan un boton
 *   de play sobre el poster. La decision se comparte con la grilla en
 *   `preferencias-de-red.ts` para que ambos caminos respeten exactamente lo mismo.
 */

type Props = {
  playbackUrl: string;
  posterUrl: string;
  /** Nombre del plato: va al `alt` del poster y al `aria-label` del video. */
  titulo: string;
  /**
   * Con esto puesto, el reproductor reporta cuanto se miro del video.
   *
   * Es opcional para que el componente siga sirviendo en cualquier contexto sin metrica
   * —una vista previa del panel, por ejemplo— sin tener que inventar un id falso.
   */
  dishId?: string;
};

type Estado = "inicial" | "cargando" | "reproduciendo" | "error";

const MIME_HLS = "application/vnd.apple.mpegurl";
/**
 * Un recurso que no emite `error` tampoco puede dejar el poster esperando para siempre.
 *
 * Mide **estancamiento**, no tiempo total de carga: el reloj se reinicia con cada senal de
 * avance del elemento.
 */
const ESPERA_MAX_SIN_AVANCE_MS = 6000;

/** Lo que cuenta como "sigue avanzando" y por lo tanto reinicia la espera. */
const SENALES_DE_AVANCE = [
  "progress",
  "loadedmetadata",
  "loadeddata",
  "canplay",
  "playing",
] as const;

export function VideoPlayer({ playbackUrl, posterUrl, titulo, dishId }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Se guarda para poder destruirlo: un Hls vivo sigue pidiendo segmentos aunque el
  // componente ya no este en pantalla.
  const hlsRef = useRef<{ destroy: () => void } | null>(null);

  const [estado, setEstado] = useState<Estado>("inicial");
  const [conSonido, setConSonido] = useState(false);
  const [intento, setIntento] = useState(0);
  // `null` mientras no se sabe: en el servidor no hay matchMedia, y arrancar asumiendo
  // que no hay preferencia haria reproducir un instante antes de corregirse.
  const [autoplayPermitido, setAutoplayPermitido] = useState<boolean | null>(null);

  useEffect(() => {
    setAutoplayPermitido(convieneTraerVideo());
  }, []);

  const arrancar = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    // Reintentar sin esto dejaba la instancia anterior viva: `hlsRef.current` se pisaba con
    // la nueva, la vieja seguia adjunta al mismo elemento bajando segmentos, y el cleanup
    // de desmontaje solo alcanzaba a la ultima. Dos reintentos, tres descargas en paralelo.
    hlsRef.current?.destroy();
    hlsRef.current = null;

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
    if (autoplayPermitido === null) return;
    // Movimiento reducido, ahorro de datos y 2G esperan una decision explicita.
    if (!autoplayPermitido && intento === 0) return;

    void arrancar();
  }, [autoplayPermitido, arrancar, intento]);

  /**
   * A reloj de pared esto marcaba error a los seis segundos de entrar en "cargando", y ese
   * punto de partida esta antes del `import("hls.js")` —medio megabyte— y antes del primer
   * segmento. A 400 kbps, que es el presupuesto declarado del producto, el cartel salia con
   * el video bajando bien y despues se retiraba solo al resolver `play()`: exactamente el
   * parpadeo que el manejo de errores no fatales de hls.js evita nueve lineas mas arriba.
   *
   * Contar estancamiento en vez de total conserva la regla que importa —nunca un spinner
   * infinito— sin acusar de rota una conexion que simplemente es lenta.
   */
  useEffect(() => {
    if (estado !== "cargando") return;
    const video = videoRef.current;
    if (!video) return;

    let temporizador = 0;
    const reiniciar = () => {
      window.clearTimeout(temporizador);
      temporizador = window.setTimeout(() => setEstado("error"), ESPERA_MAX_SIN_AVANCE_MS);
    };

    reiniciar();
    for (const senal of SENALES_DE_AVANCE) video.addEventListener(senal, reiniciar);

    return () => {
      window.clearTimeout(temporizador);
      for (const senal of SENALES_DE_AVANCE) video.removeEventListener(senal, reiniciar);
    };
  }, [estado]);

  /**
   * Cuanto se miro de este video.
   *
   * Va contra `timeupdate` y no contra `ended`: el video esta en `loop`, asi que `ended` no
   * se dispara nunca. El agrupador se queda con lo nuevo y suelta un lote cada cinco
   * segundos.
   *
   * `pagehide` y no `beforeunload`: en iOS `beforeunload` no llega, y una pestaña que se
   * cierra apenas termina el video es justo el caso que mas dice sobre el plato.
   */
  useEffect(() => {
    if (!dishId) return;
    const video = videoRef.current;
    if (!video) return;

    const sesion = obtenerTokenDeSesion();
    const registrador = crearRegistradorDeVistas({
      enviar: (lote) => void enviarLoteDeVistas(lote, sesion),
    });

    const alAvanzar = () => {
      // Sin duracion conocida no hay fraccion posible: pasa entre `play()` y los metadatos.
      if (!Number.isFinite(video.duration) || video.duration <= 0) return;
      registrador.registrar(dishId, video.currentTime / video.duration);
    };

    const alIrse = () => registrador.vaciar();

    video.addEventListener("timeupdate", alAvanzar);
    window.addEventListener("pagehide", alIrse);

    return () => {
      video.removeEventListener("timeupdate", alAvanzar);
      window.removeEventListener("pagehide", alIrse);
      // Cerrar el modal tambien es irse: lo pendiente se manda antes de soltar el temporizador.
      registrador.vaciar();
      registrador.detener();
    };
  }, [dishId]);

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
    <div className="esqueleto relative mt-4 aspect-4/5 w-full rounded-card">
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
            className="boton-marca boton--chico self-start"
          >
            Reintentar
          </button>
        </div>
      ) : null}

      {autoplayPermitido === false && estado === "inicial" ? (
        <button
          type="button"
          onClick={() => setIntento((n) => n + 1)}
          data-testid="reproducir-video"
          aria-label="Reproducir video"
          className="absolute inset-0 flex items-center justify-center"
        >
          <span className="boton-marca rounded-chip">Reproducir</span>
        </button>
      ) : null}

      <button
        type="button"
        onClick={alternarSonido}
        data-testid="alternar-sonido"
        aria-pressed={conSonido}
        // El fondo translucido no es estetico: este control va encima del video y sin el
        // desaparece contra un cuadro claro.
        className="boton-linea boton--chico absolute right-4 top-4 min-w-[44px] rounded-chip bg-bg/80 backdrop-blur-sm"
      >
        {conSonido ? "Silenciar" : "Activar sonido"}
      </button>
    </div>
  );
}
