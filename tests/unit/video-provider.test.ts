import { describe, expect, it } from "vitest";
import { type EntornoDeVideo, elegirPosterUrl, getVideoProvider } from "@/lib/video/provider";

/**
 * Un proveedor de mentira para `elegirPosterUrl`: ahi interesa CUAL poster se elige, no
 * como se arma la URL.
 */
const PROVEEDOR_FALSO = {
  posterUrl: (id: string) => `derivado:${id}`,
};
const OPCIONES_POSTER = { width: 480, ratio: "4:5" } as const;

describe("elegirPosterUrl", () => {
  it("el poster guardado gana sobre el que deriva el proveedor", () => {
    // Esta es LA regresion, y llego a produccion: con el orden al reves, los platos del
    // seed pedian su poster a Cloudinary, que devuelve 404 porque esos videos nunca se
    // subieron. La carta de demostracion mostraba una imagen rota.
    const url = elegirPosterUrl(
      PROVEEDOR_FALSO,
      { thumbnail_url: "/seed/ojo-de-bife.svg", video_playback_id: "seed/ojo-de-bife" },
      OPCIONES_POSTER,
    );

    expect(url).toBe("/seed/ojo-de-bife.svg");
  });

  it("sin poster guardado lo deriva del video", () => {
    // El plato cargado por el panel: no hay foto, hay video.
    const url = elegirPosterUrl(
      PROVEEDOR_FALSO,
      { thumbnail_url: null, video_playback_id: "carta/prod/abc" },
      OPCIONES_POSTER,
    );

    expect(url).toBe("derivado:carta/prod/abc");
  });

  it("sin poster y sin video devuelve cadena vacia, no una URL invalida", () => {
    // Un plato recien creado. Mejor un src vacio que un `derivado:` sin id detras.
    const url = elegirPosterUrl(
      PROVEEDOR_FALSO,
      { thumbnail_url: null, video_playback_id: null },
      OPCIONES_POSTER,
    );

    expect(url).toBe("");
  });
});

/**
 * El proveedor de video, con el entorno inyectado.
 *
 * No se toca `process.env`: `getVideoProvider` recibe el entorno, asi que las dos ramas se
 * prueban sin ensuciar el proceso ni depender del orden en que corran los archivos.
 */

const CON_CLOUDINARY: EntornoDeVideo = {
  VIDEO_PROVIDER: "cloudinary",
  CLOUDINARY_CLOUD_NAME: "carta-demo",
  CLOUDINARY_STREAMING_PROFILE: "hd",
};

describe("eleccion del proveedor", () => {
  it("con VIDEO_PROVIDER en direct devuelve el proveedor directo", () => {
    const proveedor = getVideoProvider({
      VIDEO_PROVIDER: "direct",
      CLOUDINARY_CLOUD_NAME: undefined,
      CLOUDINARY_STREAMING_PROFILE: "hd",
    });

    expect(proveedor.name).toBe("direct");
  });

  it("con VIDEO_PROVIDER en cloudinary y las variables puestas devuelve el de cloudinary", () => {
    expect(getVideoProvider(CON_CLOUDINARY).name).toBe("cloudinary");
  });

  it("con cloudinary y sin CLOUDINARY_CLOUD_NAME lanza nombrando esa variable", () => {
    const romper = () =>
      getVideoProvider({
        VIDEO_PROVIDER: "cloudinary",
        CLOUDINARY_CLOUD_NAME: undefined,
        CLOUDINARY_STREAMING_PROFILE: "hd",
      });

    // Nombrar la variable no es cosmetico: un "configuracion invalida" a las tres de la
    // mañana no le sirve a nadie.
    expect(romper).toThrow(/CLOUDINARY_CLOUD_NAME/);
  });

  it("tambien lanza si viene vacia o en blanco", () => {
    // Una variable declarada y vacia es el caso mas comun de un .env mal copiado, y es
    // justo el que un `!variable` no atrapa si la cadena tiene un espacio.
    expect(() => getVideoProvider({ ...CON_CLOUDINARY, CLOUDINARY_CLOUD_NAME: "" })).toThrow(
      /CLOUDINARY_CLOUD_NAME/,
    );
    expect(() => getVideoProvider({ ...CON_CLOUDINARY, CLOUDINARY_CLOUD_NAME: "   " })).toThrow(
      /CLOUDINARY_CLOUD_NAME/,
    );
  });
});

describe("URLs de cloudinary", () => {
  const proveedor = getVideoProvider(CON_CLOUDINARY);

  it("la reproduccion termina en .m3u8 y lleva el perfil de streaming", () => {
    const url = proveedor.playbackUrl("carta/dev/ojo-de-bife");

    expect(url.endsWith(".m3u8")).toBe(true);
    expect(url).toContain("sp_hd");
    expect(url).toContain("carta/dev/ojo-de-bife");
    expect(url.startsWith("https://res.cloudinary.com/carta-demo/")).toBe(true);
  });

  it("el poster termina en .jpg y lleva la relacion de aspecto pedida", () => {
    const url = proveedor.posterUrl("carta/dev/ojo-de-bife", { width: 480, ratio: "4:5" });

    expect(url.endsWith(".jpg")).toBe(true);
    expect(url).toContain("ar_4:5");
    expect(url).toContain("w_480");
    // so_1 y no so_0: el primer cuadro de un video suele ser negro.
    expect(url).toContain("so_1");
  });

  it("el clip de la grilla viene recortado, redimensionado y como archivo unico", () => {
    const url = proveedor.clipUrl("carta/prod/ojo-de-bife", {
      width: 600,
      ratio: "4:5",
      segundos: 6,
    });

    // Las cuatro transformaciones que convirtieron 28.8 MB en 1.17 MB. Si alguna se cae,
    // la grilla vuelve a bajar la fuente entera y a tardar diez segundos.
    expect(url).toContain("w_600");
    expect(url).toContain("du_6");
    expect(url).toContain("q_auto");
    expect(url).toContain("f_auto");
    expect(url).toContain("ar_4:5");

    // Archivo, no manifiesto: la grilla no usa HLS a proposito.
    expect(url.endsWith(".mp4")).toBe(true);
    expect(url).not.toContain(".m3u8");
    expect(url).not.toContain("sp_");
  });

  it("el perfil de streaming sale del entorno, no esta escrito a mano", () => {
    const otro = getVideoProvider({ ...CON_CLOUDINARY, CLOUDINARY_STREAMING_PROFILE: "full_hd" });

    expect(otro.playbackUrl("x")).toContain("sp_full_hd");
  });

  /**
   * Esto no es defensivo por las dudas: se rompio de verdad.
   *
   * Un video subido como `entraña_clw2vd` se entrega con HTTP 400 si la eñe viaja cruda en
   * la ruta — verificado contra la cuenta real. Cloudinary la acepta al subir y su API te
   * la devuelve tal cual, pero su CDN exige ASCII o percent-encoding. Sin esto, el dia que
   * un restaurante suba `champiñones.mp4` ese plato queda sin video y nada avisa.
   */
  it("escapa los acentos del public id, que si van crudos dan 400", () => {
    const url = proveedor.clipUrl("entraña_clw2vd", { width: 600, ratio: "4:5", segundos: 6 });

    expect(url).toContain("entra%C3%B1a_clw2vd");
    expect(url).not.toContain("ñ");
  });

  it("escapa tambien en el manifiesto y en el poster", () => {
    expect(proveedor.playbackUrl("champiñones")).toContain("champi%C3%B1ones");
    expect(proveedor.posterUrl("champiñones", { width: 480, ratio: "4:5" })).toContain(
      "champi%C3%B1ones",
    );
  });

  /**
   * La barra de las carpetas tiene que sobrevivir. Un `encodeURIComponent` de una sola
   * pasada sobre la cadena entera la convertiria en `%2F` y romperia todos los public id
   * con carpeta — que son los que hoy funcionan.
   */
  it("no rompe las carpetas al escapar", () => {
    const url = proveedor.playbackUrl("carta/dev/entraña");

    expect(url).toContain("carta/dev/entra%C3%B1a");
    expect(url).not.toContain("%2F");
  });
});

describe("URLs del proveedor directo", () => {
  const proveedor = getVideoProvider({
    VIDEO_PROVIDER: "direct",
    CLOUDINARY_CLOUD_NAME: undefined,
    CLOUDINARY_STREAMING_PROFILE: "hd",
  });

  it("trata el id como una ruta del propio sitio", () => {
    // Es lo que permite que la suite corra sin red ni cuenta de Cloudinary.
    expect(proveedor.playbackUrl("seed/ojo-de-bife")).toBe("/seed/ojo-de-bife");
    expect(proveedor.posterUrl("seed/ojo-de-bife", { width: 480, ratio: "4:5" })).toBe(
      "/seed/ojo-de-bife.svg",
    );
  });

  it("no duplica la barra si el id ya viene con una", () => {
    expect(proveedor.playbackUrl("/seed/ojo-de-bife")).toBe("/seed/ojo-de-bife");
  });
});
