import type { MesaDelPanel } from "@/server/admin/tables";
import { QrMesa } from "./qr-mesa.tsx";

/**
 * Una mesa en el listado del panel: su QR, su URL en texto y los dos controles.
 *
 * La URL va **visible y completa**, no escondida detras del QR. Es lo que permite probar
 * una mesa a mano —pegarla en el navegador de la compu— sin tener que levantarse a escanear
 * un papel, y es lo primero que se pide cuando algo no anda.
 */

type Props = {
  mesa: MesaDelPanel;
  url: string;
  alRenombrar: (formData: FormData) => Promise<void>;
  alCambiarActivacion: (formData: FormData) => Promise<void>;
};

export function FilaMesa({ mesa, url, alRenombrar, alCambiarActivacion }: Props) {
  return (
    <li
      data-testid="fila-mesa"
      data-etiqueta={mesa.label}
      data-activa={mesa.is_active ? "si" : "no"}
      className="flex flex-col gap-4 rounded-card border border-border p-4 sm:flex-row sm:items-start"
    >
      <QrMesa url={url} etiqueta={mesa.label} conDescarga />

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="text-body font-semibold">{mesa.label}</span>
          {mesa.is_active ? null : (
            <span className="rounded-chip border border-border-strong px-2 py-1 text-caption uppercase tracking-[0.14em] text-text-muted">
              Inactiva
            </span>
          )}
        </div>

        {/*
         * `break-all` y no `truncate`: el token son 32 caracteres sin espacios y el punto de
         * mostrarlo es poder leerlo entero o copiarlo. Cortarlo con puntos suspensivos lo
         * volveria decorativo.
         */}
        <code className="break-all rounded-control bg-bg px-3 py-2 text-caption text-text-muted">
          {url}
        </code>

        <div className="flex flex-wrap items-end gap-2">
          <form action={alRenombrar} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={mesa.id} />
            <label className="flex flex-col gap-2">
              <span className="text-caption text-text-muted">Renombrar</span>
              <input
                name="label"
                required
                defaultValue={mesa.label}
                aria-label={`Nuevo nombre para ${mesa.label}`}
                data-testid="campo-renombrar-mesa"
                className="min-h-[44px] rounded-control border border-border-strong bg-surface px-4 text-body"
              />
            </label>
            <button type="submit" data-testid="renombrar-mesa" className="boton-linea boton--chico">
              Guardar
            </button>
          </form>

          <form action={alCambiarActivacion}>
            <input type="hidden" name="id" value={mesa.id} />
            {/* Se manda el estado DESTINO, no el actual: asi la accion no tiene que leer la
                fila para saber que hacer, y dos clicks seguidos no se pisan entre si. */}
            <input type="hidden" name="activa" value={mesa.is_active ? "no" : "si"} />
            <button
              type="submit"
              data-testid="cambiar-activacion-mesa"
              aria-label={`${mesa.is_active ? "Desactivar" : "Reactivar"} ${mesa.label}`}
              className={`boton-linea boton--chico ${mesa.is_active ? "text-error" : ""}`}
            >
              {mesa.is_active ? "Desactivar" : "Reactivar"}
            </button>
          </form>
        </div>
      </div>
    </li>
  );
}
