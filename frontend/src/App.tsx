import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import LoginPage from "./components/LoginPage";
import DialogProvider from "./components/DialogProvider";
import RequireAdmin from "./components/RequireAdmin";
import DomainFlowsPage from "./pages/DomainFlowsPage";
import DomainNavPage from "./pages/DomainNavPage";
import FlowMapPage from "./pages/FlowMapPage";
import FlowGuidePage from "./pages/FlowGuidePage";

// 管理端页面懒加载：viewer 不下载设计器等管理代码（隔离 + 减小只读端体积）
const FlowDesignerPage = lazy(() => import("./pages/FlowDesignerPage"));
const LedgersPage = lazy(() => import("./pages/LedgersPage"));

const pageFallback = (
  <div className="page-canvas grid place-items-center text-sm text-slate-400">加载中…</div>
);

export default function App() {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return pageFallback;
  }
  if (!user) {
    return <LoginPage />;
  }
  return (
    <DialogProvider><Routes>
      <Route path="/" element={<DomainNavPage user={user} onLogout={logout} />} />
      <Route path="/domains/:id" element={<DomainFlowsPage user={user} onLogout={logout} />} />
      <Route
        path="/flows/:id/edit"
        element={
          <RequireAdmin user={user}>
            <Suspense fallback={pageFallback}>
              <FlowDesignerPage user={user} onLogout={logout} />
            </Suspense>
          </RequireAdmin>
        }
      />
      <Route path="/flows/:id" element={<FlowMapPage user={user} onLogout={logout} />} />
      <Route path="/flows/:id/guide" element={<FlowGuidePage user={user} onLogout={logout} />} />
      <Route
        path="/ledgers"
        element={
          <RequireAdmin user={user}>
            <Suspense fallback={pageFallback}>
              <LedgersPage user={user} onLogout={logout} />
            </Suspense>
          </RequireAdmin>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes></DialogProvider>
  );
}
