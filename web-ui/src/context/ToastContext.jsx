import { createContext, useCallback, useContext, useState } from "react";
import Toast from "../components/Toast";

const ToastContext = createContext(() => {});

/** Lightweight global notifications: const toast = useToast(); toast("Saved", "success"). */
export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const show = useCallback((message, type = "info") => setToast({ message, type, id: Date.now() }), []);
  const close = useCallback(() => setToast(null), []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <Toast toast={toast} onClose={close} />
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  return useContext(ToastContext);
}
