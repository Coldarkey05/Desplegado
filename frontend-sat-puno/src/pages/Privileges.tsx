import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { api, msg } from "../lib/api";
import { ErrorNotice, Loading, useToast } from "../components/ui";
import { roleDetails } from "./RoleSelection";
type Account = { id_usuario: number; nombre_usuario: string; nombres: string; apellidos: string; activo: boolean; roles: string[]; motivo_proteccion: string | null; nivel_admin: number | null };
export function Privileges() {
  const q = useQuery({ queryKey: ["privileges"], queryFn: () => api<{ roles: string[]; roles_detalle: { codigo: string; nombre: string; descripcion: string | null }[]; cuentas: Account[] }>("/admin/privilegios"), refetchInterval: false });
  const [selected, setSelected] = useState("");
  const [roles, setRoles] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const toast = useToast();
  const account = q.data?.cuentas.find(c => String(c.id_usuario) === selected);
  useEffect(() => { setRoles(account?.roles ?? []); setDirty(false); setError(""); }, [account]);
  async function save() {
    if (!account) return;
    setBusy(true); setError("");
    try {
      await api(`/admin/privilegios/${account.id_usuario}`, { method: "PATCH", body: { roles } });
      await q.refetch(); setDirty(false); toast("Roles actualizados. El usuario debe iniciar sesión nuevamente.");
    } catch(e) { setError(msg(e)); } finally { setBusy(false); }
  }
  return <>
    <div className="page-heading"><div><span className="eyebrow">ADMINISTRACIÓN / ACCESOS</span><h1>Asignar roles</h1><p>Asigna los roles con los que cada persona puede trabajar.</p></div><ShieldCheck size={35}/></div>
    <section className="panel"><div className="panel-body">
      <label>Usuario<select aria-label="Usuario para asignar roles" value={selected} disabled={busy} onChange={e => {
        if (dirty && !window.confirm("Hay cambios sin guardar. ¿Descartarlos?")) return;
        setSelected(e.target.value);
      }}><option value="">Selecciona un usuario</option>{q.data?.cuentas.map(c => <option key={c.id_usuario} value={c.id_usuario}>{c.nombres} {c.apellidos} · {c.nombre_usuario}{!c.activo ? " (inactivo)" : ""}</option>)}</select></label>
      {q.isPending && <Loading/>}{(error || q.error) && <ErrorNotice error={error || msg(q.error)}/>}
      <p className="inline-help">Una persona puede tener varios roles. Al iniciar sesión elegirá uno. Los permisos corresponden al rol seleccionado; los accesos de Admin no aparecen dentro del panel Operador.</p>
      {account && <>
        {account.motivo_proteccion && <p className="info-note">{account.motivo_proteccion}</p>}
        <div className="role-grants">{q.data?.roles.map(role => {
          const detail = roleDetails[role as keyof typeof roleDetails];
          const saved = q.data?.roles_detalle?.find(r => r.codigo === role);
          const title = saved?.nombre ?? detail?.title ?? role;
          return <label className="role-grant" key={role}><input type="checkbox" aria-label={`Asignar rol ${title}`} checked={roles.includes(role)} disabled={busy || !!account.motivo_proteccion} onChange={e => { setDirty(true); setRoles(old => e.target.checked ? [...old, role] : old.filter(r => r !== role)); }}/><span><strong>{title}</strong><small>{saved?.descripcion ?? detail?.text}</small></span></label>;
        })}</div>
        <p>Al guardar se cierran las sesiones anteriores de esta cuenta. Para retirar la capacidad de atención primero debe liberar su ventanilla. Solo un Admin de rango superior puede modificar a otro administrador.</p>
        <button className="btn primary" disabled={busy || !dirty || !roles.length || !!account.motivo_proteccion} onClick={() => void save()}>{busy ? "Guardando…" : "Guardar roles"}</button>
      </>}
    </div></section>
  </>;
}
