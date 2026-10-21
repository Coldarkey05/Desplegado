import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, Info } from "lucide-react";
import { api, msg } from "../lib/api";
import type { Service } from "../lib/types";
import { useSession, can } from "../lib/session";
import { Loading, ErrorNotice, Empty } from "../components/ui";
export function UserPage() {
  const { actor } = useSession();
  const q = useQuery({
    queryKey: ["services"],
    queryFn: ({ signal }) => api<Service[]>("/servicios", { signal }),
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">MI ESPACIO DE TRABAJO</span>
          <h1>Bienvenido, {actor?.nombre_usuario ?? "usuario"}</h1>
          <p>Consulta los servicios disponibles para la atención.</p>
        </div>
      </div>
      <div className="info-note">
        <Info size={20} />
        <p>
          Estás usando el rol {actor?.rol_sistema}. El menú muestra los permisos de este rol. Para usar otro acceso, pulsa Cambiar rol.
          Si necesitas un rol adicional, solicítalo al administrador.
        </p>
      </div>
      <div className="service-cards">
        {[["ventanilla.atender","/ventanilla","Mi ventanilla"],["tickets.emitir","/emitir","Emitir tickets"],["pantalla.ver","/monitor","Pantalla de atención"],["reportes.ver","/admin/reportes","Reportes"],["roles.ver","/admin/roles","Roles y permisos"]].filter(([p])=>can(actor,p)).map(([p,to,title])=><Link className="panel" to={to} key={p}><h2>{title}</h2><span>Abrir →</span></Link>)}
      </div>
      {q.error && (
        <ErrorNotice error={msg(q.error)} retry={() => void q.refetch()} />
      )}{" "}
      {q.isPending ? (
        <Loading />
      ) : q.data?.length ? (
        <div className="service-cards">
          {q.data.map((s) => (
            <article className="panel" key={s.id_servicio}>
              <Briefcase />
              <h2>{s.nombre_servicio}</h2>
              <p>{s.descripcion || "Atención presencial al contribuyente."}</p>
              <span className="badge success">Disponible</span>
            </article>
          ))}
        </div>
      ) : (
        <Empty title="No hay servicios disponibles" />
      )}
    </>
  );
}
