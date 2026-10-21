import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Eye,
  EyeOff,
  ShieldCheck,
  Ticket,
  PanelTop,
  Monitor,
} from "lucide-react";
import { useSession, home } from "../lib/session";
import { Logo, ErrorNotice, Loading } from "../components/ui";
import { msg } from "../lib/api";
export function Login() {
  const { actor, loading, login } = useSession();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const nav = useNavigate();
  if (loading) return <Loading full />;
  if (actor) return <Navigate to={home(actor.rol_sistema)} replace />;
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const a = await login(name.trim(), password);
      nav(home(a.rol_sistema), { replace: true });
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-story">
        <Logo sub="Servicio de Administración Tributaria" />
        <div className="story-main">
          <span className="eyebrow light">AL SERVICIO DE PUNO</span>
          <h1>
            Una mejor atención
            <br />
            <em>comienza aquí.</em>
          </h1>
          <p>
            Organiza cada turno. Acompaña a cada contribuyente. Todo tu equipo,
            conectado.
          </p>
          <div className="story-line">
            <span>
              <Ticket />
              Turnos ordenados
            </span>
            <span>
              <PanelTop />
              Ventanillas conectadas
            </span>
            <span>
              <ShieldCheck />
              Acceso por roles
            </span>
          </div>
        </div>
        <span className="login-foot">
          Sistema de gestión de colas · SAT Puno
        </span>
      </section>
      <section className="login-form-wrap">
        <form className="login-form" onSubmit={submit}>
          <span className="eyebrow">BIENVENIDO AL SISTEMA</span>
          <h2>Iniciar sesión</h2>
          <p className="muted">
            Ingresa con la cuenta asignada por tu administrador.
          </p>
          {error && <ErrorNotice error={error} />}
          <label>
            Nombre de usuario
            <input
              autoComplete="username"
              required
              maxLength={50}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tu nombre de usuario"
              disabled={busy}
            />
          </label>
          <label>
            Contraseña
            <div className="password-input">
              <input
                type={visible ? "text" : "password"}
                autoComplete="current-password"
                required
                maxLength={72}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Ingresa tu contraseña"
                disabled={busy}
              />
              <button
                type="button"
                className="icon-btn"
                aria-label={
                  visible ? "Ocultar contraseña" : "Mostrar contraseña"
                }
                onClick={() => setVisible(!visible)}
              >
                {visible ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </label>
          <button className="btn primary full" disabled={busy}>
            {busy ? "Ingresando…" : "Ingresar al sistema"}
            <ArrowRight size={19} />
          </button>
          <p className="login-help">
            <ShieldCheck size={16} /> Después de ingresar, selecciona uno de tus roles.
          </p>
          <div className="login-device-links">
            <Link to="/kiosco">
              <Ticket size={18} />
              Kiosco de turnos
            </Link>
            <Link to="/pantalla">
              <Monitor size={18} />
              Pantalla de atención
            </Link>
          </div>
          <p className="small muted">
            ¿No puedes ingresar? Solicita al administrador que revise tu cuenta.
          </p>
        </form>
      </section>
    </main>
  );
}
