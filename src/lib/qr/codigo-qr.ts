import qrcode from "qrcode-generator";

/**
 * Generacion de codigos QR. Logica pura: ni React ni `next/*`.
 *
 * La libreria solo aporta la matriz de modulos —el algoritmo de correccion de errores es
 * Reed-Solomon y no es algo que convenga escribir a mano—. El SVG lo armamos nosotros para
 * controlar la zona muda, el tamaño y el color, y para poder ofrecer el mismo dibujo tanto
 * inline en la pantalla como en un archivo descargable, sin rasterizar.
 */

/** Zona muda, en modulos. El estandar exige 4: con menos, el lector no encuentra el codigo. */
const ZONA_MUDA = 4;

/**
 * Correccion de errores al 25%.
 *
 * `M` (15%) es el default habitual y alcanzaria para un QR en una pantalla. Este va pegado
 * a la mesa de un restaurante: lo limpian con un trapo varias veces por dia, le cae aceite
 * y se raya. Subir a `Q` cuesta cuatro modulos mas de lado —invisible al imprimirlo— y
 * compra que el codigo siga leyendose con un cuarto de su superficie arruinada.
 */
const NIVEL_CORRECCION = "Q";

/**
 * La URL que termina codificada en el QR.
 *
 * El origen viene de `NEXT_PUBLIC_SITE_URL`. La barra final se recorta acá y no en el
 * llamador: un `.../` de mas produce `//brasa/mesa/...`, que resuelve igual en la mayoria
 * de los servidores y despues aparece feo en un cartel impreso que ya no se puede corregir.
 */
export function urlDeMesa(origen: string, slug: string, token: string): string {
  return `${origen.replace(/\/+$/, "")}/${slug}/mesa/${token}`;
}

/** La matriz de modulos: `true` es un modulo oscuro. */
export function matrizQr(texto: string): boolean[][] {
  // `0` = elegir la version mas chica que entre. El tipo lo fija la libreria segun cuanto
  // texto haya y que nivel de correccion se pidio.
  const qr = qrcode(0, NIVEL_CORRECCION);
  qr.addData(texto);
  qr.make();

  const lado = qr.getModuleCount();
  const filas: boolean[][] = [];

  for (let fila = 0; fila < lado; fila++) {
    const columnas: boolean[] = [];
    for (let columna = 0; columna < lado; columna++) {
      columnas.push(qr.isDark(fila, columna));
    }
    filas.push(columnas);
  }

  return filas;
}

/** El lado del `viewBox`, en modulos, contando la zona muda de los dos lados. */
export function ladoConZonaMuda(matriz: boolean[][]): number {
  return matriz.length + ZONA_MUDA * 2;
}

/**
 * Todos los modulos oscuros en un unico atributo `d`.
 *
 * Un `<rect>` por modulo serian ~2000 nodos por cada QR, y la hoja imprimible dibuja uno
 * por mesa. Un solo `<path>` es un nodo, pesa una fraccion y el navegador lo rasteriza de
 * una pasada.
 */
export function caminoQr(matriz: boolean[][]): string {
  const partes: string[] = [];

  for (let fila = 0; fila < matriz.length; fila++) {
    for (let columna = 0; columna < matriz.length; columna++) {
      if (matriz[fila]?.[columna]) {
        partes.push(`M${columna + ZONA_MUDA} ${fila + ZONA_MUDA}h1v1h-1z`);
      }
    }
  }

  return partes.join("");
}

/**
 * Los dos unicos colores del QR, y **la unica excepcion a la regla de tokens del proyecto**.
 *
 * Estan acá, exportados, para que exista UN solo lugar donde aparecen y para que la
 * excepcion se lea junto a su motivo en vez de descubrirse suelta dentro de un componente.
 *
 * Por que no son tokens: no son decision de diseño, son requisito del formato. Un QR
 * invertido —modulos claros sobre fondo oscuro— falla en buena parte de los lectores, y
 * este codigo se imprime y se pega a una mesa, asi que el error aparece con un cliente
 * sentado y no en el gate. Tampoco pueden seguir a `--color-brand`: el contraste entre
 * modulo y fondo es lo que el lector mide. La placa clara se lee, ademas, como lo que va a
 * ser: una etiqueta de papel apoyada sobre la pagina.
 */
export const QR_CLARO = "#ffffff";
export const QR_OSCURO = "#000000";

/** Un SVG completo y autonomo, para descargar como archivo. */
export function svgQr(texto: string): string {
  const matriz = matrizQr(texto);
  const lado = ladoConZonaMuda(matriz);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lado} ${lado}" width="512" height="512" shape-rendering="crispEdges">`,
    `<rect width="${lado}" height="${lado}" fill="${QR_CLARO}"/>`,
    `<path d="${caminoQr(matriz)}" fill="${QR_OSCURO}"/>`,
    "</svg>",
  ].join("");
}
