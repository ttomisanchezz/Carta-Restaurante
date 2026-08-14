/**
 * Los momentos de un video y el agrupador que evita un request por cada uno.
 *
 * No importa React, ni `next/*`, ni el cliente de Supabase: recibe la funcion que envia
 * por parametro. Es lo que deja probar el agrupado con relojes falsos y sin red, y lo que
 * mantiene la decision de "cuando se manda" separada de "por donde se manda".
 */

export const MOMENTOS = ["iniciado", "25", "50", "75", "completo"] as const;

export type Momento = (typeof MOMENTOS)[number];

/**
 * El umbral de cada momento, como fraccion de la duracion.
 *
 * `completo` es 0.95 y no 1: `timeupdate` se dispara cada 250ms mas o menos, asi que el
 * ultimo que llega antes del final puede quedar en 0.97 y nunca hay un evento exacto en
 * 1.0. Con el umbral en 1 la metrica que mas le importa al dueño —cuantos llegan al
 * final— marcaria casi siempre cero. Ademas el video va en `loop`: `ended` tampoco se
 * dispara, asi que no hay una señal mejor que esta.
 */
const UMBRALES: ReadonlyArray<{ momento: Momento; fraccion: number }> = [
  { momento: "iniciado", fraccion: 0 },
  { momento: "25", fraccion: 0.25 },
  { momento: "50", fraccion: 0.5 },
  { momento: "75", fraccion: 0.75 },
  { momento: "completo", fraccion: 0.95 },
];

/**
 * Todos los momentos alcanzados a esta altura del video, no solo el ultimo.
 *
 * Es acumulativo a proposito. Un `timeupdate` puede saltearse mientras la pestaña esta en
 * segundo plano, y el comensal puede arrastrar la barra: devolviendo solo el escalon
 * recien cruzado, un salto de 0.1 a 0.8 perderia el 25 y el 50 para siempre. Como el
 * llamador ya descarta lo que envio antes, repetir acá no cuesta nada.
 */
export function momentosAlcanzados(fraccion: number): Momento[] {
  if (!Number.isFinite(fraccion) || fraccion < 0) return [];
  return UMBRALES.filter((u) => fraccion >= u.fraccion).map((u) => u.momento);
}

/**
 * El token de la visita: 16 bytes de CSPRNG en hex, el formato que exige el `check` de la
 * columna y la validacion de la RPC.
 *
 * **No identifica a una persona.** No va a una cookie, no sobrevive al cierre de la
 * pestaña y no se cruza con nada. Sirve para contar visitas en vez de eventos, y para que
 * el indice unico de la tabla haga que reenviar el mismo lote no mueva ningun contador.
 */
export function generarTokenDeSesion(
  aleatorio: (bytes: Uint8Array) => void = (bytes) => crypto.getRandomValues(bytes),
): string {
  const bytes = new Uint8Array(16);
  aleatorio(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const CLAVE_SESION = "carta:sesion-de-vistas";

/**
 * Una sola sesion por pestaña, en `sessionStorage` y no en `localStorage`.
 *
 * `sessionStorage` muere al cerrar la pestaña, que es exactamente lo que dura una visita a
 * una carta. En `localStorage` el mismo token viviria meses y dos comidas distintas del
 * mismo cliente contarian como una sola visita.
 *
 * Si el navegador bloquea el almacenamiento (modo privado de algunos, iframes con
 * cookies de terceros apagadas) devuelve un token igual, sin persistirlo: se pierde la
 * deduplicacion entre recargas, pero la metrica sigue saliendo.
 */
export function obtenerTokenDeSesion(): string {
  try {
    const guardado = window.sessionStorage.getItem(CLAVE_SESION);
    if (guardado && /^[0-9a-f]{32}$/.test(guardado)) return guardado;

    const nuevo = generarTokenDeSesion();
    window.sessionStorage.setItem(CLAVE_SESION, nuevo);
    return nuevo;
  } catch {
    return generarTokenDeSesion();
  }
}

export type LoteDeVistas = { dishId: string; momentos: Momento[] };

type Opciones = {
  /** Que hacer con un lote listo. Se inyecta para poder probar sin red. */
  enviar: (lote: LoteDeVistas) => void;
  /** Cada cuanto se vacia lo acumulado. */
  intervaloMs?: number;
};

/**
 * Acumula momentos por plato y los suelta de a lotes.
 *
 * Sin esto, un plato mirado entero son cinco requests, y una carta que se hojea son
 * decenas: sobre la red de un restaurante eso le compite el ancho de banda al video, que
 * es el producto. Con esto, un plato entero es un request.
 */
export function crearRegistradorDeVistas({ enviar, intervaloMs = 5000 }: Opciones) {
  /** Lo alcanzado y todavia no enviado. */
  const pendientes = new Map<string, Set<Momento>>();
  /** Lo ya enviado, para no volver a mandarlo nunca. */
  const enviados = new Map<string, Set<Momento>>();
  let temporizador: ReturnType<typeof setInterval> | null = null;

  const vaciar = () => {
    for (const [dishId, momentos] of pendientes) {
      if (momentos.size === 0) continue;

      enviar({ dishId, momentos: [...momentos] });

      const yaEstaban = enviados.get(dishId) ?? new Set<Momento>();
      for (const momento of momentos) yaEstaban.add(momento);
      enviados.set(dishId, yaEstaban);
    }
    pendientes.clear();
  };

  return {
    /** Registra la altura actual del video de un plato. Idempotente. */
    registrar(dishId: string, fraccion: number) {
      const nuevos = momentosAlcanzados(fraccion).filter(
        (momento) => !enviados.get(dishId)?.has(momento),
      );
      if (nuevos.length === 0) return;

      const acumulados = pendientes.get(dishId) ?? new Set<Momento>();
      for (const momento of nuevos) acumulados.add(momento);
      pendientes.set(dishId, acumulados);

      // El temporizador arranca con el primer dato y no antes: una carta que se mira sin
      // abrir ningun plato no tiene por que despertar nada cada cinco segundos.
      if (temporizador === null) temporizador = setInterval(vaciar, intervaloMs);
    },

    /**
     * Vacia ya. Es lo que hay que llamar en `pagehide`: el comensal que cierra la pestaña
     * justo despues de terminar un video es el caso mas interesante de todos, y esperar al
     * proximo intervalo seria perderlo siempre.
     */
    vaciar,

    detener() {
      if (temporizador !== null) clearInterval(temporizador);
      temporizador = null;
    },
  };
}
