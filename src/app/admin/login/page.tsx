import type { Metadata } from "next";
import { iniciarSesion } from "../actions.ts";

/**
 * Login del panel. **No hay pantalla de alta**: los usuarios los crea
 * `scripts/create-admin.ts` o un superadmin. Un formulario de registro abierto en un
 * panel de administracion es una puerta que nadie pidio.
 *
 * Vive FUERA del grupo `(panel)` a proposito. Si estuviera adentro, el layout de ese
 * grupo llamaria `requireAdmin()` sobre la propia pagina de login y el redirect al login
 * pediria el login: un bucle infinito.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Entrar al panel",
};

/**
 * Un codigo en la query, un texto aca. Los textos son exactamente los que exige el paso 7
 * del blueprint.
 */
const MENSAJES: Record<string, string> = {
  credenciales: "Email o contrasena incorrectos",
  "sin-perfil": "Tu usuario no tiene un perfil asignado",
};

type Props = {
  searchParams: Promise<{ next?: string; error?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const { next, error } = await searchParams;
  const mensaje = error ? MENSAJES[error] : undefined;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[420px] flex-col justify-center px-4">
      <span className="linea-acento linea-acento--izquierda" aria-hidden="true" />
      <h1 className="titulo-seccion mt-4 text-h1">Panel</h1>
      <p className="mt-2 text-small text-text-muted">Entrá para administrar tu carta.</p>

      {mensaje ? (
        // `role="alert"` para que un lector de pantalla lo anuncie al volver del redirect.
        // El `data-testid` no es decoracion: Next monta su propio `role="alert"` invisible
        // (`__next-route-announcer__`) en toda pagina, asi que buscar por rol encuentra dos.
        <p
          role="alert"
          data-testid="mensaje-login"
          className="mt-6 rounded-control border border-error/40 bg-error/10 px-4 py-3 text-small text-error"
        >
          {mensaje}
        </p>
      ) : null}

      <form action={iniciarSesion} className="mt-6 flex flex-col gap-4">
        {/* A donde volver despues de entrar. `iniciarSesion` lo valida como ruta interna. */}
        <input type="hidden" name="next" value={next ?? ""} />

        <label className="flex flex-col gap-2">
          <span className="text-small font-semibold">Email</span>
          <input
            type="email"
            name="email"
            autoComplete="username"
            required
            className="min-h-[44px] rounded-control border border-border-strong bg-surface px-4 text-body text-text"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-small font-semibold">Contraseña</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            className="min-h-[44px] rounded-control border border-border-strong bg-surface px-4 text-body text-text"
          />
        </label>

        <button type="submit" className="boton-marca mt-2">
          Entrar
        </button>
      </form>
    </div>
  );
}
