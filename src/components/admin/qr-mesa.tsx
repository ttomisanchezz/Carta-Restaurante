import {
  caminoQr,
  ladoConZonaMuda,
  matrizQr,
  QR_CLARO,
  QR_OSCURO,
  svgQr,
} from "@/lib/qr/codigo-qr";

/**
 * El QR de una mesa, dibujado inline.
 *
 * Server Component: la matriz se calcula en el servidor y al navegador llega un `<path>`
 * ya resuelto. No hay JavaScript de cliente para esto — un QR es un dibujo estatico y
 * mandarle al telefono del dueño una libreria para que lo calcule ahi seria pagar dos
 * veces por el mismo pixel.
 *
 * **La placa es clara a proposito, contra el tema oscuro del panel.** Un QR con los
 * modulos claros sobre fondo oscuro falla en buena parte de los lectores, y este se
 * imprime y se pega a una mesa. Se lee como lo que va a ser: una etiqueta de papel
 * apoyada sobre la pagina.
 */

type Props = {
  /** La URL que codifica. Es tambien la que se muestra en texto al lado. */
  url: string;
  /** Para el `aria-label`: "Mesa 5", "Barra 2". */
  etiqueta: string;
  /** Lado en pixeles CSS. La hoja imprimible usa uno mas grande que la lista. */
  tamano?: number;
  /** Un enlace para bajarse el `.svg`. La hoja imprimible no lo quiere. */
  conDescarga?: boolean;
};

export function QrMesa({ url, etiqueta, tamano = 160, conDescarga = false }: Props) {
  const matriz = matrizQr(url);
  const lado = ladoConZonaMuda(matriz);

  return (
    <div className="flex flex-col items-center gap-2">
      <svg
        // El `viewBox` esta en modulos, asi que el QR escala sin recalcular nada y sin
        // perder nitidez: es vectorial hasta el papel.
        viewBox={`0 0 ${lado} ${lado}`}
        width={tamano}
        height={tamano}
        // Sin esto el navegador antialiasea los bordes de cada modulo y a tamaño chico el
        // gris de los bordes le come contraste al lector.
        shapeRendering="crispEdges"
        role="img"
        aria-label={`Código QR de ${etiqueta}`}
        data-testid="qr-mesa"
        className="rounded-control"
      >
        {/* Los dos unicos colores literales del proyecto. Viven en `lib/qr/codigo-qr.ts`
            con el motivo escrito: no son decision de diseño, son requisito del formato. */}
        <rect width={lado} height={lado} fill={QR_CLARO} />
        <path d={caminoQr(matriz)} fill={QR_OSCURO} />
      </svg>

      {conDescarga ? (
        <a
          // `download` con un data URI: el panel es un navegador de verdad, no hace falta
          // una route handler que sirva el archivo ni guardar nada en disco.
          download={`qr-${etiqueta.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.svg`}
          href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgQr(url))}`}
          data-testid="descargar-qr"
          className="boton-linea boton--chico"
        >
          Descargar QR
        </a>
      ) : null}
    </div>
  );
}
