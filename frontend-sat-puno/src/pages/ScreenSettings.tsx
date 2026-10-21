import { ScreenControls } from "../components/ScreenControls";

export function ScreenSettingsPage() {
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">PANTALLA PÚBLICA</span>
          <h1>Control de pantalla pública</h1>
          <p>Configura el video y los anuncios que se muestran en las pantallas de atención.</p>
        </div>
      </div>
      <ScreenControls />
    </>
  );
}
