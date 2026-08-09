import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { loadPublicEnv } from "./lib/env.ts";

/**
 * En Next 16 este archivo se llama `proxy.ts` y exporta `proxy`.
 *
 * **No es `middleware.ts`.** Ese nombre no existe en Next 16, y casi toda la
 * documentacion de Supabase SSR que vas a encontrar sigue diciendo `middleware`: esta
 * desactualizada. Si alguien crea `middleware.ts`, Next lo ignora en silencio y la
 * sesion deja de refrescarse sin un solo error en la consola.
 *
 * Dos trabajos, y ninguno es "autorizar":
 *
 * 1. Refrescar la cookie de sesion. Es el unico lugar del pedido que puede escribir
 *    cookies antes de que empiece el render: un Server Component ya no puede.
 * 2. Cerrar la sesion del usuario que tiene JWT valido pero perdio su fila en
 *    `profiles`. Tambien por lo mismo — borrar la cookie exige poder escribirla.
 *
 * **La autorizacion de verdad vive en `requireAdmin()`**, dentro del layout del panel y
 * dentro de cada Server Action. Una Server Action es un POST a su propia ruta: si algun
 * dia el `matcher` de abajo deja de cubrir un path, lo que NO puede pasar es que eso
 * abra un agujero. Este archivo es comodidad y limpieza de cookies, no la cerradura.
 */

const RUTA_LOGIN = "/admin/login";

export async function proxy(request: NextRequest) {
  const env = loadPublicEnv();

  // `response` se reasigna dentro de setAll: @supabase/ssr necesita que las cookies
  // nuevas queden tanto en el request (para lo que venga despues en este mismo pedido)
  // como en el response (para el navegador).
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            // Igual que en server.ts: la sesion nunca es legible desde JavaScript.
            response.cookies.set(name, value, { ...options, httpOnly: true });
          }
        },
      },
    },
  );

  // `getUser()` y no `getSession()`: getSession lee la cookie y confia en lo que dice.
  // getUser valida el JWT contra Supabase. Para decidir un redirect hace falta lo segundo.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const esLogin = pathname === RUTA_LOGIN;
  const esPanel = pathname.startsWith("/admin") && !esLogin;

  if (!esPanel) return response;

  if (!user) {
    const destino = new URL(RUTA_LOGIN, request.url);
    // La ruta original viaja en `next` para devolver al usuario a donde queria ir.
    destino.searchParams.set("next", pathname);
    // Si venia con cookies de sesion, no sirven — el token esta vencido o revocado. Se
    // barren aca: es la unica forma de que una cookie muerta no se quede en el navegador
    // hasta su fecha de expiracion. Cuando no hay ninguna, esto no hace nada.
    return sinCookiesDeSesion(request, conCookiesDe(response, NextResponse.redirect(destino)));
  }

  const { data: perfil } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil) {
    // Sesion valida contra un usuario que no es nadie en esta aplicacion. Se le cierra
    // la sesion aca porque aca se pueden borrar las cookies; el layout no puede.
    //
    // El signOut() revoca el refresh token del lado de Supabase, que es lo que impide
    // que la sesion reviva. Va envuelto porque es una llamada de red: si Supabase no
    // contesta, el usuario igual tiene que quedar afuera, no ver un 500.
    try {
      await supabase.auth.signOut();
    } catch {
      // Sin conexion no se puede revocar. Las cookies se borran igual, abajo.
    }

    const destino = new URL(RUTA_LOGIN, request.url);
    destino.searchParams.set("error", "sin-perfil");
    return sinCookiesDeSesion(request, NextResponse.redirect(destino));
  }

  return response;
}

/**
 * Borra las cookies de sesion de forma explicita sobre la respuesta que sale.
 *
 * No alcanza con `signOut()`: la limpieza que hace la libreria pasa por el `setAll` de
 * arriba y termina en un `response` que este redirect no es. Verificado con el e2e — la
 * cookie llegaba al navegador entera y con su JWT adentro.
 *
 * Se borra por PATRON y no por nombre fijo porque el nombre depende del ref del proyecto
 * (`sb-<ref>-auth-token`) y porque, si el token no entra en 4KB, la libreria lo parte en
 * `...auth-token.0`, `...auth-token.1`. Borrar solo el nombre base dejaria los pedazos.
 */
function sinCookiesDeSesion(request: NextRequest, destino: NextResponse): NextResponse {
  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith("sb-") && cookie.name.includes("auth-token")) {
      destino.cookies.set(cookie.name, "", { path: "/", maxAge: 0 });
    }
  }
  return destino;
}

/**
 * Pasa las cookies acumuladas en `origen` a la respuesta de redireccion.
 *
 * Sin esto, un `NextResponse.redirect()` nuevo sale sin las cookies que escribio
 * @supabase/ssr — o sea que el refresco de sesion, o el cierre, se pierden justo en el
 * pedido que los provoco.
 */
function conCookiesDe(origen: NextResponse, destino: NextResponse): NextResponse {
  for (const cookie of origen.cookies.getAll()) {
    destino.cookies.set(cookie);
  }
  return destino;
}

export const config = {
  /**
   * Todo menos assets estaticos y `/api`.
   *
   * `/api` queda afuera para que `/api/health` conteste sin una ida a Supabase: es la
   * sonda que usan el script de humo y el `webServer` de Playwright, y meterle latencia
   * de red hace mas lento cada arranque. Las rutas de `/api` que necesiten sesion la
   * validan ellas mismas.
   */
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|seed/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?)$).*)",
  ],
};
