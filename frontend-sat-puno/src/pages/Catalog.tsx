import { useState, useEffect, type FormEvent } from "react";
import { useParams, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Download,
  RefreshCw,
} from "lucide-react";
import { useSession, can, home } from "../lib/session";
import { api, catalogAll, msg, refresh } from "../lib/api";
import {
  catalogs,
  rowLabel,
  type Catalog as Definition,
} from "../lib/catalogs";
import type { Row, Page } from "../lib/types";
import { dateTime, downloadCsv } from "../lib/utils";
import {
  Modal,
  Confirm,
  ErrorNotice,
  Loading,
  Empty,
  Pager,
  Badge,
  useToast,
} from "../components/ui";
function CatalogForm({
  resource,
  row,
  refs,
  onClose,
}: {
  resource: string;
  row: Row | null;
  refs: Record<string, Row[]>;
  onClose: () => void;
}) {
  const def = catalogs[resource];
  const fields = def.fields.filter((f) => !row || !f.createOnly);
  const [values, setValues] = useState<Row>(() =>
    Object.fromEntries(
      fields.map((f) => [
        f.key,
        f.type === "password" ? "" : (row?.[f.key] ?? f.default ?? ""),
      ]),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const body: Row = {};
    for (const f of fields) {
      let value = values[f.key];
      if (f.type === "password" && row && !value) continue;
      if (f.type === "multiselect") value = (value || []).map(Number);
      else if (value === "" && f.nullable) value = null;
      else if (f.type === "number" || (f.reference && f.reference !== "roles"))
        value = value === "" ? undefined : Number(value);
      else if (typeof value === "string")
        value = f.type === "password" ? value : value.trim();
      if (value !== undefined && (!row || value !== row[f.key]))
        body[f.key] = value;
    }
    if (body.dni && !/^\d{8}$/.test(body.dni)) {
      setError("El DNI debe tener 8 dígitos.");
      return;
    }
    if (body.password && new TextEncoder().encode(body.password).length > 72) {
      setError("La contraseña supera 72 bytes. Usa menos caracteres.");
      return;
    }
    if (!Object.keys(body).length) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      await api(`/admin/${resource}${row ? "/" + row[def.id] : ""}`, {
        method: row ? "PATCH" : "POST",
        body,
      });
      await refresh();
      toast(row ? "Cambios guardados" : "Registro creado");
      onClose();
    } catch (e) {
      setError(msg(e));
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={`${row ? "Editar" : "Nuevo"} ${def.singular}`}
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={submit}>
        <div className="modal-body">
          <div className="form-grid">
            {fields.map((f) =>
              f.type === "multiselect" ? (
                <fieldset
                  className="service-checks span-2"
                  key={f.key}
                  disabled={busy}
                >
                  <legend>{f.label}</legend>
                  {refs[f.reference!]?.map((r) => (
                    <label className="check-field" key={r.id_servicio}>
                      <input
                        type="checkbox"
                        disabled={
                          r.activo === false &&
                          !(values[f.key] || []).includes(r.id_servicio)
                        }
                        checked={(values[f.key] || []).includes(r.id_servicio)}
                        onChange={(e) =>
                          setValues({
                            ...values,
                            [f.key]: e.target.checked
                              ? [...(values[f.key] || []), r.id_servicio]
                              : values[f.key].filter(
                                  (id: number) => id !== r.id_servicio,
                                ),
                          })
                        }
                      />
                      {r.nombre_servicio}
                      {r.activo === false ? " (inactivo)" : ""}
                    </label>
                  ))}
                  <small>
                    Marca uno o más servicios. Sin servicios, la ventanilla debe
                    permanecer cerrada.
                  </small>
                </fieldset>
              ) : (
                <label
                  key={f.key}
                  className={
                    f.type === "textarea" || f.type === "boolean"
                      ? "span-2"
                      : ""
                  }
                >
                  {f.type === "boolean" ? (
                    <span className="check-field">
                      <input
                        type="checkbox"
                        checked={!!values[f.key]}
                        disabled={busy}
                        onChange={(e) =>
                          setValues({ ...values, [f.key]: e.target.checked })
                        }
                      />
                      {f.label}
                    </span>
                  ) : (
                    <>
                      {f.label}
                      {f.required && !(row && f.type === "password") && (
                        <span className="required"> *</span>
                      )}
                      {f.type === "select" ? (
                        <select
                          disabled={busy}
                          required={f.required}
                          value={values[f.key] ?? ""}
                          onChange={(e) =>
                            setValues({ ...values, [f.key]: e.target.value })
                          }
                        >
                          <option value="">
                            {f.nullable
                              ? "Sin asignar"
                              : "Selecciona una opción"}
                          </option>
                          {f.options?.map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                          {row &&
                            f.key === "estado" &&
                            row.estado === "Ocupado" && (
                              <option value="Ocupado" disabled>
                                Ocupado
                              </option>
                            )}
                          {f.reference &&
                            refs[f.reference]?.map((r) => (
                              <option
                                key={
                                  r[
                                    f.reference === "roles"
                                      ? "codigo"
                                      : catalogs[f.reference!].id
                                  ]
                                }
                                value={
                                  r[
                                    f.reference === "roles"
                                      ? "codigo"
                                      : catalogs[f.reference!].id
                                  ]
                                }
                                disabled={
                                  f.key === "id_modulo_asignado" &&
                                  r.disponible_para_asignar !== true &&
                                  r.id_modulo !== row?.id_modulo_asignado
                                }
                              >
                                {rowLabel(f.reference!, r)}
                                {r.activo === false ? " (inactivo)" : ""}
                                {f.key === "id_modulo_asignado" &&
                                r.disponible_para_asignar !== true &&
                                r.id_modulo !== row?.id_modulo_asignado
                                  ? " — No disponible"
                                  : ""}
                              </option>
                            ))}
                        </select>
                      ) : f.type === "textarea" ? (
                        <textarea
                          aria-label={f.label}
                          maxLength={f.max}
                          disabled={busy}
                          value={values[f.key] ?? ""}
                          onChange={(e) =>
                            setValues({ ...values, [f.key]: e.target.value })
                          }
                        />
                      ) : (
                        <input
                          type={f.type ?? "text"}
                          inputMode={f.key === "dni" ? "numeric" : undefined}
                          pattern={f.key === "dni" ? "[0-9]{8}" : undefined}
                          autoComplete={
                            f.type === "password" ? "new-password" : "off"
                          }
                          required={
                            f.required && !(row && f.type === "password")
                          }
                          min={f.type === "number" ? f.min : undefined}
                          max={f.type === "number" ? f.max : undefined}
                          minLength={f.type !== "number" ? f.min : undefined}
                          maxLength={f.type !== "number" ? f.max : undefined}
                          step={f.type === "number" ? 1 : undefined}
                          value={values[f.key] ?? ""}
                          disabled={busy}
                          onChange={(e) =>
                            setValues({ ...values, [f.key]: e.target.value })
                          }
                        />
                      )}
                    </>
                  )}
                  {f.hint && <small>{f.hint}</small>}
                </label>
              ),
            )}
          </div>
          {error && <ErrorNotice error={error} />}
        </div>
        <div className="modal-footer">
          <button
            type="button"
            className="btn"
            onClick={onClose}
            disabled={busy}
          >
            Cancelar
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? "Guardando…" : row ? "Guardar cambios" : "Crear registro"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function CatalogPage() {
  const { actor } = useSession();
  const { resource = "" } = useParams();
  if (!can(actor, resource + ".ver"))
    return <Navigate to={home(actor!.rol_sistema)} replace />;
  if (!catalogs[resource]) return <Navigate to="/admin" replace />;
  return (
    <CatalogView key={resource} resource={resource} def={catalogs[resource]} />
  );
}
function CatalogView({ resource, def }: { resource: string; def: Definition }) {
  const { actor } = useSession();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Row | null | undefined>();
  const [releaseModule, setReleaseModule] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();
  const limit = 20;
  const query = useQuery({
    queryKey: ["catalog", resource, page],
    queryFn: ({ signal }) =>
      api<Page>(`/admin/${resource}?page=${page}&limit=${limit}`, { signal }),
  });
  const refNames = [
    ...new Set(
      [...def.fields, ...def.columns].flatMap((f) =>
        f.reference ? [f.reference] : [],
      ),
    ),
  ];
  const references = useQuery({
    queryKey: ["references", resource],
    refetchInterval: resource === "usuarios" ? 5000 : false,
    queryFn: async ({ signal }) =>
      Object.fromEntries(
        await Promise.all(
          refNames.map(async (r) => [
            r,
            await api<Row[]>(`/opciones/${r}`, { signal }),
          ]),
        ),
      ),
  });
  useEffect(() => {
    if (query.data && page > 1 && query.data.items.length === 0)
      setPage(page - 1);
  }, [query.data, page]);
  const refs = references.data ?? {};
  function value(row: Row, col: Definition["columns"][number]) {
    if (col.reference && Array.isArray(row[col.key]))
      return (
        row[col.key]
          .map((id: number) => {
            const found = refs[col.reference!]?.find(
              (r: Row) => r[catalogs[col.reference!].id] === id,
            );
            return found ? rowLabel(col.reference!, found) : "#" + id;
          })
          .join(", ") || "Sin asignar"
      );
    if (col.reference) {
      const found = refs[col.reference]?.find(
        (r: Row) => r[catalogs[col.reference!].id] === row[col.key],
      );
      return found
        ? rowLabel(col.reference, found)
        : row[col.key]
          ? "#" + row[col.key]
          : "Sin asignar";
    }
    return Array.isArray(row[col.key]) ? row[col.key].join(", ") : row[col.key];
  }
  const filtered =
    query.data?.items.filter((r) =>
      def.columns
        .map((c) => String(value(r, c) ?? ""))
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) ?? [];
  async function remove() {
    if (!deleting) return;
    setBusy(true);
    setError("");
    try {
      await api(`/admin/${resource}/${deleting[def.id]}`, { method: "DELETE" });
      await refresh();
      setDeleting(null);
      toast("Registro eliminado");
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ADMINISTRACIÓN / CATÁLOGOS</span>
          <h1>{def.title}</h1>
          <p>{def.description}</p>
        </div>
        {can(actor, resource + ".crear") && (
          <button
            className="btn primary"
            disabled={
              !can(actor, resource + ".crear") ||
              references.isPending ||
              !!references.error
            }
            onClick={() => setEditing(null)}
          >
            <Plus size={18} />
            Nuevo {def.singular}
          </button>
        )}
      </div>
      {(query.error || references.error) && (
        <ErrorNotice
          error={msg(query.error || references.error)}
          retry={() => void refresh()}
        />
      )}
      {resource === "modulos" && (
        <p className="info-note">
          El modo se guarda por ventanilla y también puede cambiarlo su
          operador. Cambiarlo conserva el turno actual. Al activar Automático,
          una ventanilla abierta y libre puede recibir el siguiente turno
          inmediatamente.
        </p>
      )}
      <section className="panel">
        <div className="table-toolbar">
          <label className="searchbox">
            <Search size={18} />
            <input
              aria-label="Buscar en esta página"
              placeholder="Buscar en esta página…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div className="actions">
            <button
              className="btn small"
              onClick={() => void query.refetch()}
              title="Actualizar"
            >
              <RefreshCw size={16} />
              <span>Actualizar</span>
            </button>
            <button
              className="btn small"
              disabled={!filtered.length}
              onClick={() =>
                downloadCsv(`${resource}-pagina-${page}.csv`, filtered)
              }
            >
              <Download size={16} />
              Exportar página
            </button>
          </div>
        </div>
        {query.isPending ? (
          <Loading />
        ) : filtered.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  {def.columns.map((c) => (
                    <th key={c.key}>{c.label}</th>
                  ))}
                  {resource === "modulos" && <th>Modo de atención</th>}
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row[def.id]}>
                    <td className="muted">#{row[def.id]}</td>
                    {def.columns.map((c, i) => (
                      <td key={c.key} className={i === 0 ? "strong" : ""}>
                        {c.kind === "boolean" ? (
                          <Badge value={row[c.key] ? "Activo" : "Inactivo"} />
                        ) : c.kind === "badge" ? (
                          <Badge value={row[c.key]} />
                        ) : c.kind === "date" ? (
                          dateTime(row[c.key])
                        ) : (
                          String(value(row, c) ?? "—")
                        )}
                      </td>
                    ))}
                    {resource === "modulos" && (
                      <td>
                        {can(actor, "modulos.gestionar") ? (
                          <select
                            aria-label={`Modo de atención de ${row.numero_modulo}`}
                            value={
                              row.atencion_automatica ? "automatico" : "manual"
                            }
                            disabled={busy || !!query.error}
                            onChange={async (e) => {
                              const automatic = e.target.value === "automatico";
                              setError("");
                              setBusy(true);
                              try {
                                await api(
                                  `/admin/modulos/${row.id_modulo}/modo`,
                                  {
                                    method: "PATCH",
                                    body: { atencion_automatica: automatic },
                                  },
                                );
                                await refresh();
                                toast(
                                  `${row.numero_modulo}: modo ${automatic ? "automático" : "manual"} guardado`,
                                );
                              } catch (e) {
                                setError(msg(e));
                                await refresh();
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            <option value="automatico">Automático</option>
                            <option value="manual">Manual</option>
                          </select>
                        ) : (
                          <span>
                            {row.atencion_automatica ? "Automático" : "Manual"}
                          </span>
                        )}
                      </td>
                    )}
                    <td>
                      <div className="actions">
                        {resource === "modulos" &&
                          can(actor, "ventanilla.relevar") && (
                            <>
                              <button
                                className="btn small"
                                disabled={busy}
                                onClick={async () => {
                                  setError("");
                                  setBusy(true);
                                  try {
                                    await api(
                                      `/admin/modulos/${row.id_modulo}/abrir`,
                                      { method: "POST", body: {} },
                                    );
                                    await refresh();
                                    toast("Ventanilla abierta");
                                  } catch (e) {
                                    setError(msg(e));
                                  } finally {
                                    setBusy(false);
                                  }
                                }}
                              >
                                Abrir
                              </button>
                              <button
                                className="btn small"
                                disabled={busy}
                                onClick={() => setReleaseModule(row)}
                              >
                                Relevar
                              </button>
                            </>
                          )}
                        {can(actor, resource + ".editar") && (
                          <button
                            className="icon-btn edit"
                            aria-label={`Editar registro ${row[def.id]}`}
                            disabled={
                              row.puede_editar === false ||
                              references.isPending ||
                              !!references.error
                            }
                            title={row.motivo_proteccion ?? "Editar"}
                            onClick={() => setEditing(row)}
                          >
                            <Pencil size={17} />
                          </button>
                        )}
                        {can(actor, resource + ".eliminar") && (
                          <button
                            className="icon-btn delete"
                            aria-label={`Eliminar registro ${row[def.id]}`}
                            disabled={row.puede_eliminar === false}
                            title={row.motivo_proteccion ?? "Eliminar"}
                            onClick={() => {
                              setError("");
                              setDeleting(row);
                            }}
                          >
                            <Trash2 size={17} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title={
              search
                ? "Sin coincidencias en esta página"
                : "Todavía no hay registros"
            }
          />
        )}
        <Pager
          page={page}
          total={query.data?.total ?? 0}
          limit={limit}
          setPage={(p) => {
            setPage(p);
            setSearch("");
          }}
        />
      </section>
      {resource === "usuarios" && (
        <p className="info-note">
          Solo un administrador de nivel numérico menor puede editar o eliminar
          a otro administrador. No puedes modificarte a ti mismo ni a tus
          creadores. Las cuentas con descendientes se desactivan para conservar
          la jerarquía.
        </p>
      )}
      <p className="inline-help">
        La eliminación respeta los registros relacionados. Si necesitas
        conservar el historial, desactiva el registro cuando esa opción esté
        disponible.
      </p>
      {editing !== undefined && (
        <CatalogForm
          resource={resource}
          row={editing}
          refs={refs}
          onClose={() => setEditing(undefined)}
        />
      )}{" "}
      {releaseModule && (
        <Confirm
          title="Liberar módulo para relevo"
          text="Dejará de recibir turnos. Si hay una atención actual, su operador debe terminarla antes de que el módulo se libere. La cola se conserva."
          busy={busy}
          error={error}
          onClose={() => setReleaseModule(null)}
          onConfirm={async () => {
            setError("");
            setBusy(true);
            try {
              await api(`/admin/modulos/${releaseModule.id_modulo}/liberar`, {
                method: "POST",
                body: {},
              });
              await refresh();
              setReleaseModule(null);
              toast("Relevo solicitado");
            } catch (e) {
              setError(msg(e));
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
      {deleting && (
        <Confirm
          title={`Eliminar ${def.singular}`}
          text={`Se eliminará el registro #${deleting[def.id]}. Esta acción no se puede deshacer.`}
          busy={busy}
          error={error}
          onClose={() => setDeleting(null)}
          onConfirm={remove}
        />
      )}
    </>
  );
}
