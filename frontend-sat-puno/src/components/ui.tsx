import {
  useRef,
  useEffect,
  useState,
  createContext,
  useContext,
  type ReactNode,
} from "react";
import {
  X,
  Check,
  AlertCircle,
  Inbox,
  LoaderCircle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Maximize,
} from "lucide-react";
export function Logo({ sub = "Gestión de colas" }: { sub?: string }) {
  return (
    <div className="brand">
      <div className="brand-logo">S</div>
      <div>
        <strong>SAT Puno</strong>
        <small>{sub}</small>
      </div>
    </div>
  );
}
export function Badge({ value }: { value?: string | null }) {
  const kind =
    /activo|disponible|finalizado|en atencion/i.test(value ?? "") &&
    !/inactivo/i.test(value ?? "")
      ? "success"
      : /cerrado|cancelado|no presentado|inactivo/i.test(value ?? "")
        ? "danger"
        : /llamado|ocupado|espera/i.test(value ?? "")
          ? "warning"
          : "info";
  return (
    <span className={"badge " + kind}>
      <i />
      {value ?? "Sin definir"}
    </span>
  );
}
export function Loading({ full = false }: { full?: boolean }) {
  return (
    <div className={full ? "center-page" : "loading"} role="status">
      <LoaderCircle className="spin" size={28} /> Cargando…
    </div>
  );
}
export function ErrorNotice({
  error,
  retry,
}: {
  error: string;
  retry?: () => unknown;
}) {
  return (
    <div className="error-notice" role="alert">
      <AlertCircle size={20} />
      <span>{error}</span>
      {retry && (
        <button className="btn small" onClick={() => void retry()}>
          <RefreshCw size={15} /> Reintentar
        </button>
      )}
    </div>
  );
}
export function Empty({
  title = "Sin registros",
  text = "Los registros aparecerán aquí cuando estén disponibles.",
}: {
  title?: string;
  text?: string;
}) {
  return (
    <div className="empty">
      <Inbox size={35} />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  busy = false,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "modal wide" : "modal"}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="modal-header">
        <h2>{title}</h2>
        <button
          aria-label="Cerrar diálogo"
          disabled={busy}
          onClick={onClose}
          className="icon-btn"
        >
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Confirm({
  title,
  text,
  onClose,
  onConfirm,
  busy,
  error,
}: {
  title: string;
  text: string;
  onClose: () => void;
  onConfirm: () => unknown;
  busy: boolean;
  error?: string;
}) {
  return (
    <Modal title={title} onClose={onClose} busy={busy}>
      <div className="modal-body">
        <p>{text}</p>
        {error && <ErrorNotice error={error} />}
      </div>
      <div className="modal-footer">
        <button className="btn" onClick={onClose} disabled={busy}>
          Volver
        </button>
        <button
          className="btn danger"
          onClick={() => void onConfirm()}
          disabled={busy}
        >
          {busy ? "Procesando…" : "Confirmar"}
        </button>
      </div>
    </Modal>
  );
}
export function Pager({
  page,
  total,
  limit,
  setPage,
}: {
  page: number;
  total: number;
  limit: number;
  setPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="pager">
      <span>
        {total} registros · Página {page} de {pages}
      </span>
      <div className="actions">
        <button
          className="btn small"
          aria-label="Página anterior"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
        >
          <ChevronLeft size={16} />
        </button>
        <button
          className="btn small"
          aria-label="Página siguiente"
          disabled={page >= pages}
          onClick={() => setPage(page + 1)}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
export function Stat({
  title,
  value,
  icon,
  detail,
}: {
  title: string;
  value: ReactNode;
  icon: ReactNode;
  detail?: string;
}) {
  return (
    <article className="stat">
      <div className="stat-icon">{icon}</div>
      <div>
        <span>{title}</span>
        <strong>{value}</strong>
        {detail && <small>{detail}</small>}
      </div>
    </article>
  );
}
export function Connection({ state }: { state: string }) {
  return (
    <span className={"connection " + state}>
      <i />
      {state === "online"
        ? "En tiempo real"
        : state === "offline"
          ? "Reconectando"
          : "Conectando"}
    </span>
  );
}
export function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="clock">
      <strong>
        {now.toLocaleTimeString("es-PE", {
          timeZone: "America/Lima",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })}
      </strong>
      <small>
        {now.toLocaleDateString("es-PE", {
          timeZone: "America/Lima",
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
      </small>
    </div>
  );
}
export function Fullscreen() {
  return (
    <button
      className="icon-btn"
      title="Pantalla completa"
      aria-label="Pantalla completa"
      onClick={() => {
        if (document.fullscreenElement)
          void document.exitFullscreen().catch(() => {});
        else
          void document.documentElement.requestFullscreen?.().catch(() => {});
      }}
    >
      <Maximize size={20} />
    </button>
  );
}
const ToastContext = createContext<(text: string) => void>(() => {});
export const useToast = () => useContext(ToastContext);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [text, setText] = useState("");
  useEffect(() => {
    if (!text) return;
    const t = setTimeout(() => setText(""), 5000);
    return () => clearTimeout(t);
  }, [text]);
  return (
    <ToastContext.Provider value={setText}>
      {children}
      {text && (
        <div className="toast" role="status">
          <Check size={18} />
          {text}
          <button
            className="icon-btn"
            aria-label="Cerrar aviso"
            onClick={() => setText("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </ToastContext.Provider>
  );
}
