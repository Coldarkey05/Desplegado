import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, ShieldCheck, Pencil, Trash2 } from 'lucide-react';
import { api, msg, refresh } from '../lib/api';
import { can, useSession } from '../lib/session';
import { Modal, Confirm, ErrorNotice, Loading, useToast, Badge } from '../components/ui';
type Role={id_rol:number;codigo:string;nombre:string;descripcion:string|null;activo:boolean;es_sistema:boolean;permisos:string[];usuarios:number};
type Permission={codigo:string;nombre:string;descripcion:string|null};
const groups:Record<string,string>={usuarios:'Usuarios',roles:'Roles y accesos',servicios:'Servicios',modulos:'Módulos',contribuyentes:'Contribuyentes',preferencias:'Orientación y preferencias',tickets:'Tickets',cola:'Cola',pantalla:'Pantalla pública',ventanilla:'Atención en ventanilla',reportes:'Reportes',auditoria:'Auditoría'};
function RoleForm({role,permissions,close}:{role:Role|null;permissions:Permission[];close:()=>void}){
 const {actor}=useSession();const toast=useToast();
 const [codigo,setCodigo]=useState(role?.codigo??'');const [nombre,setNombre]=useState(role?.nombre??'');
 const [descripcion,setDescripcion]=useState(role?.descripcion??'');const [activo,setActivo]=useState(role?.activo??true);
 const [selected,setSelected]=useState(role?.permisos??[]);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const grantable=(p:string)=>can(actor,p)&& (actor?.rol_sistema==='Admin'|| !['usuarios.crear','usuarios.editar','usuarios.eliminar','roles.crear','roles.editar','roles.eliminar','roles.asignar'].includes(p));
 async function save(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{
  await api('/admin/roles'+(role?'/'+role.id_rol:''),{method:role?'PATCH':'POST',body:{...(role?{}:{codigo}),nombre,descripcion:descripcion||null,activo,permisos:selected}});
  await refresh();toast('Rol guardado. Sus accesos se aplican desde el servidor.');close();
 }catch(e){setError(msg(e))}finally{setBusy(false)}}
 return <Modal title={role?'Editar rol':'Crear rol'} onClose={close} busy={busy}><form onSubmit={save}>
  <div className="modal-body"><div className="form-grid">
   <label>Código<input aria-label="Código del rol" required value={codigo} disabled={!!role||busy} maxLength={30} pattern="[A-Za-z][A-Za-z0-9_]*" onChange={e=>setCodigo(e.target.value)}/><small>Identificador único; no cambia después de crear.</small></label>
   <label>Nombre<input aria-label="Nombre del rol" required maxLength={80} value={nombre} disabled={busy} onChange={e=>setNombre(e.target.value)}/></label>
   <label className="span-2">Descripción<textarea maxLength={255} value={descripcion} disabled={busy} onChange={e=>setDescripcion(e.target.value)}/></label>
   <label className="check-field span-2"><input type="checkbox" checked={activo} disabled={busy} onChange={e=>setActivo(e.target.checked)}/>Rol activo</label>
  </div>
  <h3>Permisos del rol</h3><p className="inline-help">Combina funciones de administración, atención y orientación. Los permisos se aplican únicamente al rol seleccionado al ingresar.</p>
  <div className="role-permissions">{Object.entries(groups).map(([key,title])=>{const list=permissions.filter(p=>p.codigo.startsWith(key+'.'));return <fieldset key={key}><legend>{title}</legend>{list.map(p=><label className="check-field" key={p.codigo}><input type="checkbox" aria-label={p.codigo} checked={selected.includes(p.codigo)} disabled={busy||!grantable(p.codigo)} onChange={e=>setSelected(old=>e.target.checked?[...old,p.codigo]:old.filter(x=>x!==p.codigo))}/><span>{p.nombre}<small>{p.codigo}</small></span></label>)}</fieldset>})}</div>
  {error&&<ErrorNotice error={error}/>}<p className="inline-help">Cambiar permisos cierra las sesiones de los usuarios del rol. Admin está protegido. No puedes modificar un rol que afecte tu cuenta o cuentas superiores.</p>
  </div><div className="modal-footer"><button type="button" className="btn" disabled={busy} onClick={close}>Cancelar</button><button className="btn primary" disabled={busy}>{busy?'Guardando…':'Guardar rol'}</button></div>
 </form></Modal>
}
export function RolesPage(){
 const {actor}=useSession();const toast=useToast();const [editing,setEditing]=useState<Role|null|undefined>();
 const [deleting,setDeleting]=useState<Role|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const q=useQuery({queryKey:['roles'],queryFn:()=>api<{roles:Role[];permisos:Permission[]}>('/admin/roles')});
 return <><div className="page-heading"><div><span className="eyebrow">ADMINISTRACIÓN / ACCESOS</span><h1>Roles y permisos</h1><p>Crea perfiles de trabajo y combina las funciones que necesita tu equipo.</p></div>{can(actor,'roles.crear')&&<button className="btn primary" disabled={!q.data} onClick={()=>setEditing(null)}><Plus size={18}/>Nuevo rol</button>}</div>
 {q.error&&<ErrorNotice error={msg(q.error)}/>} {q.isPending?<Loading/>:<div className="roles-catalog">{q.data?.roles.map(r=><article className="panel role-summary" key={r.id_rol}><div className="actions"><ShieldCheck/><Badge value={r.activo?'Activo':'Inactivo'}/>{r.es_sistema&&<span className="muted">Sistema</span>}</div><h2>{r.nombre}</h2><p>{r.descripcion||r.codigo}</p><div className="metric-row"><span>{r.permisos.length} permisos</span><strong>{r.usuarios} usuarios</strong></div><div className="actions">{can(actor,'roles.editar')&&<button className="btn" disabled={r.codigo==='Admin'} onClick={()=>setEditing(r)}><Pencil size={16}/>Editar {r.nombre}</button>}{can(actor,'roles.eliminar')&&<button className="btn" disabled={r.es_sistema||r.usuarios>0} onClick={()=>{setError('');setDeleting(r)}}><Trash2 size={16}/>Eliminar</button>}</div></article>)}</div>}
 <p className="info-note">Asigna los roles a las personas desde «Asignar roles». Los roles inactivos no permiten iniciar una sesión de trabajo.</p>
 {editing!==undefined&&q.data&&<RoleForm role={editing} permissions={q.data.permisos} close={()=>setEditing(undefined)}/>}
 {deleting&&<Confirm title="Eliminar rol" text={`Se eliminará ${deleting.nombre}. Solo se pueden eliminar roles personalizados sin usuarios.`} busy={busy} error={error} onClose={()=>setDeleting(null)} onConfirm={async()=>{setBusy(true);try{await api('/admin/roles/'+deleting.id_rol,{method:'DELETE'});await refresh();setDeleting(null);toast('Rol eliminado')}catch(e){setError(msg(e))}finally{setBusy(false)}}}/>}
 </>
}
