"use client";

import { useEffect, useRef, useState } from "react";

/**
 * El medio de una tarjeta de la grilla: poster siempre, y video cuando entra en pantalla.
 *
 * ## Por que esto no es "doce videos autoplay"
 *
 * La regla vieja del proyecto era que la grilla no reproducia nada. Se cambio a pedido, y
 * el riesgo que esa regla evitaba es real: doce manifiestos en paralelo sobre datos
 * moviles hace que no se vea ninguno. Asi que reproducir en la grilla solo es defendible
 * con estos cuatro frenos, y ninguno es opcional:
 *
 * 1. **Solo lo que esta en pantalla.** `IntersectionObserver`: el video se pide cuando la
 *    tarjeta entra, y se libera cuando sale. Nunca hay doce, hay dos o tres.
 * 2. **Tope de concurrencia.** Un registro a nivel de modulo permite `MAX_A_LA_VEZ`
 *    reproducciones simultaneas. El resto espera su turno con el poster puesto.
 * 3. **El poster manda.** Se ve desde el primer instante y no se va hasta que el video
 *    tiene cuadros de verdad. Nunca un rectangulo negro.
 * 4. **Respeta al usuario y a su plan de datos.** Con `prefers-reduced-motion` o con
 *    ahorro de datos activado, no reproduce nada: queda el poster.
 */

const MIME_HLS = "application/vnd.apple.mpegurl";

/**
 * Cuantos videos pueden reproducirse a la vez en toda la grilla.
 *
 * Tres es lo que entra en una pantalla de telefono mas uno de margen. Subirlo es la forma
 * de volver al problema que este limite existe para evitar.
 */
const MAX_A_LA_VEZ = 3;
const reproduciendo = new Set<string>();

/** Un solo lugar donde se decide si corresponde reproducir algo. */
function deberiaReproducir(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;

  // `saveData` lo prende el usuario en el navegador cuando esta cuidando los datos. Gastarle
  // el plan en videos decorativos despues de que pidio lo contrario no se hace.
  const conexion = (
    navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
  ).connection;
  if (conexion?.saveData) return false;
  if (conexion?.effectiveType && /^(slow-)?2g$/.test(conexion.effectiveType)) return false;

  return true;
}

type Props = {
  dishId: string;
  playbackUrl: string;
  posterUrl: string;
  titulo: string;
  /** La primera fila se pide con prioridad: el primer poster visible ES la metrica. */
  prioritario: boolean;
};

export function DishCardMedia({ dishId, playbackUrl, posterUrl, titulo, prioritario }: Props) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<{ destroy: () => void } | null>(null);
  const [conCuadros, setConCuadros] = useState(false);

  useEffect(() => {
    const contenedor = contenedorRef.current;
    if (!contenedor) return;

    let cancelado = false;

    const liberar = () => {
      reproduciendo.delete(dishId);
      hlsRef.current?.destroy();
      hlsRef.current = null;
      const video = videoRef.current;
      if (video) {
        video.pause();
        // Cortar la descarga de verdad: pausar deja los segmentos bajando.
        video.removeAttribute("src");
        video.load();
      }
      setConCuadros(false);
    };

    const arrancar = async () => {
      const video = videoRef.current;
      if (!video || cancelado) return;
      if (!deberiaReproducir()) return;
      if (reproduciendo.size >= MAX_A_LA_VEZ && !reproduciendo.has(dishId)) return;

      reproduciendo.add(dishId);

      try {
        const esManifiesto = playbackUrl.endsWith(".m3u8");
        // `=== "probably"`: Chrome contesta "maybe" a HLS y despues no puede reproducirlo.
        const nativo = video.canPlayType(MIME_HLS) === "probably";

        if (!esManifiesto || nativo) {
          video.src = playbackUrl;
        } else {
          const { default: Hls } = await import("hls.js");
          if (cancelado) return;
          if (!Hls.isSupported()) {
            liberar();
            return;
          }
          const hls = new Hls({
            enableWorker: true,
            // La grilla no necesita la mejor calidad: son tarjetas de media pantalla y
            // hay varias a la vez. Arrancar por el nivel mas bajo hace que se vea antes.
            startLevel: 0,
            capLevelToPlayerSize: true,
          });
          hlsRef.current = hls;
          hls.on(Hls.Events.ERROR, (_e, datos) => {
            // Si falla, el poster se queda y no hay cartel: en una grilla, doce mensajes
            // de error serian peor que el silencio. El detalle esta en la vista del plato.
            if (datos.fatal) liberar();
          });
          hls.loadSource(playbackUrl);
          hls.attachMedia(video);
        }

        await video.play();
      } catch {
        liberar();
      }
    };

    const observador = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (entrada.isIntersecting) void arrancar();
          else liberar();
        }
      },
      // Un poco antes de entrar, para que el video no arranque justo cuando ya se ve.
      { rootMargin: "150px 0px", threshold: 0.25 },
    );

    observador.observe(contenedor);

    return () => {
      cancelado = true;
      observador.disconnect();
      liberar();
    };
  }, [dishId, playbackUrl]);

  return (
    <div
      ref={contenedorRef}
      // `tarjeta-medio` es lo que escala en hover; el recorte vive acá para que el video
      // crecido no se salga de las esquinas redondeadas.
      className="tarjeta-medio relative aspect-4/5 w-full overflow-hidden rounded-card bg-surface transition-transform duration-[160ms] ease-[var(--ease-suave)] will-change-transform"
    >
      {/* biome-ignore lint/performance/noImgElement: decision del proyecto — next/image bloquea SVG (el formato de los posters del seed), cobra por transformacion en Vercel y Cloudinary ya optimiza. Ver CLAUDE.md. */}
      <img
        src={posterUrl}
        alt={titulo}
        width={480}
        height={600}
        decoding="async"
        loading={prioritario ? "eager" : "lazy"}
        fetchPriority={prioritario ? "high" : "auto"}
        data-testid="poster-tarjeta"
        // No se desmonta cuando el video arranca: se le baja la opacidad. Desmontarlo
        // dejaria un hueco negro en el instante entre el play y el primer cuadro pintado.
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-[220ms] ease-[var(--ease-salida)] ${
          conCuadros ? "opacity-0" : "opacity-100"
        }`}
      />

      <video
        ref={videoRef}
        aria-hidden="true"
        // Decorativo: el nombre del plato ya esta en el texto de la tarjeta, asi que para
        // un lector de pantalla este video es ruido.
        tabIndex={-1}
        muted
        loop
        playsInline
        preload="none"
        // El poster se retira recien cuando hay cuadros de verdad para mostrar.
        onPlaying={() => setConCuadros(true)}
        data-testid="video-tarjeta"
        className="absolute inset-0 h-full w-full object-cover"
      >
        <track kind="captions" />
      </video>
    </div>
  );
}
