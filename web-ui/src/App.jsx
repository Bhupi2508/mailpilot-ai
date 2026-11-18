import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { useApp } from "./context/AppContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Compose from "./pages/Compose";
import History from "./pages/History";
import BatchDetail from "./pages/BatchDetail";
import NotFound from "./pages/NotFound";
import { API_BASE } from "./api/client";

function RequireAuth() {
  const { user } = useApp();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

function Boot({ children }) {
  const { status, error, reload } = useApp();
  if (status === "loading") {
    return (
      <div className="page page--narrow" style={{ alignItems: "center", paddingTop: "30vh" }}>
        <span className="spinner" style={{ color: "var(--brand)", width: 28, height: 28 }} />
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="page page--narrow" style={{ paddingTop: "18vh" }}>
        <div className="card">
          <h2>{error?.code === "network" ? "Can't connect to the MailPilot API" : "MailPilot couldn't load"}</h2>
          <p className="muted" style={{ margin: "8px 0 16px" }}>
            {error?.message}{" "}
            {error?.code === "network" && (
              <>
                Start everything from the repository root with <code>npm run dev</code>, or check <code>VITE_API_BASE_URL</code> (currently{" "}
                <code>{API_BASE}</code>).
              </>
            )}
          </p>
          <button type="button" className="btn btn--primary" onClick={reload}>
            Try again
          </button>
        </div>
      </div>
    );
  }
  return children;
}

export default function App() {
  return (
    <Boot>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<RequireAuth />}>
          <Route element={<Layout />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/compose" element={<Compose />} />
            <Route path="/history" element={<History />} />
            <Route path="/batches/:id" element={<BatchDetail />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Route>
      </Routes>
    </Boot>
  );
}
