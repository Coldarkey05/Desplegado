import { RolesPage } from "./pages/Roles";
import { BrowserRouter, Routes, Route, Navigate, Link } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/api";
import { SessionProvider, Guard, useSession, home } from "./lib/session";
import { ToastProvider, Loading } from "./components/ui";
import { Layout } from "./components/Layout";
import { RoleSelection } from "./pages/RoleSelection";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { CatalogPage } from "./pages/Catalog";
import { WindowPage } from "./pages/Window";
import { Records } from "./pages/Records";
import { Reports } from "./pages/Reports";
import { Kiosk } from "./pages/Kiosk";
import { Screen } from "./pages/Screen";
import { ScreenSettingsPage } from "./pages/ScreenSettings";
import { DeviceGate } from "./pages/Devices";
import { Privileges } from "./pages/Privileges";
import { UserPage } from "./pages/User";
function Home() {
  const { actor, loading } = useSession();
  return loading ? (
    <Loading full />
  ) : (
    <Navigate to={actor ? home(actor.rol_sistema) : "/login"} replace />
  );
}
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <SessionProvider>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route element={<Guard />}><Route path="/roles" element={<RoleSelection />} /></Route>
              <Route
                path="/kiosco"
                element={
                  <DeviceGate mode="kiosco">
                    {(key, disconnect) => (
                      <Kiosk deviceKey={key} disconnect={disconnect} />
                    )}
                  </DeviceGate>
                }
              />
              <Route
                path="/pantalla"
                element={
                  <DeviceGate mode="pantalla">
                    {(key, disconnect) => (
                      <Screen deviceKey={key} disconnect={disconnect} />
                    )}
                  </DeviceGate>
                }
              />
              <Route
                element={
                  <Guard
                    
                  />
                }
              >
                <Route element={<Layout />}>
                  <Route element={<Guard roles={["Admin"]} />}>
                    <Route path="/admin" element={<Dashboard />} />

                  </Route>
                  <Route element={<Guard permission="roles.ver" />}><Route path="/admin/roles" element={<RolesPage />} /></Route>
                  <Route element={<Guard permission="roles.asignar" />}><Route path="/admin/privilegios" element={<Privileges />} /></Route>
                  {(["turnos", "derivaciones", "auditoria"] as const).map(
                    (kind) => (
                      <Route
                        key={kind}
                        element={<Guard permission={kind + ".ver"} />}
                      >
                        <Route
                          path={"/admin/" + kind}
                          element={<Records key={kind} kind={kind} />}
                        />
                      </Route>
                    ),
                  )}
                  <Route element={<Guard permission="reportes.ver" />}>
                    <Route path="/admin/reportes" element={<Reports />} />
                  </Route>
                  <Route element={<Guard permission="catalog" />}><Route path="/admin/:resource" element={<CatalogPage />} /></Route>
                  <Route element={<Guard permission="preferencias.gestionar" />}>
                    <Route
                      path="/orientacion"
                      element={<Kiosk orientation />}
                    />
                  </Route>
                  <Route element={<Guard permission="ventanilla.atender" />}>
                    <Route path="/ventanilla" element={<WindowPage />} />
                  </Route>
                  <Route element={<Guard />}>
                    <Route path="/usuario" element={<UserPage />} />
                  </Route>
                  <Route element={<Guard permission="tickets.emitir" />}>
                    <Route path="/emitir" element={<Kiosk />} />
                  </Route>
                  <Route element={<Guard permission="pantalla.gestionar" />}>
                    <Route path="/control-pantalla" element={<ScreenSettingsPage />} />
                  </Route>
                  <Route element={<Guard permission="pantalla.ver" />}>
                    <Route path="/monitor" element={<Screen embedded />} />
                  </Route>
                  <Route element={<Guard permission="preferencias.asignar" />}>
                    <Route
                      path="/preferencias"
                      element={<Kiosk orientation />}
                    />
                  </Route>
                </Route>
              </Route>
              <Route
                path="*"
                element={
                  <main className="center-page">
                    <h1>Página no encontrada</h1>
                    <Link className="btn primary" to="/">
                      Volver al inicio
                    </Link>
                  </main>
                }
              />
            </Routes>
          </SessionProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
