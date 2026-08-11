"use client";

import { useEffect } from "react";
import { convieneTraerVideo } from "@/lib/video/preferencias-de-red";

/**
 * Baja los clips de la grilla al cache del navegador, en segundo plano.
 *
 * ## Que resuelve
 *
 * Sin esto, cada tarjeta pedia su video recien cuando el observador la tocaba: scrolleabas
 * y veias medio segundo de poster antes de que arrancara. Con la carta entera cacheada, el
 * `<video>` encuentra el archivo hecho y arranca en el cuadro siguiente.
 *
 * ## Las tres reglas que lo hacen seguro
 *
 * 1. **Empieza DESPUES de `load`.** El presupuesto del producto es el primer poster visible
 *    —cuatro segundos a 400 kbps— y 4 MB de video en paralelo se lo comen entero. Primero
 *    pinta la carta, despues se calienta el cache.
 * 2. **Uno por vez, en el orden de la grilla.** Ocho pedidos en paralelo son la misma
 *    tormenta de ancho de banda que este componente existe para evitar, solo que mas tarde.
 *    Secuencial y en orden significa que los primeros que vas a ver son los primeros listos.
 * 3. **Respeta al usuario.** Con movimiento reducido, ahorro de datos o 2G no baja NADA.
 *    Ver `convieneTraerVideo()`.
 *
 * Se desmonta limpio: el `AbortController` corta la descarga en curso si el comensal se va
 * a la vista de un plato en el medio.
 */

type Props = {
  /**
   * Los clips a calentar, **sin repetir y en el orden de la grilla**. Los arma `DishGrid`:
   * en la demo hay 12 platos y 8 videos, porque cuatro repiten.
   */
  urls: string[];
};

/** Margen despues de `load` antes de empezar, si el navegador no tiene `requestIdleCallback`. */
const ESPERA_SIN_IDLE_MS = 1500;

export function PrecargarClips({ urls }: Props) {
  useEffect(() => {
    if (urls.length === 0) return;
    if (!convieneTraerVideo()) return;

    const controlador = new AbortController();
    let cancelado = false;

    const calentar = async () => {
      for (const url of urls) {
        if (cancelado) return;
        try {
          const respuesta = await fetch(url, {
            signal: controlador.signal,
            // `priority` todavia no esta en los tipos de RequestInit. Donde no se soporta
            // se ignora, y donde si, deja que cualquier pedido de la interfaz le pase por
            // encima a la precarga.
            ...({ priority: "low" } as RequestInit),
          });
          // Hay que CONSUMIR el cuerpo. `fetch` resuelve apenas llegan los headers; si el
          // cuerpo no se lee, el navegador puede cortar la descarga y no queda nada en el
          // cache — o sea, toda la precarga no habria servido para nada.
          await respuesta.arrayBuffer();
        } catch {
          // Un clip que no baja no es un error de la pantalla: la tarjeta se queda con su
          // poster, que es exactamente el comportamiento correcto. Y si fallo porque nos
          // desmontaron, seguir con el resto seria gastar datos de una pantalla que ya no
          // se ve.
          return;
        }
      }
    };

    const arrancar = () => {
      if (cancelado) return;
      const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number })
        .requestIdleCallback;
      if (idle) idle(() => void calentar());
      else window.setTimeout(() => void calentar(), ESPERA_SIN_IDLE_MS);
    };

    if (document.readyState === "complete") {
      arrancar();
    } else {
      window.addEventListener("load", arrancar, { once: true });
    }

    return () => {
      cancelado = true;
      controlador.abort();
      window.removeEventListener("load", arrancar);
    };
  }, [urls]);

  return null;
}
