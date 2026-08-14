/**
 * Formato de calorias. Mismo criterio que `formatPrice`: **sin `Intl`**, salida determinista.
 *
 * `Intl.NumberFormat` depende de los datos ICU del runtime y el separador de miles cambia
 * entre versiones de Node y entre Node y el navegador — el numero terminaria distinto en el
 * servidor y en el cliente, y encima con un test que falla por razones ajenas al codigo.
 *
 * Devuelve `null` cuando no hay dato, y eso es contrato, no comodidad: `calories` es
 * nullable a proposito y `null` significa "no sabemos". La vista NO dibuja nada en ese caso
 * —ni "s/d", ni un guion, ni un hueco reservado—. Inventar o insinuar un numero en la carta
 * de un restaurante es peor que no mostrarlo.
 */
export function formatCalories(calorias: number | null): string | null {
  if (calorias === null || !Number.isFinite(calorias)) return null;

  const entero = Math.trunc(calorias);
  if (entero < 0) return null;

  // Puntos cada tres digitos, de derecha a izquierda. Igual que el precio.
  const conMiles = String(entero).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return `${conMiles} kcal`;
}
