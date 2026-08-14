"use client";

import { createContext, useContext } from "react";

/**
 * El puente entre la carta y el carrito.
 *
 * Existe como contexto y no como prop atravesada por seis componentes porque el boton de
 * agregar vive adentro del modal del plato, que lo renderiza la grilla, que la renderiza la
 * carta. Pasar la funcion a mano por esa cadena obligaria a que la carta publica —donde no
 * se pide nada— tambien la conociera.
 *
 * **`null` es un valor legitimo y es el de la carta publica.** Cuando no hay contexto no
 * hay boton de agregar, y esa es exactamente la diferencia entre `/[slug]` y
 * `/[slug]/mesa/[token]`: la misma carta, con o sin la posibilidad de pedir.
 */

export type PlatoParaPedir = { id: string; nombre: string; precio: number };

export type CarritoApi = {
  agregar: (plato: PlatoParaPedir) => void;
  quitar: (dishId: string) => void;
  cantidadDe: (dishId: string) => number;
};

const CarritoContext = createContext<CarritoApi | null>(null);

export const CarritoProvider = CarritoContext.Provider;

/** El carrito, o `null` si esta pantalla no toma pedidos. */
export function useCarrito(): CarritoApi | null {
  return useContext(CarritoContext);
}
