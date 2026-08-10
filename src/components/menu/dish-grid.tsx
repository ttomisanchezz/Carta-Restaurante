"use client";

import { useState } from "react";
import type { CategoriaDeCarta, PlatoDeCarta } from "@/server/menu/queries";
import { CategoryNav, TODAS } from "./category-nav.tsx";
import { DishCard } from "./dish-card.tsx";

/**
 * La grilla y su filtro por categoria.
 *
 * ## Por que este componente es de cliente
 *
 * Es la unica isla interactiva de la carta, y esta acá y no mas arriba: el filtro tiene
 * que responder al toque **sin volver al servidor**. Un round-trip por cada chip, sobre
 * la red de un celular en una mesa, se siente roto — y los doce platos ya estan en el
 * documento, asi que ir a buscarlos de nuevo seria pagar latencia por dato que ya tengo.
 *
 * El costo es acotado y conocido: React igual renderiza esto en el servidor en la primera
 * carga, asi que los posters y los precios viajan en el HTML. El JavaScript solo agrega
 * el filtrado encima de algo que ya se ve.
 *
 * `page.tsx` y `layout.tsx` siguen siendo Server Components, y las consultas nunca cruzan
 * esta frontera: llegan como props ya resueltas.
 */

/** Las URLs de cada plato, ya resueltas por el proveedor de video en el servidor. */
export type MediosPorPlato = Record<string, { playbackUrl: string; posterUrl: string }>;

type Props = {
  platos: PlatoDeCarta[];
  categorias: CategoriaDeCarta[];
  slug: string;
  currency: string;
  /**
   * Llegan como prop y no se calculan acá: este componente es de cliente, y
   * `getVideoProvider()` lee el entorno del servidor. Si la grilla armara las URLs, el
   * nombre de la cuenta de Cloudinary tendria que viajar al navegador.
   */
  medios: MediosPorPlato;
};

/** Cuantas tarjetas entran en la primera fila visible. La grilla es de dos columnas. */
const TARJETAS_PRIMERA_FILA = 2;

export function DishGrid({ platos, categorias, slug, currency, medios }: Props) {
  const [activa, setActiva] = useState<string>(TODAS);

  const visibles = activa === TODAS ? platos : platos.filter((p) => p.category_id === activa);

  return (
    <>
      <div className="mt-6">
        <CategoryNav categorias={categorias} activa={activa} onSeleccionar={setActiva} />
      </div>

      <ul className="mt-6 grid list-none grid-cols-2 gap-4 p-0">
        {visibles.map((plato, indice) => (
          <DishCard
            key={plato.id}
            plato={plato}
            slug={slug}
            currency={currency}
            playbackUrl={medios[plato.id]?.playbackUrl ?? ""}
            posterUrl={medios[plato.id]?.posterUrl ?? plato.thumbnail_url ?? ""}
            // La prioridad se calcula sobre lo que se ESTA mostrando, no sobre la lista
            // completa: al filtrar, la primera fila es otra.
            prioritario={indice < TARJETAS_PRIMERA_FILA}
            indice={indice}
          />
        ))}
      </ul>
    </>
  );
}
