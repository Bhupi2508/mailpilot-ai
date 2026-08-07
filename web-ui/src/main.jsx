import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./index.css";
import App, { ProtectedRoute } from "./App.jsx";
import Layout from "./components/Layout.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import SendEmail from "./pages/SendEmail.jsx";
import History from "./pages/History.jsx";
import NotFound from "./pages/NotFound.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          {/* Public: OAuth login / landing */}
          <Route index element={<Login />} />

          {/* Protected routes wrapped in the app layout */}
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="dashboard" element={<Dashboard />} />
              <Route
                path="send/separate"
                element={<SendEmail mode="separate" />}
              />
              <Route
                path="send/consolidated"
                element={<SendEmail mode="consolidated" />}
              />
              <Route path="history" element={<History />} />
            </Route>
          </Route>

          {/* 404 catch-all */}
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
