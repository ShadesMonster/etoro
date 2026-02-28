"use client";

import { useToastStore, ToastType } from "@/lib/toast";

const TOAST_STYLES: Record<ToastType, { bg: string; border: string; icon: string }> = {
  success: { bg: "rgba(34, 197, 94, 0.1)", border: "#22c55e", icon: "^" },
  error: { bg: "rgba(239, 68, 68, 0.1)", border: "#ef4444", icon: "!" },
  warning: { bg: "rgba(234, 179, 8, 0.1)", border: "#eab308", icon: "~" },
  info: { bg: "rgba(99, 102, 241, 0.1)", border: "#6366f1", icon: "i" },
};

export default function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => {
        const style = TOAST_STYLES[toast.type];
        return (
          <div
            key={toast.id}
            className="toast-enter rounded-lg px-4 py-3 text-sm shadow-lg flex items-start gap-3 cursor-pointer"
            style={{
              background: style.bg,
              border: `1px solid ${style.border}`,
              backdropFilter: "blur(12px)",
            }}
            onClick={() => removeToast(toast.id)}
          >
            <span
              className="font-bold text-xs w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
              style={{ background: style.border, color: "#fff" }}
            >
              {style.icon}
            </span>
            <span style={{ color: "#e5e7eb" }}>{toast.message}</span>
          </div>
        );
      })}
    </div>
  );
}
