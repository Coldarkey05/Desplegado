import type { Row } from "./types";
export type Field = {
  key: string;
  label: string;
  type?:
    | "text"
    | "textarea"
    | "email"
    | "password"
    | "boolean"
    | "number"
    | "select"
    | "multiselect";
  required?: boolean;
  createOnly?: boolean;
  max?: number;
  min?: number;
  options?: string[];
  reference?: string;
  nullable?: boolean;
  default?: unknown;
  hint?: string;
};
export type Catalog = {
  title: string;
  singular: string;
  id: string;
  description: string;
  fields: Field[];
  columns: {
    key: string;
    label: string;
    reference?: string;
    kind?: "boolean" | "badge" | "date";
  }[];
};
const named = { key: "nombres", label: "Nombres", required: true, max: 100 };
const surname = {
  key: "apellidos",
  label: "Apellidos",
  required: true,
  max: 100,
};
const dni = { key: "dni", label: "DNI", required: true, max: 8 };
const active: Field = {
  key: "activo",
  label: "Activo",
  type: "boolean",
  default: true,
};
export const catalogs: Record<string, Catalog> = {
  servicios: {
    title: "Servicios",
    singular: "servicio",
    id: "id_servicio",
    description: "Operaciones disponibles para la atención al contribuyente.",
    fields: [
      {
        key: "nombre_servicio",
        label: "Nombre del servicio",
        required: true,
        max: 100,
      },
      {
        key: "descripcion",
        label: "Descripción",
        type: "textarea",
        max: 255,
        nullable: true,
      },
      active,
    ],
    columns: [
      { key: "nombre_servicio", label: "Servicio" },
      { key: "descripcion", label: "Descripción" },
      { key: "activo", label: "Estado", kind: "boolean" },
    ],
  },
  modulos: {
    title: "Módulos",
    singular: "módulo",
    id: "id_modulo",
    description:
      "Ventanillas, servicios asignados y disponibilidad de atención.",
    fields: [
      {
        key: "numero_modulo",
        label: "Nombre / número de módulo",
        required: true,
        max: 20,
      },
      {
        key: "servicios_ids",
        label: "Servicios habilitados",
        type: "multiselect",
        default: [],
        reference: "servicios",
        nullable: true,
      },
      {
        key: "estado",
        label: "Estado",
        type: "select",
        options: ["Disponible", "Cerrado"],
        default: "Cerrado",
        required: true,
        hint: "Ocupado se establece automáticamente durante la atención.",
      },
    ],
    columns: [
      { key: "numero_modulo", label: "Módulo" },
      {
        key: "servicios_ids",
        label: "Servicios",
        reference: "servicios",
      },
      { key: "estado", label: "Estado", kind: "badge" },
    ],
  },
  usuarios: {
    title: "Usuarios",
    singular: "usuario",
    id: "id_usuario",
    description:
      "Datos personales y cuenta de acceso en un solo registro. Asigna varios roles desde Asignar roles.",
    fields: [
      dni,
      named,
      surname,
      {
        key: "rol_sistema",
        label: "Rol del sistema",
        type: "select",
        createOnly: true,
        reference: "roles",
        default: "Usuario",
        required: true,
        hint: "Selecciona un rol activo. Puedes añadir otros desde Asignar roles.",
      },
      {
        key: "id_modulo_asignado",
        label: "Módulo asignado",
        type: "select",
        reference: "modulos",
        nullable: true,
        hint: "Se puede cambiar al editar si no hay una atención activa. Requiere un rol con permiso de atención. El módulo nuevo queda cerrado.",
      },
      {
        key: "nombre_usuario",
        label: "Nombre de usuario",
        required: true,
        min: 3,
        max: 50,
      },
      {
        key: "password",
        label: "Contraseña",
        type: "password",
        required: true,
        min: 12,
        max: 72,
        hint: "12 a 72 caracteres (máximo 72 bytes). Al editar, deja vacío para conservarla.",
      },
      {
        key: "correo",
        label: "Correo",
        type: "email",
        max: 100,
        nullable: true,
      },
      active,
    ],
    columns: [
      { key: "dni", label: "DNI" },
      { key: "nombres", label: "Nombres" },
      { key: "apellidos", label: "Apellidos" },
      { key: "nombre_usuario", label: "Cuenta" },
      { key: "roles", label: "Roles asignados" },
      { key: "nivel_admin", label: "Nivel Admin" },
      { key: "id_modulo_asignado", label: "Módulo", reference: "modulos" },
      { key: "activo", label: "Estado", kind: "boolean" },
    ],
  },
  tipospreferencia: {
    title: "Tipos de preferencia",
    singular: "tipo de preferencia",
    id: "id_tipo_preferencia",
    description:
      "Prioridad de atención: un número mayor tiene mayor preferencia.",
    fields: [
      { key: "nombre_tipo", label: "Nombre del tipo", required: true, max: 50 },
      {
        key: "prioridad",
        label: "Prioridad (0 a 100)",
        type: "number",
        required: true,
        min: 0,
        max: 100,
        default: 1,
        hint: "0 = regular. La categoría Ninguna conserva prioridad 0.",
      },
    ],
    columns: [
      { key: "nombre_tipo", label: "Tipo de preferencia" },
      { key: "prioridad", label: "Prioridad" },
    ],
  },
  contribuyentes: {
    title: "Contribuyentes",
    singular: "contribuyente",
    id: "id_contribuyente",
    description:
      "Datos de identificación y condición de atención preferencial.",
    fields: [
      dni,
      named,
      surname,
      {
        key: "id_tipo_preferencia",
        label: "Tipo de preferencia",
        type: "select",
        reference: "tipospreferencia",
        required: true,
      },
    ],
    columns: [
      { key: "dni", label: "DNI" },
      { key: "nombres", label: "Nombres" },
      { key: "apellidos", label: "Apellidos" },
      {
        key: "id_tipo_preferencia",
        label: "Preferencia",
        reference: "tipospreferencia",
      },
      { key: "fecha_registro", label: "Registro", kind: "date" },
    ],
  },
};
export function rowLabel(resource: string, row: Row) {
  if (resource === "roles") return row.nombre ?? row.codigo;
  if (resource === "usuarios")
    return (
      ([row.nombres, row.apellidos].filter(Boolean).join(" ") ||
        `Usuario #${row.id_usuario}`) + (row.dni ? ` · ${row.dni}` : "")
    );
  return (
    row.nombre_servicio ??
    row.numero_modulo ??
    row.nombre_tipo ??
    row.nombre_usuario ??
    ""
  );
}
