export type Role = string;
export type Actor = {
  permisos: string[];
  nivel_admin?: number | null;
  id_creador?: number | null;
  id_usuario: number;
  rol_sistema: Role;
  roles: Role[];
  role_details?: {
    codigo: string;
    nombre: string;
    descripcion: string | null;
  }[];
  nombres?: string;
  apellidos?: string;
  nombre_usuario?: string;
};
export type Row = Record<string, any>;
export type Page<T = Row> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
};
export type Service = {
  id_servicio: number;
  nombre_servicio: string;
  descripcion: string | null;
  activo?: boolean;
};
export type Ticket = {
  id_turno: number;
  codigo_ticket: string;
  fecha_jornada: string;
  fecha_hora_emision: string;
  id_servicio: number;
  estado: string;
  id_modulo_atencion: number | null;
  intentos_llamado?: number;
  fecha_hora_inicio_atencion?: string | null;
  contribuyente?: Row | null;
  prioridad?: number;
};
export type WindowState = {
  modulo: Row | null;
  retiro_pendiente: boolean;
  turno_actual: Ticket | null;
  en_espera: number;
  finalizados_hoy: number;
  derivados_hoy: number;
  proximos: Ticket[];
};
export type ScreenConfig = {
  id: number;
  modo: "turnos" | "video";
  video_url: string;
  video_expandido: boolean;
  anuncio: string;
  anuncio_desplazable: boolean;
  revision: number;
};
export type Screen = {
  configuracion: ScreenConfig;
  fecha: string;
  actuales: {
    id_turno: number;
    codigo_ticket: string;
    estado: string;
    intentos_llamado: number;
    fecha_hora_llamado: string;
    nombre_servicio: string;
    numero_modulo: string;
  }[];
  ultimos_llamados: {
    id_evento: string;
    codigo_ticket: string;
    fecha: string;
    nombre_servicio: string;
    numero_modulo: string;
  }[];
  proximos: {
    prioridad: number;
    codigo_ticket: string;
    id_servicio: number;
    nombre_servicio: string;
    id_modulo_destino: number | null;
  }[];
  total_en_espera: number;
};
export type DeviceMode = "kiosco" | "pantalla";
