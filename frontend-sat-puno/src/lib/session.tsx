import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { Navigate, Outlet, useParams } from "react-router-dom";
import { api, sessionKey, queryClient, msg, token } from "./api";
import type { Actor, Role } from "./types";
import { ErrorNotice, Loading } from "../components/ui";
const home = (role: Role) => role === "Seleccion" ? "/roles" : role === "Admin" ? "/admin" : role === "Operador" ? "/ventanilla" : role === "Orientador" ? "/orientacion" : "/usuario";
export { home };
type Session = {
  actor: Actor | null;
  loading: boolean;
  login: (name: string, password: string) => Promise<Actor>;
  logout: () => Promise<void>;
  selectRole: (role: Role) => Promise<Actor>;
};
const Context = createContext<Session>(null!);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [actor, setActor] = useState<Actor | null>(null);
  const [loading, setLoading] = useState(true);
  const [restoreError, setRestoreError] = useState("");
  const clear = () => {
    sessionStorage.removeItem(sessionKey);
    setActor(null);
    queryClient.clear();
  };
  async function restore() {
    setLoading(true);
    setRestoreError("");
    let saved: any;
    try {
      saved = JSON.parse(sessionStorage.getItem(sessionKey) || "null");
    } catch {
      clear();
    }
    if (!saved?.token) {
      setLoading(false);
      return;
    }
    try {
      const a = await api<Actor>("/auth/me");
      setActor({ ...a, nombre_usuario: saved.name });
    } catch (e) {
      if (sessionStorage.getItem(sessionKey)) setRestoreError(msg(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void restore();
    const expired = () => {
      clear();
      setRestoreError("");
      setLoading(false);
    };
    window.addEventListener("sat:expired", expired);
    return () => window.removeEventListener("sat:expired", expired);
  }, []);
  useEffect(() => {
    if (!actor) return;
    const update = () => {
      const requestedToken = token();
      void api<Actor>("/auth/me")
        .then((a) => { if (token() === requestedToken) setActor((old) => (old ? { ...old, ...a } : null)); })
        .catch(() => {});
    };
    const timer = setInterval(update, 10000);
    window.addEventListener("focus", update);
    window.addEventListener("sat:permissions", update);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", update);
      window.removeEventListener("sat:permissions", update);
    };
  }, [actor?.id_usuario]);
  async function login(name: string, password: string) {
    const r = await api<{ access_token: string; usuario: Actor }>(
      "/auth/login",
      {
        method: "POST",
        body: { nombre_usuario: name, password },
        anonymous: true,
      },
    );
    queryClient.clear();
    sessionStorage.setItem(
      sessionKey,
      JSON.stringify({ token: r.access_token, name: r.usuario.nombre_usuario }),
    );
    setActor(r.usuario);
    return r.usuario;
  }
  async function selectRole(role: Role) {
    const r = await api<{ access_token: string; usuario: Actor }>("/auth/seleccionar-rol", { method: "POST", body: { rol: role } });
    await queryClient.cancelQueries();
    queryClient.clear();
    sessionStorage.setItem(sessionKey, JSON.stringify({ token: r.access_token, name: r.usuario.nombre_usuario }));
    setActor(r.usuario);
    return r.usuario;
  }
  async function logout() {
    try {
      await api("/auth/logout", { method: "POST", body: {} });
    } finally {
      clear();
    }
  }
  return (
    <Context.Provider value={{ actor, loading, login, logout, selectRole }}>
      {restoreError ? (
        <main className="center-page">
          <ErrorNotice error={restoreError} retry={restore} />
          <button
            className="btn"
            onClick={() => {
              clear();
              setRestoreError("");
            }}
          >
            Volver al ingreso
          </button>
        </main>
      ) : (
        children
      )}
    </Context.Provider>
  );
}
export const useSession = () => useContext(Context);
export function Guard({
  roles,
  permission,
}: {
  roles?: Role[];
  permission?: string;
}) {
  const { resource } = useParams();
  const { actor, loading } = useSession();
  if (loading) return <Loading full />;
  if (!actor) return <Navigate to="/login" replace />;
  if (
    (roles && !roles.includes(actor.rol_sistema)) || (!roles && location.pathname !== "/roles" && actor.rol_sistema === "Seleccion") ||
    (permission &&
      !can(actor, permission === "catalog" ? `${resource}.ver` : permission))
  )
    return <Navigate to={home(actor.rol_sistema)} replace />;
  return <Outlet />;
}

const aliases:Record<string,string>={
 "turnos.ver":"cola.ver","derivaciones.ver":"cola.ver","turnos.cancelar":"tickets.cancelar","preferencias.asignar":"preferencias.gestionar",
 ...Object.fromEntries(["servicios","modulos","contribuyentes"].flatMap(r=>["crear","editar","eliminar"].map(a=>[`${r}.${a}`,`${r}.gestionar`]))),
 ...Object.fromEntries(["ver","crear","editar","eliminar"].map(a=>[`tipospreferencia.${a}`,"preferencias.gestionar"]))
};
export function can(actor:Actor|null|undefined,p:string){return !!actor?.permisos?.includes(aliases[p]??p);}
