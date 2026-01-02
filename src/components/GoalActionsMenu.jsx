// src/components/GoalActionsMenu.jsx
import React, { useState } from "react";

function GoalActionsMenu({ onViewAll, onEdit, onDelete, onDuplicate, onExport }) {
  const [open, setOpen] = useState(false);

  function handleDelete() {
    setOpen(false);
    onDelete?.();
  }

  return (
    <div className="relative">
      <button
        type="button"
        className="rounded-full border border-slate-600/70 px-3 py-1 text-xs text-slate-300 hover:border-cyan-400/60"
        onClick={() => setOpen((prev) => !prev)}
      >
        Manage goal ▾
      </button>

      <div
        className={`absolute right-0 mt-2 w-40 rounded-xl border border-slate-700/70 bg-[#05060F] text-xs shadow-lg transition-all duration-150 ${
          open
            ? "opacity-100 translate-y-0 pointer-events-auto"
            : "opacity-0 -translate-y-1 pointer-events-none"
        }`}
      >
        <button
          type="button"
          className="block w-full px-3 py-2 text-left text-slate-200 hover:bg-slate-800/70"
          onClick={() => {
            setOpen(false);
            onViewAll?.();
          }}
        >
          View all goals
        </button>

        <div className="h-px bg-slate-800/80" />

        <button
          type="button"
          className="block w-full px-3 py-2 text-left text-slate-200 hover:bg-slate-800/70"
          onClick={() => {
            setOpen(false);
            onEdit?.();
          }}
        >
          Edit goal
        </button>

        <button
          type="button"
          className="block w-full px-3 py-2 text-left text-slate-200 hover:bg-slate-800/70"
          onClick={() => {
            setOpen(false);
            onDuplicate?.();
          }}
        >
          Duplicate goal
        </button>

        <button
          type="button"
          className="block w-full px-3 py-2 text-left text-slate-200 hover:bg-slate-800/70"
          onClick={() => {
            setOpen(false);
            onExport?.();
          }}
        >
          Export progress
        </button>

        <button
          type="button"
          className="block w-full px-3 py-2 text-left text-rose-300 hover:bg-slate-800/70"
          onClick={() => {
            if (!window.confirm("Delete this goal?")) return;
            handleDelete();
          }}
        >
          Delete goal
        </button>
      </div>
    </div>
  );
}

export default GoalActionsMenu;
