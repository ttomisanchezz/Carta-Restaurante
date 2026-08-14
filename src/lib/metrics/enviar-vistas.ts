import { createBrowserSupabase } from "../supabase/client.ts";
import type { LoteDeVistas } from "./vistas-de-plato.ts";

/**
 * El unico lugar del navegador que habla de metricas con la base.
 *
 * Va separado de `vistas-de-plato.ts` para que la logica de agrupado se pueda probar sin
 * levantar un cliente de Supabase, y para que ningun componente termine importando el SDK
 * por su cuenta.
 */

/**
 * Manda un lote y se traga cualquier error.
 *
 * Es deliberado y es la parte importante de este archivo: **una metrica no puede degradar
 * la carta**. Si la RPC falla, si la red se corta o si el proyecto de Supabase esta caido,
 * el comensal tiene que seguir viendo su video como si nada. Lo unico que se pierde es un
 * numero del panel.
 *
 * La funcion de la base ya decide sola si el evento entra —restaurante activo, plato
 * disponible, video listo, token bien formado, techo por ventana— y devuelve `void` en
 * todos los casos, asi que acá no hay ninguna respuesta que valga la pena inspeccionar.
 */
export async function enviarLoteDeVistas(lote: LoteDeVistas, sessionToken: string): Promise<void> {
  try {
    const supabase = createBrowserSupabase();
    await supabase.rpc("record_dish_views", {
      p_dish_id: lote.dishId,
      p_session: sessionToken,
      p_momentos: lote.momentos,
    });
  } catch {
    // Silencio a proposito. Ver arriba.
  }
}
