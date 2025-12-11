import React from "react";

function Toast({ message, variant = "info", actionLabel, onAction, onClose }) {
  const isSuccess = variant === "success";

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-xs sm:max-w-sm">
      <div
        className={`toast-enter flex items-start gap-3 rounded-xl border px-4 py-3 text-xs shadow-xl bg-[#05060F]/95 backdrop-blur
        ${
          isSuccess
            ? "border-emerald-400/80 text-emerald-100"
            : "border-cyan-400/80 text-cyan-100"
        }`}
      >
        <div className="mt-[2px] text-lg">
          {isSuccess ? "✅" : "ℹ️"}
        </div>

        <div className="flex-1 space-y-1">
          <p className="leading-snug">{message}</p>

          {actionLabel && onAction && (
            <button
              onClick={onAction}
              className="inline-flex items-center gap-1 text-[0.7rem] mt-1 px-2 py-1 rounded-full border border-cyan-400/70 text-cyan-100 hover:bg-cyan-500/10 hover:border-cyan-300 transition"
            >
              <span>{actionLabel}</span>
              <span className="text-[0.75rem]">↗</span>
            </button>
          )}
        </div>

        {onClose && (
          <button
            className="ml-1 text-[0.7rem] text-slate-500 hover:text-slate-200"
            onClick={onClose}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

export default Toast;
