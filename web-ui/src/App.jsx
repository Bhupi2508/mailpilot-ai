import { Navigate, Outlet, useLocation } from "react-router-dom";
import "./App.css";

/**
 * Route guard: requires a valid session (JWT + user) stored in
 * sessionStorage. Unauthenticated users are redirected to the login page.
 */
function ProtectedRoute() {
  const location = useLocation();
  const token = sessionStorage.getItem("jwt");
  const user = (() => {
    try {
      return JSON.parse(sessionStorage.getItem("mailpilot_user") || "null");
    } catch {
      return null;
    }
  })();

  if (!token || !user) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

export default function App() {
  return <Outlet />;
}

export { ProtectedRoute };
