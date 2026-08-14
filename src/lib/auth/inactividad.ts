/** Umbral de producto: se puede ajustar sin tocar el componente ni la autenticacion. */
export const DIAS_PARA_AVISO_DE_INACTIVIDAD = 14;

/**
 * Decide con los dos inicios consecutivos, no contra `Date.now()`.
 *
 * Asi el aviso describe el intervalo que acaba de terminar y no aparece de repente en
 * medio de una sesion larga. El primer ingreso y cualquier dato invalido son silenciosos.
 */
export function debeMostrarAvisoDeInactividad(
  inicioActual: string | null,
  inicioAnterior: string | null,
  dias = DIAS_PARA_AVISO_DE_INACTIVIDAD,
): boolean {
  if (!inicioActual || !inicioAnterior || dias < 0) return false;

  const actualMs = Date.parse(inicioActual);
  const anteriorMs = Date.parse(inicioAnterior);
  if (!Number.isFinite(actualMs) || !Number.isFinite(anteriorMs)) return false;

  const umbralMs = dias * 24 * 60 * 60 * 1000;
  return actualMs - anteriorMs > umbralMs;
}
