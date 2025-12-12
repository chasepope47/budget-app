import React, { useState, useEffect } from "react";

function ContributionModal({ open, goal, onAdd, onClose }) {
  const [amount, setAmount] = useState("");

  useEffect(() => {
    if (open) {
      setAmount("");
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#05060F] p-5 shadow-2xl text-sm">
        <header className="mb-4">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
            Add contribution
          </p>
          <h2 className="text-base font-semibold text-slate-100">
            {goal?.emoji} {goal?.name || "Goal"}
          </h2>
          <p className="text-[11px] text-slate-400">
            Log a manual contribution to update your saved amount.
          </p>
        </header>

        <label className="block text-xs text-slate-400 mb-1">Amount</label>
        <input
          type="number"
          min="0"
          step="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
          placeholder="150"
        />

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-full border border-slate-600/70 px-3 py-1 text-xs text-slate-300 hover:border-slate-400"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-full bg-cyan-500 px-4 py-1 text-xs font-semibold text-black hover:bg-cyan-400 disabled:opacity-60"
            onClick={() => onAdd?.(amount)}
            disabled={!amount || Number(amount) <= 0}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

export default ContributionModal;
