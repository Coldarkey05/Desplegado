import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, PanelTop, Ticket, UserRound } from "lucide-react";
import { useSession, home } from "../lib/session";
import type { Role } from "../lib/types";
import { msg } from "../lib/api";
import { Logo, ErrorNotice } from "../components/ui";
export const roleDetails = {
  Admin: { title: "Administrador", text: "Gestiona usuarios, roles, servicios, módulos y reportes.", icon: ShieldCheck },
  Operador: { title: "Operador", text: "Abre tu ventanilla, atiende turnos y realiza derivaciones.", icon: PanelTop },
  Orientador: { title: "Orientador", text: "Emite tickets y registra la atención preferencial.", icon: Ticket },
  Usuario: { title: "Usuario", text: "Consulta los servicios disponibles de la entidad.", icon: UserRound },
};
export function RoleSelection() {
  const { actor, selectRole, logout } = useSession();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function choose(role: Role) {
    setBusy(true); setError("");
    try { const a = await selectRole(role); navigate(home(a.rol_sistema), { replace: true }); }
    catch(e) { setError(msg(e)); } finally { setBusy(false); }
  }
  return <main className="role-page">
    <Logo sub="Sistema de gestión de colas" />
    <section className="role-content">
      <span className="eyebrow">TU ESPACIO DE TRABAJO</span>
      <h1>Selecciona tu rol</h1>
      <p>Hola, {actor?.nombres || actor?.nombre_usuario}. Elige cómo deseas trabajar. Puedes cambiar de rol desde la cabecera de tu panel.</p>
      {error && <ErrorNotice error={error} />}
      <div className="role-grid">{(actor?.roles ?? []).map(role => {
        const detail = actor?.role_details?.find(r=>r.codigo===role);
        const d = roleDetails[role as keyof typeof roleDetails] ?? {title:detail?.nombre??role,text:detail?.descripcion??"Trabaja con los permisos asignados a este rol.",icon:ShieldCheck};
        const Icon = d.icon;
        return <button key={role} className="role-card" disabled={busy} onClick={() => void choose(role)} aria-label={`Entrar como ${role}`}>
          <Icon size={32} /><h2>{d.title}</h2><p>{d.text}</p><strong>{busy ? "Procesando…" : "Entrar al panel →"}</strong>
        </button>;
      })}</div>
      {!actor?.roles?.length && <p>No tienes roles asignados. Solicita al administrador que revise tu cuenta.</p>}
      <div className="actions">
        {actor?.rol_sistema !== "Seleccion" && <button className="btn" onClick={() => navigate(home(actor!.rol_sistema))}>Volver a mi panel</button>}
        <button className="btn" disabled={busy} onClick={() => { void logout().finally(() => navigate("/login", { replace: true })); }}>Cerrar sesión</button>
      </div>
    </section>
  </main>;
}
