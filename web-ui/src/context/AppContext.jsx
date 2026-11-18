import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "../api/client";

/**
 * Holds the server's public config (provider, sign-in methods, limits) and the
 * signed-in user. The session itself lives in an HttpOnly cookie.
 */
const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [state, setState] = useState({ status: "loading", config: null, user: null, account: null, error: null });

  const load = useCallback(async () => {
    try {
      const [config, me] = await Promise.all([api("/config"), api("/auth/me")]);
      setState({ status: "ready", config, user: me.user, account: me.connectedAccount, error: null });
    } catch (err) {
      setState((s) => ({ ...s, status: "error", error: err }));
    }
  }, []);

  useEffect(() => {
    load();
    const onUnauthorized = () => setState((s) => ({ ...s, user: null, account: null }));
    window.addEventListener("mailpilot:unauthorized", onUnauthorized);
    return () => window.removeEventListener("mailpilot:unauthorized", onUnauthorized);
  }, [load]);

  const signedIn = useCallback((me) => setState((s) => ({ ...s, user: me.user, account: me.connectedAccount || null })), []);

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      setState((s) => ({ ...s, user: null, account: null }));
    }
  }, []);

  return <AppContext.Provider value={{ ...state, reload: load, signedIn, logout }}>{children}</AppContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApp() {
  return useContext(AppContext);
}
