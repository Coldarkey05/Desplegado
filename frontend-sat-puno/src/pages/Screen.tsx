import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Volume2, VolumeX, ArrowDown, Monitor } from "lucide-react";
import { api, msg } from "../lib/api";
import { useLive } from "../lib/live";
import type { Screen as ScreenData } from "../lib/types";
import {
  Logo,
  Clock,
  Connection,
  Fullscreen,
  ErrorNotice,
  Loading,
  Empty,
} from "../components/ui";
import { DeviceExit } from "./Devices";
export function Screen({
  deviceKey,
  disconnect,
  embedded = false,
}: {
  deviceKey?: string;
  disconnect?: () => void;
  embedded?: boolean;
}) {
  const live = useLive(deviceKey, !!deviceKey);
  const q = useQuery({
    queryKey: [deviceKey ? "device-screen" : "screen"],
    refetchInterval: 5000,
    queryFn: ({ signal }) =>
      api<ScreenData>("/pantalla", {
        signal,
        deviceKey,
        anonymous: !!deviceKey,
      }),
  });
  const container = useRef<HTMLDivElement>(null),
    footerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!footerRef.current) return;
    const observer = new ResizeObserver(([entry]) =>
      container.current?.style.setProperty(
        "--ticker-height",
        `${entry.target.getBoundingClientRect().height}px`,
      ),
    );
    observer.observe(footerRef.current);
    return () => observer.disconnect();
  }, []);
  const [videoError, setVideoError] = useState(false);
  useEffect(
    () => setVideoError(false),
    [q.data?.configuracion.video_url, q.data?.configuracion.revision],
  );
  const videoMode = q.data?.configuracion.modo === "video" && !videoError;
  const expanded = videoMode && q.data?.configuracion.video_expandido;
  const [sound, setSound] = useState(false);
  const last = useRef<bigint | null>(null);
  // El historial se utiliza para el audio, nunca como atención vigente.
  const activeCalls = q.data?.actuales.filter((t) => t.estado === "LLAMADO") ?? [];
  const current = activeCalls[0];
  useEffect(() => {
    const rows = q.data?.ultimos_llamados;
    if (!rows?.length) return;
    const newest = BigInt(rows[0].id_evento);
    if (
      last.current !== null &&
      newest > last.current &&
      sound &&
      "speechSynthesis" in window
    ) {
      const fresh = rows
        .filter((r) => BigInt(r.id_evento) > last.current!)
        .reverse();
      for (const c of fresh) {
        const utter = new SpeechSynthesisUtterance(
          `Turno ${c.codigo_ticket.replace("-", " ")}, diríjase a ${c.numero_modulo}`,
        );
        utter.lang = "es-PE";
        utter.rate = 0.9;
        window.speechSynthesis.speak(utter);
      }
    }
    last.current = newest;
  }, [q.data, sound]);
  useEffect(
    () => () => {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    },
    [],
  );
  function toggle() {
    if (!("speechSynthesis" in window)) return;
    if (sound) window.speechSynthesis.cancel();
    else {
      const u = new SpeechSynthesisUtterance("Avisos de turnos activados");
      u.lang = "es-PE";
      window.speechSynthesis.speak(u);
    }
    setSound(!sound);
  }
  return (
    <div
      ref={container}
      className={
        "screen-page " +
        (embedded ? "embedded " : "") +
        (expanded ? "video-expanded" : "")
      }
    >
      <header className="public-header">
        <Logo sub="Sala de espera · Atención al contribuyente" />
        <div className="actions">
          {!embedded && <Connection state={live} />}
          <button
            className="sound-button"
            onClick={toggle}
            disabled={typeof window.speechSynthesis === "undefined"}
            aria-label={sound ? "Desactivar sonido" : "Activar sonido"}
          >
            {sound ? <Volume2 size={20} /> : <VolumeX size={20} />}
            <span>{sound ? "Sonido activo" : "Activar sonido"}</span>
          </button>
          <Clock />
          <Fullscreen />
        </div>
      </header>
      {q.error && (
        <ErrorNotice
          error={"Información sin actualizar. " + msg(q.error)}
          retry={() => void q.refetch()}
        />
      )}
      <main className="display-grid">
        <section className="display-main">
          {videoMode && (
            <div className="tv-video">
              <video
                key={q.data!.configuracion.video_url}
                src={q.data!.configuracion.video_url}
                autoPlay
                muted
                loop
                playsInline
                disablePictureInPicture
                onError={() => setVideoError(true)}
                aria-label="Video institucional"
              />
            </div>
          )}
          {videoError && (
            <p className="info-note">
              Video no disponible. Mostrando turnos llamados.
            </p>
          )}
          <div className="recent-calls" hidden={videoMode}>
            {activeCalls.slice(1, 4).map((c) => (
              <article key={c.id_turno}>
                <small>También llamado</small>
                <strong>{c.codigo_ticket}</strong>
                <span>{c.numero_modulo}</span>
                <p>{c.nombre_servicio}</p>
              </article>
            ))}
          </div>
          <article className="current-call" hidden={videoMode}>
            <header>
              <span>TURNO LLAMADO</span>
              <span className="call-live">
                <i />
                LLAMADO EN VIVO
              </span>
            </header>
            {q.isPending ? (
              <Loading />
            ) : current ? (
              <div className="call-content">
                <span className="call-label">TURNO</span>
                <strong className="display-ticket" data-testid="display-ticket">
                  {current.codigo_ticket}
                </strong>
                <span className="service-pill">{current.nombre_servicio}</span>
                <div className="destination">
                  <span>DIRÍJASE A</span>
                  <strong>{current.numero_modulo}</strong>
                  <p>
                    <ArrowDown size={21} />
                    Por favor, acérquese a la ventanilla
                  </p>
                </div>
              </div>
            ) : (
              <div className="display-empty">
                <Monitor size={56} />
                <h2>Sin llamados activos</h2>
                <p>Esperando el próximo llamado. Mantén tu ticket a la mano.</p>
              </div>
            )}
          </article>
        </section>
        <aside className="display-queue panel">
          <section className="tv-latest" aria-label="Últimos llamados activos">
            <h2>Últimos llamados</h2>
            <p>Tickets pendientes de iniciar atención</p>
            {activeCalls.slice(0, 4).map((c) => (
              <div key={c.id_turno}>
                <strong>{c.codigo_ticket}</strong>
                <span>{c.numero_modulo}</span>
              </div>
            ))}
            {!activeCalls.length && <p>Sin llamados activos</p>}
          </section>
          <div className="panel-header">
            <div>
              <h2>Próximos turnos</h2>
              <p>Espera atento al llamado de tu ticket.</p>
            </div>
            <span className="count-chip">{q.data?.total_en_espera ?? 0}</span>
          </div>
          {q.data?.proximos.length ? (
            <div className="display-waiting">
              {q.data.proximos.slice(0, 6).map((t, i) => (
                <div key={`${t.codigo_ticket}-${i}`}>
                  <span className="position">{i + 1}</span>
                  <section>
                    <strong>{t.codigo_ticket}</strong>
                    {t.prioridad > 0 && (
                      <small className="badge warning">Preferencial</small>
                    )}
                    <p>{t.nombre_servicio}</p>
                  </section>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="Sin turnos en espera"
              text="Los próximos tickets se mostrarán aquí."
            />
          )}
        </aside>
      </main>
      <footer ref={footerRef} className="public-footer">
        <strong>SAT Puno</strong>
        <div className="ticker-track">
          <div
            className={
              "ticker-content " +
              (q.data?.configuracion.anuncio_desplazable ? "ticker-moving" : "")
            }
            key={q.data?.configuracion.anuncio}
          >
            <span>
              {q.data?.configuracion.anuncio ??
                "Mantén tu ticket a la mano · Espera tu llamado"}
            </span>
            {q.data?.configuracion.anuncio_desplazable && (
              <span aria-hidden="true">{q.data.configuracion.anuncio}</span>
            )}
          </div>
        </div>
        {disconnect && <DeviceExit disconnect={disconnect} />}
      </footer>
    </div>
  );
}
