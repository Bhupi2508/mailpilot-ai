import { defineConfig, loadEnv } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, "");
  return {
    plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
    server: {
      port: 5173,
      // In development the UI calls /api on its own origin and Vite forwards it
      // to the backend, so cookies stay same-origin and no CORS is needed.
      proxy: {
        "/api": { target: env.DEV_API_PROXY_TARGET || "http://localhost:3400", changeOrigin: false },
      },
    },
  };
});
