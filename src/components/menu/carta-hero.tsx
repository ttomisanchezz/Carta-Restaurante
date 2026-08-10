/**
 * El hero de la carta.
 *
 * Es la primera pantalla despues de escanear el QR y su unico trabajo es que el comensal
 * entienda donde esta y baje. Por eso hay tres cosas y nada mas: el nombre, una frase y la
 * invitacion a scrollear.
 *
 * ## Por que no hay imagen ni video de fondo
 *
 * Porque el presupuesto de red se gasta en los posters de los platos, que son el producto.
 * Un fondo de 300KB retrasa el primer poster visible y esa es la metrica que decide si el
 * comensal usa la carta o pide la de papel. La textura sale de dos gradientes y un SVG en
 * linea: cero pedidos de red. El detalle vive en `.hero-carta` en `globals.css`.
 *
 * ## Por que 74svh y no la pantalla entera
 *
 * Un hero de alto completo se lee como una landing y esconde que hay carta. Con 74 asoma
 * el borde de la grilla y el pulgar sabe que hay que subir. `svh` y no `vh` para que la
 * barra del navegador movil no lo estire cuando se oculta.
 */

type Props = {
  /** El nombre del restaurante, tal cual esta en la base. */
  nombre: string;
  /** La frase bajo el wordmark. Sin ella el hero queda solo con el nombre, y esta bien. */
  frase?: string;
};

/**
 * La frase, por ahora igual para todos.
 *
 * Provisional a proposito: hoy no hay columna donde guardarla. Cuando haya un segundo
 * restaurante esto es una columna `tagline` en `restaurants` y un campo en el panel, nunca
 * un `if` por slug.
 */
const FRASE_POR_DEFECTO = "Fuego real, sabor de siempre.";

/**
 * El cuerpo del wordmark sale del largo del nombre, y se decide en el servidor.
 *
 * El nombre lo carga cada restaurante desde el panel: "BRASA" y "Parrilla que abre pronto"
 * no pueden entrar al mismo cuerpo, y no hay CSS que achique un titulo porque el texto no
 * entra. Los cortes estan donde un nombre deja de leerse como logo y empieza a leerse como
 * frase.
 */
const LARGO_CORTO = 8;
const LARGO_MEDIO = 18;

function claseDelWordmark(nombre: string): string {
  // `[...nombre]` y no `.length`: un nombre con emoji o acentos compuestos cuenta de mas
  // con la longitud de UTF-16 y se le asigna un cuerpo mas chico del que le toca.
  const largo = [...nombre.trim()].length;

  if (largo <= LARGO_CORTO) return "hero-wordmark--corto";
  if (largo <= LARGO_MEDIO) return "hero-wordmark--medio";
  return "hero-wordmark--largo";
}

export function CartaHero({ nombre, frase = FRASE_POR_DEFECTO }: Props) {
  return (
    <header className="hero-carta" data-testid="hero-carta">
      <h1 className={`hero-wordmark ${claseDelWordmark(nombre)}`}>{nombre}</h1>

      {/* El filete: no lleva texto ni separa secciones, asi que no es un <hr>. */}
      <span className="linea-acento mt-6" aria-hidden="true" />

      {frase ? <p className="hero-frase mt-6">{frase}</p> : null}

      {/*
        Enlace de ancla y no un boton con scrollTo: funciona antes de que hidrate el
        JavaScript, se puede abrir en otra pestana y el teclado lo alcanza con Tab.
      */}
      <a className="hero-cue" href="#carta">
        Ver la carta
        <svg
          className="hero-cue-flecha"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M2.5 4.5 6 8l3.5-3.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </a>
    </header>
  );
}
