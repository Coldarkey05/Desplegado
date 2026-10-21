import React, { Component, type ReactNode } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./cloud.css";
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <main className="center-page">
        <h1>No se pudo mostrar esta vista</h1>
        <p>
          Recarga la página. Si estabas emitiendo un ticket, usa la opción de
          reintento para recuperar la operación.
        </p>
        <button
          className="btn primary"
          onClick={() => window.location.reload()}
        >
          Recargar
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
