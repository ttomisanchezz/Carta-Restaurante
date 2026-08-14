/**
 * Cuando NO corresponde gastar datos del comensal en video.
 *
 * Vive acá y no dentro de un componente porque ahora lo consultan tres: el medio de cada
 * tarjeta, la precarga de fondo y el reproductor expandido, para decidir si arrancan solos.
 * Tenerlo duplicado significaba que el dia que alguien agregara una condicion, uno de los
 * dos caminos la iba a ignorar — y el que la ignore es justo el que gasta los datos.
 *
 * Es una funcion pura de APIs del navegador: no importa React ni `next/*`, asi que respeta
 * la frontera de `src/lib/video/**`. Solo puede llamarse desde el cliente.
 */

/** Lo que expone Chrome en `navigator.connection`. No esta en los tipos estandar. */
type ConexionDelNavegador = {
  saveData?: boolean;
  effectiveType?: string;
};

/**
 * `true` si conviene traer y reproducir video.
 *
 * Las tres razones para decir que no, y ninguna es opcional:
 *
 * - **Movimiento reducido.** Hay gente a la que el movimiento automatico le produce
 *   nauseas. Lo pidio en el sistema operativo; no se discute.
 * - **Ahorro de datos.** Lo prendio a mano en el navegador. Gastarle el plan en video
 *   decorativo despues de que pidio lo contrario no se hace.
 * - **2G.** Ahi el video no llega igual, y lo unico que logra es tapar los posters.
 */
export function convieneTraerVideo(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;

  const conexion = (navigator as Navigator & { connection?: ConexionDelNavegador }).connection;
  if (conexion?.saveData) return false;
  if (conexion?.effectiveType && /^(slow-)?2g$/.test(conexion.effectiveType)) return false;

  return true;
}
