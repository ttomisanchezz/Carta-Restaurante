"use client";

import { useState } from "react";

/**
 * Subida de video de un plato.
 *
 * **El archivo no pasa por nuestro servidor.** Pide una firma a `/api/video/signature` y
 * sube directo a Cloudinary: una funcion de Vercel tiene 4.5 MB de limite de cuerpo y un
 * video de un plato lo supera sin esfuerzo. Despues avisa al servidor que ya esta, y ahi
 * el plato entra en la carta.
 *
 * Barra de progreso por archivo y, si falla, el motivo con un boton de reintento en la
 * misma fila. Nada de un cartel generico: cuando fallan tres subidas de doce, hay que
 * saber cuales.
 */

type Props = {
  dishId: string;
  /** Base del identificador en Cloudinary, sin la carpeta. */
  publicIdSugerido: string;
  /** Server Action que anota el video en la base cuando la subida termino. */
  onConfirmar: (formData: FormData) => void;
};

type Estado = "inicial" | "firmando" | "subiendo" | "listo" | "error";

export function VideoUploader({ dishId, publicIdSugerido, onConfirmar }: Props) {
  const [estado, setEstado] = useState<Estado>("inicial");
  const [progreso, setProgreso] = useState(0);
  const [motivo, setMotivo] = useState("");

  async function subir(archivo: File) {
    setEstado("firmando");
    setMotivo("");
    setProgreso(0);

    const respuesta = await fetch("/api/video/signature", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dishId, publicId: publicIdSugerido }),
    });

    if (!respuesta.ok) {
      const cuerpo = await respuesta.json().catch(() => null);
      setEstado("error");
      // El `code` del sobre de error es contrato; el mensaje es para la persona.
      setMotivo(cuerpo?.error?.message ?? "No pudimos preparar la subida.");
      return;
    }

    const { data } = await respuesta.json();

    const formulario = new FormData();
    formulario.append("file", archivo);
    formulario.append("api_key", data.apiKey);
    formulario.append("timestamp", String(data.timestamp));
    formulario.append("signature", data.signature);
    formulario.append("folder", data.folder);
    formulario.append("public_id", data.publicId);

    setEstado("subiendo");

    // XMLHttpRequest y no fetch: es la unica forma de tener progreso de subida real. Sin
    // barra, una subida de 80 MB en una conexion de restaurante parece una pantalla colgada.
    const subida = await new Promise<{ ok: boolean; motivo?: string }>((resolver) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", data.uploadUrl);
      xhr.upload.addEventListener("progress", (evento) => {
        if (evento.lengthComputable) setProgreso(Math.round((evento.loaded / evento.total) * 100));
      });
      xhr.addEventListener("load", () =>
        resolver(
          xhr.status >= 200 && xhr.status < 300
            ? { ok: true }
            : { ok: false, motivo: `El proveedor rechazó la subida (${xhr.status}).` },
        ),
      );
      xhr.addEventListener("error", () => resolver({ ok: false, motivo: "Se cortó la conexión." }));
      xhr.send(formulario);
    });

    if (!subida.ok) {
      setEstado("error");
      setMotivo(subida.motivo ?? "No pudimos subir el video.");
      return;
    }

    // Recien acá el plato pasa a `ready` y aparece en la carta.
    const confirmacion = new FormData();
    confirmacion.append("dishId", dishId);
    confirmacion.append("playbackId", `${data.folder}/${data.publicId}`);
    onConfirmar(confirmacion);

    setEstado("listo");
  }

  return (
    <div className="flex flex-col gap-2" data-testid="subidor-video">
      <input
        type="file"
        accept="video/*"
        aria-label="Elegir video"
        data-testid="archivo-video"
        onChange={(evento) => {
          const archivo = evento.target.files?.[0];
          if (archivo) void subir(archivo);
        }}
        className="text-small"
      />

      {estado === "subiendo" ? (
        <progress value={progreso} max={100} data-testid="progreso-video" className="w-full">
          {progreso}%
        </progress>
      ) : null}

      {estado === "listo" ? (
        <p data-testid="estado-subida" className="text-caption text-success">
          Video listo.
        </p>
      ) : null}

      {estado === "error" ? (
        <div className="flex items-center gap-2">
          <p data-testid="error-subida" className="text-caption text-error">
            {motivo}
          </p>
          <button
            type="button"
            onClick={() => setEstado("inicial")}
            data-testid="reintentar-subida"
            className="min-h-[44px] rounded-control border border-border-strong px-4 text-caption font-semibold"
          >
            Reintentar
          </button>
        </div>
      ) : null}
    </div>
  );
}
