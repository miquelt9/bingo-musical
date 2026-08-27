import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Toast, ToastAction, ToastContainer } from "@miquelt9/pc-ui";

export interface ShowToastOptions {
  title?: React.ReactNode;
  message: React.ReactNode;
  icon?: React.ReactNode;
  /** Auto-dismiss after ms; omit for manual dismiss only. */
  duration?: number;
  actions?: ToastAction[];
}

interface ToastEntry extends ShowToastOptions {
  id: string;
}

interface ToastContextValue {
  showToast: (options: ShowToastOptions) => string;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((options: ShowToastOptions) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((current) => [...current, { ...options, id }]);
    return id;
  }, []);

  const value = useMemo(() => ({ showToast, dismissToast }), [showToast, dismissToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer position="bottom-right" className="print:hidden">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            title={toast.title}
            icon={toast.icon}
            duration={toast.duration}
            onClose={() => dismissToast(toast.id)}
            actions={toast.actions}
          >
            {toast.message}
          </Toast>
        ))}
      </ToastContainer>
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}
