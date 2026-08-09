import Link from "next/link";
import { formatPrice } from "@/lib/format/price";
import type { PlatoDeCarta } from "@/server/menu/queries";

/**
 * Tarjeta de plato: poster 4:5, nombre y precio.
 *
 * El poster es un `<img>` plano y **nunca `next/image`**, por tres razones que se suman:
 * Cloudinary ya entrega la imagen optimizada desde su CDN, cada transformacion de
 * next/image en Vercel se cobra, y next/image bloquea SVG — que es justo el formato de
 * los posters del seed.
 *
 * **Ningun `<video>` acá.** La grilla no reproduce nada: el video de un plato se carga
 * recien cuando el comensal lo abre. Doce videos autoplay en una mesa con datos moviles
 * es la forma mas rapida de que nadie vea ninguno.
 */

type Props = {
  plato: PlatoDeCarta;
  slug: string;
  currency: string;
  /**
   * La primera fila se carga con prioridad; el resto, perezoso.
   *
   * El primer poster visible ES la metrica del producto: si tarda, el comensal cierra la
   * pantalla y pide por la carta de papel.
   */
  prioritario: boolean;
};

export function DishCard({ plato, slug, currency, prioritario }: Props) {
  return (
    <li data-categoria={plato.category_id} data-testid="tarjeta-plato">
      <Link
        href={`/${slug}/plato/${plato.id}`}
        className="flex flex-col gap-2 rounded-card focus-visible:outline-2"
      >
        {/*
          4:5 exacto — las mismas medidas que reserva el esqueleto de loading.tsx, para que
          al llegar la imagen no se mueva nada de lugar.
        */}
        {/* biome-ignore lint/performance/noImgElement: usar <img> es una decision del proyecto, no un descuido. next/image bloquea SVG (el formato de los posters del seed), cobra por transformacion en Vercel, y Cloudinary ya entrega la imagen optimizada desde su CDN. Esta escrito en CLAUDE.md, en .claude/rules/estilos-y-tokens.md y en next.config.ts. */}
        <img
          src={plato.thumbnail_url ?? "/seed/provoleta.svg"}
          alt={plato.name}
          width={480}
          height={600}
          decoding="async"
          loading={prioritario ? "eager" : "lazy"}
          fetchPriority={prioritario ? "high" : "auto"}
          className="aspect-4/5 w-full rounded-card bg-surface object-cover"
        />
        <span className="text-small font-semibold">{plato.name}</span>
        <span className="text-small font-bold text-brand">
          {formatPrice(plato.price, currency)}
        </span>
      </Link>
    </li>
  );
}
