/**
 * Formato de precio. **No usa `Intl`, y es a proposito.**
 *
 * `Intl.NumberFormat` depende de los datos ICU del runtime: el separador de miles y, peor,
 * el espacio entre el simbolo y el numero cambian entre versiones de Node y entre Node y
 * el navegador. Un test sobre esa salida falla por razones que no tienen nada que ver con
 * el codigo, y el precio termina distinto en el servidor y en el cliente.
 *
 * Esto es puro y su salida es contrato nuestro:
 *
 * - Miles con `.`, decimales con `,`, siempre dos decimales.
 * - `ARS` -> `$`, `USD` -> `US$`, cualquier otro -> su propio codigo de tres letras.
 * - Un espacio simple (U+0020) entre el simbolo y el numero.
 */

const SIMBOLOS: Record<string, string> = {
  ARS: "$",
  USD: "US$",
};

/**
 * @param cents Precio en CENTAVOS, entero. `1350000` es trece mil quinientos pesos.
 * @param currency Codigo ISO de tres letras.
 */
export function formatPrice(cents: number, currency: string): string {
  const simbolo = SIMBOLOS[currency] ?? currency;

  // `trunc` y no `round`: el contrato dice centavos enteros. Si llega un float, se corta
  // en vez de inventar un centavo que nadie cobro.
  const enteroDeCentavos = Math.trunc(cents);
  const negativo = enteroDeCentavos < 0;
  const absoluto = Math.abs(enteroDeCentavos);

  const unidades = Math.floor(absoluto / 100);
  const centavos = String(absoluto % 100).padStart(2, "0");

  // Puntos cada tres digitos, de derecha a izquierda.
  const conMiles = String(unidades).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return `${negativo ? "-" : ""}${simbolo} ${conMiles},${centavos}`;
}
