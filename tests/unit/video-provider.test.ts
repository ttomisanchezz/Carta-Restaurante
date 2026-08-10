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

  it("el perfil de streaming sale del entorno, no esta escrito a mano", () => {
    const otro = getVideoProvider({ ...CON_CLOUDINARY, CLOUDINARY_STREAMING_PROFILE: "full_hd" });

    expect(otro.playbackUrl("x")).toContain("sp_full_hd");
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
