import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Briefcase,
  PanelTop,
  Star,
  Contact,
  KeyRound,
  Ticket,
  GitBranch,
  BarChart3,
  ScrollText,
  Monitor,
  Settings2,
  LogOut,
  Menu,
  X,
  UserRound,
  PlusCircle,
} from "lucide-react";
import { useState } from "react";
import { useSession, can } from "../lib/session";
import { useLive } from "../lib/live";
import { Logo, Connection, useToast } from "./ui";
const navigationGroups = [
  { label: "Mi espacio", links: [
    ["/usuario", "Mi espacio", UserRound, ""],
    ["/admin", "Resumen", LayoutDashboard, "admin"],
  ] },
  { label: "Atención al público", links: [
    ["/ventanilla", "Mi ventanilla", PanelTop, "ventanilla.atender"],
    ["/preferencias", "Tickets y preferencias", Star, "preferencias.gestionar"],
    ["/emitir", "Emitir ticket", PlusCircle, "tickets.emitir"],
  ] },
  { label: "Pantalla pública", links: [
    ["/monitor", "Ver pantalla", Monitor, "pantalla.ver"],
    ["/control-pantalla", "Video y anuncios", Settings2, "pantalla.gestionar"],
  ] },
  { label: "Gestión de colas", links: [
    ["/admin/turnos", "Turnos", Ticket, "cola.ver"],
    ["/admin/derivaciones", "Derivaciones", GitBranch, "cola.ver"],
    ["/admin/contribuyentes", "Contribuyentes", Contact, "contribuyentes.ver"],
  ] },
  { label: "Administración", links: [
    ["/admin/usuarios", "Usuarios", Users, "usuarios.ver"],
    ["/admin/servicios", "Servicios", Briefcase, "servicios.ver"],
    ["/admin/modulos", "Módulos", PanelTop, "modulos.ver"],
    ["/admin/tipospreferencia", "Preferencias", Star, "preferencias.gestionar"],
  ] },
  { label: "Roles y permisos", links: [
    ["/admin/roles", "Roles y permisos", KeyRound, "roles.ver"],
    ["/admin/privilegios", "Asignar roles", Users, "roles.asignar"],
  ] },
  { label: "Reportes y control", links: [
    ["/admin/reportes", "Reportes", BarChart3, "reportes.ver"],
    ["/admin/auditoria", "Auditoría", ScrollText, "auditoria.ver"],
  ] },
] as const;
export function Layout() {
  const { actor, logout } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const live = useLive();
  const [mobile, setMobile] = useState(false);
  const [busy, setBusy] = useState(false);
  const groups = navigationGroups.map(group => ({
    label: group.label,
    links: group.links.filter(([, , , permission]) =>
      permission === "" || (permission === "admin"
        ? actor?.rol_sistema === "Admin"
        : can(actor, permission)),
    ),
  })).filter(group => group.links.length > 0);
  async function leave() {
    setBusy(true);
    try {
      await logout();
    } catch {
      toast(
        "Sesión cerrada en este navegador. No se pudo confirmar la revocación en el servidor.",
      );
    } finally {
      navigate("/login", { replace: true });
      setBusy(false);
    }
  }
  return (
    <div className="app-layout">
      <a href="#contenido" className="skip-link">
        Saltar al contenido
      </a>
      {mobile && (
        <button
          className="sidebar-shade"
          aria-label="Cerrar menú"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={"sidebar " + (mobile ? "open" : "")}>
        <Logo />
        <button
          className="mobile-close icon-btn"
          aria-label="Cerrar menú"
          onClick={() => setMobile(false)}
        >
          <X />
        </button>
        <div className="sidebar-groups">
          {groups.map(({ label: groupLabel, links }) => (
            <section className="nav-group" key={groupLabel}>
              <h2 className="nav-label">{groupLabel}</h2>
              <nav aria-label={groupLabel}>
                {links.map(([to, label, Icon]) => (
                  <NavLink end to={to} key={to} onClick={() => setMobile(false)}>
                    <Icon size={19} />
                    {label}
                  </NavLink>
                ))}
              </nav>
            </section>
          ))}
        </div>
        <div className="sidebar-bottom">
          <span className="institution">
            SERVICIO DE ADMINISTRACIÓN
            <br />
            TRIBUTARIA · PUNO
          </span>
          <button className="logout" onClick={leave} disabled={busy}>
            <LogOut size={18} />
            {busy ? "Cerrando…" : "Cerrar sesión"}
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="actions">
            <button
              className="mobile-menu icon-btn"
              aria-label="Abrir menú"
              onClick={() => setMobile(true)}
            >
              <Menu />
            </button>
            <span className="topbar-label">Sistema de gestión de colas</span>
          </div>
          <div className="actions">
            <button className="btn" onClick={() => navigate("/roles")}>Cambiar rol</button>
            <Connection state={live} />
            <div className="userbox">
              <span className="avatar">
                <UserRound size={20} />
              </span>
              <div>
                <strong>{actor?.nombre_usuario ?? "Mi cuenta"}</strong>
                <small>
                  {actor?.rol_sistema}
                  {actor?.rol_sistema === "Admin"
                    ? ` · Nivel ${actor.nivel_admin ?? "—"}`
                    : ""}
                </small>
              </div>
            </div>
          </div>
        </header>
        <main id="contenido" className="page">
          <Outlet />
        </main>
        <footer className="workspace-footer">
          SAT Puno <span>Una atención más ordenada, cercana y oportuna.</span>
        </footer>
      </div>
    </div>
  );
}
