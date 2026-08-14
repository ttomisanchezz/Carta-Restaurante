import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CartaCompleta } from "@/components/menu/carta-completa";
import { PedidoMesa } from "@/components/menu/pedido-mesa";
import { BrandScope } from "@/components/ui/brand-scope";
import { getMenuBySlug, getTableByToken } from "@/server/menu/queries";
import { accionCrearPedido, accionEstadoDeSesion } from "./actions.ts";

/**
 * La carta a la que llega el comensal escaneando el QR de su mesa.
 *
 * Es la misma carta de `/[slug]` —el mismo componente, no una copia— mas un indicador
 * discreto de en que mesa esta sentado. En Fase 1 no hay pedidos ni llamado al mozo: esta
 * ruta existe para que la mesa quede identificada desde el dia uno, que es lo que las
 * fases siguientes necesitan para no construirse sobre arena.
 */

/**
 * Cacheada 60 segundos, igual que la carta publica. **Volvio a serlo, y lo decidio una
 * medicion.**
 *
 * El primer intento puso `force-dynamic` para que la cuenta en curso saliera fresca en el
 * HTML del servidor. El costo, medido a 400 kbps con `perf-poster.spec.ts`: el primer
 * poster paso de 3874 ms a 6813 ms — 70% por encima del presupuesto de cuatro segundos, que
 * no se negocia. Sin cache, cada escaneo resuelve dos consultas contra Postgres antes de
 * mandar el primer byte, y a esa velocidad el poster ni siquiera empieza a bajar.
 *
 * Lo que se sirve cacheado es el CASCARON: la carta y la etiqueta de la mesa, que no
 * cambian. La cuenta en curso ya no viaja en el HTML — la pide el cliente apenas monta, con
 * la misma accion del polling. El comensal ve la comida primero y su cuenta un instante
 * despues, que es exactamente el orden de prioridades correcto.
 */
export const revalidate = 60;
export const dynamicParams = true;

type Props = { params: Promise<{ slug: string; token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, token } = await params;
  const [carta, mesa] = await Promise.all([getMenuBySlug(slug), getTableByToken(slug, token)]);

  if (!carta || !mesa) return { title: "Mesa no encontrada" };

  return {
    title: `${carta.restaurante.name} — ${mesa.label}`,
    /**
     * **`noindex` no es opcional acá.** La URL LLEVA EL TOKEN ADENTRO: si un buscador la
     * indexa, el identificador secreto de la mesa queda publicado y cualquiera pide desde
     * su casa, que es exactamente el ataque que el token opaco venia a cerrar. Basta con
     * que alguien comparta el enlace una vez para que el rastreador lo encuentre.
     *
     * Por lo mismo no hay `openGraph`: la carta para compartir por WhatsApp es `/[slug]`,
     * sin mesa. Esta se escanea, no se comparte.
     */
    robots: { index: false, follow: false },
  };
}

export default async function MesaPage({ params }: Props) {
  const { slug, token } = await params;

  // Las dos en paralelo: son independientes y encadenarlas duplica la latencia de la unica
  // pantalla que ve un comensal con hambre y datos moviles. Las dos estan memorizadas con
  // `cache()`, asi que el layout ya resolvio la mesa y esto no cuesta una consulta extra.
  const [carta, mesa] = await Promise.all([getMenuBySlug(slug), getTableByToken(slug, token)]);

  // El layout ya corto el caso de mesa invalida; esto es el cinturon para que TypeScript
  // sepa que no son `null` y para no depender de que ese layout siga existiendo mañana.
  if (!carta || !mesa) notFound();

  /*
   * El proveedor del carrito se importa ACA y no adentro de `CartaCompleta`, y no es un
   * detalle de organizacion: importarlo alla metia el JavaScript del carrito en el bundle
   * de `/[slug]` tambien, porque el bundler no puede saber que el prop iba a llegar
   * `undefined`. A 400 kbps esos bytes se los quitaba al primer poster de la carta publica,
   * y `perf-poster.spec.ts` lo agarro.
   *
   * `PedidoMesa` envuelve a la carta —sin modificarla— para que el boton de agregar del
   * modal del plato llegue al carrito por contexto.
   */
  return (
    // El `BrandScope` de afuera es para la barra del carrito y el bloque de estado, que
    // quedan fuera del que `CartaCompleta` monta adentro. Anidar el mismo color es inocuo:
    // la regla de adentro redeclara `--color-brand` con el mismo valor.
    <BrandScope color={carta.restaurante.primary_color}>
      <PedidoMesa
        token={token}
        currency={carta.restaurante.currency}
        acciones={{ crear: accionCrearPedido, consultar: accionEstadoDeSesion }}
      >
        <CartaCompleta carta={carta} mesa={mesa.label} />
      </PedidoMesa>
    </BrandScope>
  );
}
