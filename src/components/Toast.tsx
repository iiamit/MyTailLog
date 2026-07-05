"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { CheckIcon, AlertIcon } from "./icons";

type ToastKind = "success" | "error";
type Toast = { id: number; kind: ToastKind; message: string };

type ToastApi = {
  toast: (message: string, kind?: ToastKind) => void;
  success: (message: string) => void;
  error: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

/** App-wide transient feedback. Wrap the app once (root layout). */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, kind: ToastKind = "success") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  const api: ToastApi = {
    toast,
    success: (m) => toast(m, "success"),
    error: (m) => toast(m, "error"),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex max-w-md items-center gap-2 rounded-lg border px-4 py-2.5 text-sm text-ink shadow-lg ${
              t.kind === "success" ? "border-annun-green/40" : "border-annun-red/40"
            }`}
            style={{ background: t.kind === "success" ? "var(--grn-bg)" : "var(--red-bg)" }}
          >
            {t.kind === "success" ? (
              <CheckIcon className="shrink-0 text-annun-green" />
            ) : (
              <AlertIcon className="shrink-0 text-annun-red" />
            )}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Access toasts. Safe no-op if used outside the provider (e.g. tests). */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (ctx) return ctx;
  const noop = () => {};
  return { toast: noop, success: noop, error: noop };
}
