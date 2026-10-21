import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards, ParseIntPipe, ForbiddenException, ConflictException, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { Database, Tx, audit } from './database';
import { AccessGuard, Permit, Actor } from './auth';
import { parse } from './validation';
import { permissionsFor, administrative } from './permissions';
import { requireManaged, managementReason } from './hierarchy';
import { Events } from './events';
const codes=z.array(z.string().min(1).max(80)).max(100).refine(v=>new Set(v).size===v.length,'No repitas permisos');
const form=z.object({codigo:z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,29}$/),nombre:z.string().trim().min(1).max(80),descripcion:z.string().max(255).nullable().optional(),activo:z.boolean().optional(),permisos:codes}).strict();
export async function authorizeGrant(tx:Tx,a:Actor,ps:string[]) {
 const own=await permissionsFor(tx,a.rol_sistema);
 if(ps.some(p=>!own.includes(p))) throw new ForbiddenException('No puedes conceder permisos que tu rol actual no tiene');
 if(administrative(ps) && a.rol_sistema!=='Admin') throw new ForbiddenException('Solo Admin puede conceder permisos administrativos de usuarios o roles');
}
export async function accountLevel(tx:Tx,a:Actor,ps:string[],old:number|null) {
 if(!administrative(ps) || old!==null) return old;
 const manager=await tx.usuarios.findUniqueOrThrow({where:{id_usuario:a.id_usuario!}});
 if(a.rol_sistema!=='Admin'||manager.nivel_admin===null) throw new ForbiddenException('Se requiere un Admin con rango para crear acceso administrativo');
 return manager.nivel_admin+1;
}
@Controller('admin')
@UseGuards(AccessGuard)
export class RolesController {
 constructor(private db:Database,private events:Events){}
 @Get('roles') @Permit('roles.ver')
 async list(){
  const roles=await this.db.roles.findMany({orderBy:{id_rol:'asc'}});
  const permisos=await this.db.permisos.findMany({orderBy:{codigo:'asc'}});
  const grants=await this.db.roles_permisos.findMany();
  const counts=await this.db.usuarios_roles.groupBy({by:['rol'],_count:true});
  return {permisos,roles:roles.map(r=>({...r,permisos:grants.filter(g=>g.id_rol===r.id_rol).map(g=>permisos.find(p=>p.id_permiso===g.id_permiso)!.codigo),usuarios:counts.find(c=>c.rol===r.codigo)?._count??0}))};
 }
 @Post('roles') @Permit('roles.crear')
 async create(@Body() body:unknown,@Req() req:any){
  const d=parse(form,body);
  if(['admin','operador','orientador','supervisor','usuario','seleccion','kiosco','pantalla','ventanilla'].includes(d.codigo.toLowerCase())) throw new ConflictException('Código reservado');
  const r=await this.db.atomic(async tx=>{
   await authorizeGrant(tx,req.actor,d.permisos);
   const found=await tx.permisos.findMany({where:{codigo:{in:d.permisos}}});
   if(found.length!==d.permisos.length) throw new ConflictException('Permiso inexistente');
   const {permisos,...data}=d;const r=await tx.roles.create({data});
   if(found.length) await tx.roles_permisos.createMany({data:found.map(p=>({id_rol:r.id_rol,id_permiso:p.id_permiso}))});
   await audit(tx,req.actor.id_usuario,'CREAR_ROL','roles',r.id_rol,{codigo:r.codigo,permisos});return r;
  });this.events.changed();return r;
 }
 @Patch('roles/:id') @Permit('roles.editar')
 async update(@Param('id',ParseIntPipe) id:number,@Body() body:unknown,@Req() req:any){
  const d=parse(form.omit({codigo:true}),body);
  const r=await this.db.atomic(async tx=>{
   const r=await tx.roles.findUnique({where:{id_rol:id}});if(!r)throw new NotFoundException();
   if(r.codigo==='Admin')throw new ForbiddenException('El rol Admin del sistema está protegido');
   await authorizeGrant(tx,req.actor,[...await permissionsFor(tx,r.codigo),...d.permisos]);
   const assigned=await tx.usuarios.findMany({where:{roles:{some:{rol:r.codigo}}}});
   for(const user of assigned){
    await requireManaged(tx,req.actor,user);
    if(user.id_modulo_asignado!==null && (d.activo===false || !d.permisos.includes('ventanilla.atender')))
     throw new ConflictException('Libera los módulos de los usuarios antes de desactivar o retirar atención de este rol');
   }
   const found=await tx.permisos.findMany({where:{codigo:{in:d.permisos}}});
   if(found.length!==d.permisos.length)throw new ConflictException('Permiso inexistente');
   await tx.roles_permisos.deleteMany({where:{id_rol:id}});
   if(found.length)await tx.roles_permisos.createMany({data:found.map(p=>({id_rol:id,id_permiso:p.id_permiso}))});
   const {permisos,...data}=d;const updated=await tx.roles.update({where:{id_rol:id},data});
   for(const user of assigned) await tx.usuarios.update({where:{id_usuario:user.id_usuario},data:{nivel_admin:await accountLevel(tx,req.actor,d.permisos,user.nivel_admin),version_token:{increment:1}}});
   await audit(tx,req.actor.id_usuario,'EDITAR_ROL','roles',id,{permisos,activo:updated.activo});return updated;
  });this.events.changed();return r;
 }
 @Delete('roles/:id') @Permit('roles.eliminar')
 async remove(@Param('id',ParseIntPipe) id:number,@Req() req:any){
  await this.db.atomic(async tx=>{
   const r=await tx.roles.findUniqueOrThrow({where:{id_rol:id}});
   if(r.es_sistema)throw new ForbiddenException('Los roles del sistema no se eliminan');
   await authorizeGrant(tx,req.actor,await permissionsFor(tx,r.codigo));
   if(await tx.usuarios_roles.count({where:{rol:r.codigo}}))throw new ConflictException('El rol tiene usuarios asignados');
   await tx.roles.delete({where:{id_rol:id}});await audit(tx,req.actor.id_usuario,'ELIMINAR_ROL','roles',id,{codigo:r.codigo});
  });this.events.changed();return {ok:true};
 }
 @Get('privilegios') @Permit('roles.asignar')
 async assignments(@Req() req:any){
  const accounts=await this.db.usuarios.findMany({select:{id_usuario:true,nombre_usuario:true,nombres:true,apellidos:true,activo:true,nivel_admin:true,id_creador:true,roles:true},orderBy:{id_usuario:'asc'}});
  const roles=await this.db.roles.findMany({where:{activo:true},orderBy:{nombre:'asc'}});
  return {roles:roles.map(r=>r.codigo),roles_detalle:roles.map(r=>({codigo:r.codigo,nombre:r.nombre,descripcion:r.descripcion})),cuentas:await Promise.all(accounts.map(async c=>({...c,roles:c.roles.map(r=>r.rol),motivo_proteccion:await managementReason(this.db,req.actor,c)})))};
 }
 @Patch('privilegios/:id') @Permit('roles.asignar')
 async assign(@Param('id',ParseIntPipe) id:number,@Body() body:unknown,@Req() req:any){
  const d=parse(z.object({roles:z.array(z.string().min(1).max(30)).min(1).max(100).refine(v=>new Set(v).size===v.length,'Roles duplicados')}).strict(),body);
  await this.db.atomic(async tx=>{
   const target=await tx.usuarios.findUniqueOrThrow({where:{id_usuario:id},include:{roles:true}});await requireManaged(tx,req.actor,target);
   const valid=await tx.roles.findMany({where:{activo:true,codigo:{in:d.roles}}});
   if(valid.length!==d.roles.length)throw new ConflictException('Selecciona roles activos existentes');
   const ps=[...new Set((await Promise.all(d.roles.map(r=>permissionsFor(tx,r)))).flat())];await authorizeGrant(tx,req.actor,ps);
   if(target.id_modulo_asignado!==null && !ps.includes('ventanilla.atender'))throw new ConflictException('Libera su módulo antes de retirar atención');
   const level=await accountLevel(tx,req.actor,ps,target.nivel_admin);
   if(target.roles.some(r=>r.rol==='Admin')&&target.activo&&!d.roles.includes('Admin')&&await tx.usuarios.count({where:{activo:true,roles:{some:{rol:'Admin'}}}})<=1)throw new ConflictException('Debe existir un Admin activo');
   await tx.usuarios_roles.deleteMany({where:{id_usuario:id}});
   await tx.usuarios_roles.createMany({data:d.roles.map(rol=>({id_usuario:id,rol}))});
   await tx.usuarios.update({where:{id_usuario:id},data:{rol_sistema:d.roles.includes('Admin')?'Admin':d.roles[0],nivel_admin:level,version_token:{increment:1}}});
   await audit(tx,req.actor.id_usuario,'ASIGNAR_ROLES','usuarios',id,{roles:d.roles});
  });this.events.changed();return {ok:true};
 }
}
