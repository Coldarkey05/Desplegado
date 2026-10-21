import { ForbiddenException } from "@nestjs/common";
import type { Tx } from "./database";
export const aliases: Record<string,string> = {
 "turnos.ver":"cola.ver", "derivaciones.ver":"cola.ver", "turnos.cancelar":"tickets.cancelar",
 "preferencias.asignar":"preferencias.gestionar",
 ...Object.fromEntries(["servicios","modulos","contribuyentes"].flatMap(r=>["crear","editar","eliminar"].map(a=>[`${r}.${a}`,`${r}.gestionar`]))),
 ...Object.fromEntries(["ver","crear","editar","eliminar"].map(a=>[`tipospreferencia.${a}`,"preferencias.gestionar"]))
};
export function can(a: {rol_sistema:string;permisos?:string[]},p:string) {
 return !!a.permisos?.includes(aliases[p] ?? p);
}
export function requirePermission(a:{rol_sistema:string;permisos?:string[]},p:string) {
 if(!can(a,p)) throw new ForbiddenException("No tiene permiso: "+p);
}
export async function permissionsFor(tx:Tx,code:string):Promise<string[]> {
 const rows=await tx.$queryRaw<{codigo:string}[]>`SELECT p.codigo FROM roles r JOIN roles_permisos rp USING(id_rol) JOIN permisos p USING(id_permiso) WHERE r.codigo=${code} AND r.activo=true`;
 return rows.map(r=>r.codigo);
}
export async function userCanAttend(tx:Tx,id:number) {
 const rows=await tx.$queryRaw<{ok:boolean}[]>`SELECT EXISTS(SELECT 1 FROM usuarios_roles ur JOIN roles r ON r.codigo=ur.rol JOIN roles_permisos rp USING(id_rol) JOIN permisos p USING(id_permiso) WHERE ur.id_usuario=${id} AND r.activo=true AND p.codigo='ventanilla.atender') AS ok`;
 return rows[0].ok;
}
export const administrative = (ps:string[]) => ps.some(p=>["usuarios.crear","usuarios.editar","usuarios.eliminar","roles.crear","roles.editar","roles.eliminar","roles.asignar"].includes(p));
