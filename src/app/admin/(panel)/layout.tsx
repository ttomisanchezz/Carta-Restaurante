import type { ReactNode } from "react";
import { AvisoInactividad } from "@/components/admin/aviso-inactividad";
import { debeMostrarAvisoDeInactividad } from "@/lib/auth/inactividad";
import { requireAdmin } from "@/lib/auth/require-admin";
import { cerrarSesion } from "../actions.ts";

/**
 * Layout del panel. Todo lo que cuelgue de este grupo esta protegido.
 *
 * `(panel)` es un grupo de rutas: los parentesis NO aparecen en la URL, asi que
 * `(panel)/platos/page.tsx` sigue siendo `/admin/platos`. Existe para dejar
 * `/admin/login` afuera de este layout sin sacarlo de `/admin`.
 */

// Sin esto Next intentaria prerenderizar el panel en el build, cuando no hay cookies ni
// sesion, y `requireAdmin()` mandaria todo al login en tiempo de compilacion.
export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: ReactNode }) {
  const sesion = await requireAdmin();
  const mostrarAviso = debeMostrarAvisoDeInactividad(sesion.lastSignInAt, sesion.previousSignInAt);

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4">
      {/* No es un <main>: el layout raiz ya abrio uno y tiene que haber exactamente uno. */}
      <header className="flex min-h-[44px] items-center justify-between gap-4 border-b border-border py-4">
        <nav aria-label="Panel">
          <ul className="flex list-none items-center gap-6 p-0">
            <li>
              <a href="/admin/platos" className="enlace-panel">
                Platos
              </a>
            </li>
            <li>
              <a href="/admin/categorias" className="enlace-panel">
                Categorías
              </a>
            </li>
            <li>
              <a href="/admin/pedidos" className="enlace-panel">
                Pedidos
              </a>
            </li>
            <li>
              <a href="/admin/cocina" className="enlace-panel">
                Cocina
              </a>
            </li>
            <li>
              <a href="/admin/mesas" className="enlace-panel">
                Mesas
              </a>
            </li>
          </ul>
        </nav>

        <div className="flex items-center gap-4">
          <form action={cerrarSesion}>
            <button type="submit" className="boton-linea boton--chico">
              Cerrar sesión
            </button>
          </form>
        </div>
      </header>

      {mostrarAviso ? <AvisoInactividad /> : null}

      <div className="py-6">{children}</div>
    </div>
  );
}
