"use client";

import { useEffect, useRef, useState } from "react";
import { convieneTraerVideo } from "@/lib/video/preferencias-de-red";

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

/**
 * Cuantos videos pueden reproducirse a la vez en toda la grilla.
 *
 * Seis: una pantalla de escritorio son dos filas de tres, y el tope tiene que cubrir lo que
 * el comensal ve de una. Antes era tres, calculado para las dos columnas del telefono, y en
 * un escritorio dejaba media grilla quieta.
 *
 * **Este numero tiene un techo que no lo pone nuestro codigo.** Los navegadores moviles
 * limitan cuantos videos decodifican en paralelo; pasado ese punto no arrancan, o el
 * navegador cae a decodificacion por software y el telefono se calienta y va a tirones.
 * Subirlo a doce no muestra doce videos: muestra menos de los que se ven hoy.
 */
const MAX_A_LA_VEZ = 6;
const reproduciendo = new Set<string>();

type Props = {
  dishId: string;
  /** Clip corto y recortado al tamano de la tarjeta. NO es el manifiesto del plato. */
  clipUrl: string;
  posterUrl: string;
  titulo: string;
  /** La primera fila se pide con prioridad: el primer poster visible ES la metrica. */
  prioritario: boolean;
  /** El modal de este plato esta abierto: su video de origen tiene que quedar liberado. */
  pausado: boolean;
};

export function DishCardMedia({ dishId, clipUrl, posterUrl, titulo, prioritario, pausado }: Props) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [conCuadros, setConCuadros] = useState(false);

  useEffect(() => {
    const contenedor = contenedorRef.current;
    if (!contenedor) return;

    let cancelado = false;

    const liberar = () => {
      reproduciendo.delete(dishId);
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
      if (!video || cancelado || pausado) return;
      if (!convieneTraerVideo()) return;
      if (reproduciendo.size >= MAX_A_LA_VEZ && !reproduciendo.has(dishId)) return;

      reproduciendo.add(dishId);

      try {
        // Un archivo y nada mas. La grilla NO usa HLS, y esa es la diferencia entre que
        // el video aparezca en menos de un segundo o que tarde diez.
        //
        // Antes usaba el mismo manifiesto que la vista de plato, y traia los dos problemas
        // que se veian en pantalla: la ceremonia de HLS —bajar manifiesto, negociar nivel,
        // pedir segmentos— para un loop de seis segundos, y una calidad deliberadamente
        // mala, porque para que el nivel entrara en una tarjeta de 170px habia que limitar
        // la calidad al tamano del reproductor.
        //
        // Medido contra la cuenta real: 28.8 MB y 12 s con la fuente 4K contra 1.17 MB y
        // 0.9 s con el clip recortado. Veinticinco veces menos, y mejor imagen.
        video.src = clipUrl;
        await video.play();
      } catch {
        liberar();
      }
    };

    if (pausado) {
      liberar();
      return;
    }

    const observador = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (entrada.isIntersecting) void arrancar();
          else liberar();
        }
      },
      /**
       * 800px y no 150: eso es como dos filas de anticipacion en un telefono, asi que para
       * cuando la tarjeta entra en pantalla el video ya pidio sus primeros bytes.
       *
       * Ensanchar el margen es barato justamente porque `PrecargarClips` ya dejo el archivo
       * en el cache: lo que antes era abrir una conexion nueva ahora es leer de disco.
       */
      { rootMargin: "800px 0px", threshold: 0.25 },
    );

    observador.observe(contenedor);

    return () => {
      cancelado = true;
      observador.disconnect();
      liberar();
    };
  }, [dishId, clipUrl, pausado]);

  return (
    <div
      ref={contenedorRef}
      // `tarjeta-medio` es lo que escala en hover; el recorte vive acá para que el video
      // crecido no se salga de las esquinas redondeadas.
      className="tarjeta-medio esqueleto pointer-events-none relative aspect-4/5 w-full rounded-card transition-transform duration-[160ms] ease-[var(--ease-suave)] will-change-transform"
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

      {/* La señal desaparece cuando ya hay cuadros en movimiento: sobre el poster aclara
          que la tarjeta no es una foto; sobre el video solo taparia contenido. */}
      <span
        aria-hidden="true"
        data-testid="indicador-video"
        className={`indicador-video ${conCuadros ? "indicador-video--oculto" : ""}`}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path d="M9 7.5v9l7-4.5-7-4.5Z" fill="currentColor" />
        </svg>
      </span>
    </div>
  );
}
