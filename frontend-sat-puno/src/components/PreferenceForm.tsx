import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, msg, refresh } from "../lib/api";
import type { Row } from "../lib/types";
import { ErrorNotice, Loading, useToast } from "./ui";
export function PreferenceForm({
  dni,
  disabled,
  onDirty,
}: {
  dni: string;
  disabled: boolean;
  onDirty: (dirty: boolean) => void;
}) {
  const [pref, setPref] = useState("");
  const [names, setNames] = useState("");
  const [surname, setSurname] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();
  const types = useQuery({
    queryKey: ["orientation-types"],
    queryFn: () => api<Row[]>("/orientacion/preferencias"),
  });
  const q = useQuery({
    queryKey: ["orientation-person", dni],
    queryFn: () =>
      api<{ contribuyente: Row | null; turno: Row | null }>(
        "/orientacion/contribuyente/" + dni,
      ),
    enabled: dni.length === 8,
    refetchInterval: false,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (dirty) return;
    const c = q.data?.contribuyente;
    setPref(
      String(
        c?.id_tipo_preferencia ??
          types.data?.find((t) => t.nombre_tipo === "Ninguna")
            ?.id_tipo_preferencia ??
          "",
      ),
    );
    setNames(c?.nombres === "Por completar" ? "" : (c?.nombres ?? ""));
    setSurname(c?.apellidos === "Por completar" ? "" : (c?.apellidos ?? ""));
    setDirty(false);
    onDirty(false);
    setError("");
  }, [dni, q.data, types.data]);
  const mark = () => {
    setDirty(true);
    onDirty(true);
  };
  async function save() {
    setBusy(true);
    setError("");
    try {
      await api("/orientacion/contribuyente/" + dni, {
        method: "PATCH",
        body: {
          id_tipo_preferencia: Number(pref),
          ...(names.trim() ? { nombres: names.trim() } : {}),
          ...(surname.trim() ? { apellidos: surname.trim() } : {}),
        },
      });
      setDirty(false);
      onDirty(false);
      await q.refetch();
      await refresh();
      toast("Preferencia guardada");
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  }
  const locked =
    disabled ||
    busy ||
    !!q.error ||
    q.isPending ||
    ["LLAMADO", "EN ATENCION"].includes(q.data?.turno?.estado);
  return (
    <section className="panel preference-form">
      <div className="panel-body">
        <h2>Datos y atención preferencial</h2>
        <p>
          Busca al contribuyente con su DNI y guarda la preferencia antes de
          emitir.
        </p>
        {dni.length !== 8 ? (
          <p className="muted">Ingresa los 8 dígitos del DNI.</p>
        ) : (
          <>
            {q.isPending ? (
              <Loading />
            ) : (
              <div className="form-grid">
                <label>
                  Nombres
                  <input
                    aria-label="Nombres del contribuyente"
                    value={names}
                    maxLength={100}
                    disabled={locked}
                    onChange={(e) => {
                      setNames(e.target.value);
                      mark();
                    }}
                  />
                </label>
                <label>
                  Apellidos
                  <input
                    aria-label="Apellidos del contribuyente"
                    value={surname}
                    maxLength={100}
                    disabled={locked}
                    onChange={(e) => {
                      setSurname(e.target.value);
                      mark();
                    }}
                  />
                </label>
                <label className="span-2">
                  Tipo de preferencia
                  <select
                    aria-label="Tipo de preferencia"
                    value={pref}
                    disabled={locked || types.isPending || !!types.error}
                    onChange={(e) => {
                      setPref(e.target.value);
                      mark();
                    }}
                  >
                    <option value="">Selecciona una preferencia</option>
                    {types.data?.map((t) => (
                      <option
                        key={t.id_tipo_preferencia}
                        value={t.id_tipo_preferencia}
                      >
                        {t.nombre_tipo}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            {q.data?.turno && (
              <p className="info-note">
                Turno activo: {q.data.turno.codigo_ticket} ·{" "}
                {q.data.turno.estado}.{" "}
                {["LLAMADO", "EN ATENCION"].includes(q.data.turno.estado)
                  ? "La atención ya comenzó; no se cambia su preferencia."
                  : "Si cambias la preferencia, se actualiza su prioridad sin generar otro ticket ni cambiar su código."}
              </p>
            )}
            {(error || q.error || types.error) && (
              <ErrorNotice error={error || msg(q.error || types.error)} />
            )}
            <button
              type="button"
              className="btn primary"
              disabled={locked || !dirty || !pref || !!types.error}
              onClick={() => void save()}
            >
              {busy ? "Guardando…" : "Guardar datos y preferencia"}
            </button>
            {dirty && (
              <p className="inline-help">
                Guarda los cambios para habilitar la emisión.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
