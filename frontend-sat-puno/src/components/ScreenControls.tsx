import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, msg, refresh } from "../lib/api";
import { can, useSession } from "../lib/session";
import type { ScreenConfig } from "../lib/types";
import { ErrorNotice, Loading, useToast } from "./ui";
export function ScreenControls() {
  const { actor } = useSession();
  const allowed = can(actor, "pantalla.gestionar");
  const q = useQuery({
    queryKey: ["screen-config"],
    queryFn: () => api<ScreenConfig>("/pantalla/configuracion"),
    enabled: allowed,
  });
  const [draft, setDraft] = useState<ScreenConfig | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const toast = useToast();
  if (!allowed) return null;
  const d = draft ?? q.data;
  const change = (values: Partial<ScreenConfig>) => {
    if (d) setDraft({ ...d, ...values });
  };
  return (
    <section className="panel screen-controls" aria-labelledby="screen-controls-heading">
      <h2 id="screen-controls-heading">Video y anuncios</h2>
      <p>
        Estos cambios se aplican a todas las pantallas conectadas. El modo de
        video conserva la cola y la atención.
      </p>
      {q.isPending && <Loading />}
      {q.error && (
        <ErrorNotice error={msg(q.error)} retry={() => void q.refetch()} />
      )}
      {d && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const { id, ...body } = d;
              await api("/pantalla/configuracion", { method: "PATCH", body });
              setDraft(null);
              await refresh();
              toast("Pantalla pública actualizada");
            } catch (e) {
              setError(msg(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={busy} className="screen-control-fields">
            <label>
              Contenido principal
              <select
                value={d.modo}
                onChange={(e) =>
                  change({ modo: e.target.value as ScreenConfig["modo"] })
                }
              >
                <option value="turnos">Turnos llamados</option>
                <option value="video">Transmitir video</option>
              </select>
            </label>
            <label>
              Enlace del video (HTTPS)
              <input
                type="url"
                maxLength={2048}
                value={d.video_url}
                placeholder="https://tu-servidor/video.mp4"
                required={d.modo === "video"}
                onChange={(e) => change({ video_url: e.target.value })}
              />
            </label>
            <p className="inline-help">
              Enlace directo MP4, WebM u OGG accesible desde la TV. Los enlaces
              de páginas de YouTube no son archivos de video. El video llena el recuadro sin deformarse; se recortan los bordes si las proporciones son distintas. La reproducción
              comienza sin sonido para permitir el inicio automático.
            </p>
            <label className="check-field">
              <input
                type="checkbox"
                checked={d.video_expandido}
                onChange={(e) => change({ video_expandido: e.target.checked })}
              />
              Expandir video sobre toda la pantalla, conservando la cinta
              inferior
            </label>
            <label>
              Anuncio a los contribuyentes
              <textarea
                required
                maxLength={1000}
                value={d.anuncio}
                onChange={(e) => change({ anuncio: e.target.value })}
              />
            </label>
            <label className="check-field">
              <input
                type="checkbox"
                checked={d.anuncio_desplazable}
                onChange={(e) =>
                  change({ anuncio_desplazable: e.target.checked })
                }
              />
              Desplazar anuncio
            </label>
            <div className="actions">
              <button className="btn primary">
                {busy ? "Guardando…" : "Aplicar a las pantallas"}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setDraft(null);
                  setError("");
                  void q.refetch();
                }}
              >
                Recargar configuración
              </button>
            </div>
          </fieldset>
          {error && <ErrorNotice error={error} />}{" "}
        </form>
      )}
    </section>
  );
}
