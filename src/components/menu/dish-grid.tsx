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
export type MediosPorPlato = Record<string, { clipUrl: string; posterUrl: string }>;

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

/**
 * Cuantas tarjetas se piden con prioridad.
 *
 * Es la primera fila del TELEFONO, que es de dos columnas — no la del escritorio, que es de
 * tres. A proposito: el 99% del trafico es un celular en una mesa, y es el unico caso donde
 * el presupuesto de red aprieta de verdad (el test de `perf-poster.spec.ts` mide a 400 kbps
 * y a 375px). En escritorio la tercera tarjeta de la fila queda en `lazy`, y no importa: si
 * esta en pantalla el navegador la pide igual, y ahi sobra ancho de banda.
 */
const TARJETAS_PRIMERA_FILA = 2;

export function DishGrid({ platos, categorias, slug, currency, medios }: Props) {
  const [activa, setActiva] = useState<string>(TODAS);

  const visibles = activa === TODAS ? platos : platos.filter((p) => p.category_id === activa);

  return (
    <>
      <div className="mt-6">
        <CategoryNav categorias={categorias} activa={activa} onSeleccionar={setActiva} />
      </div>

      {/* Dos columnas en el telefono y tres de 640px para arriba: con dos, en un escritorio
          cada tarjeta mide 350px de ancho y 440 de alto, y la carta se lee como un catalogo
          de muebles. Tres es lo que hace que la grilla siga siendo una grilla. */}
      <ul className="mt-6 grid list-none grid-cols-2 gap-4 p-0 sm:grid-cols-3 sm:gap-6">
        {visibles.map((plato, indice) => (
          <DishCard
            key={plato.id}
            plato={plato}
            slug={slug}
            currency={currency}
            clipUrl={medios[plato.id]?.clipUrl ?? ""}
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
