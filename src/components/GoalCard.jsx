import React from "react";
import NeonProgressBar from "./NeonProgressBar.jsx";

function getThemeStyles(themeKey) {
  switch (themeKey) {
    case "sunset":
      return "bg-gradient-to-br from-orange-500/70 via-pink-500/60 to-rose-500/60 border-rose-400/60";
    case "forest":
      return "bg-gradient-to-br from-emerald-900/70 via-emerald-800/60 to-emerald-700/60 border-emerald-400/60";
    case "midnight":
      return "bg-gradient-to-br from-indigo-900/70 via-purple-900/60 to-indigo-900/70 border-indigo-400/60";
    case "cyber":
    default:
      return "bg-[#090a11] border-slate-800";
  }
}

function GoalCard({ goal, onClick, onEdit }) {
  const saved = Number(goal?.saved ?? goal?.current ?? 0);
  const target = Number(goal?.target ?? 0);
  const monthlyPlan = Number(goal?.monthlyPlan ?? 0);
  const displayEmoji = goal?.icon || goal?.emoji || "🎯";
  const displayName = goal?.name || "Untitled Goal";
  const progress = target > 0 ? Math.min(100, (saved / target) * 100) : 0;
  const themeClass = getThemeStyles(goal?.theme);

  const canClick = typeof onClick === "function";
  const canEdit = typeof onEdit === "function";

  return (
    <div
      className={`relative rounded-xl border p-3 ${themeClass} ${
        canClick
          ? "hover:border-cyan-400/70 hover:shadow-[0_0_18px_rgba(34,211,238,0.35)] transition"
          : ""
      }`}
    >
      <button
        type="button"
        onClick={canClick ? onClick : undefined}
        className={`w-full text-left ${
          canClick ? "cursor-pointer" : "cursor-default"
        }`}
        aria-label={canClick ? `Open goal ${displayName}` : `Goal ${displayName}`}
      >
        <div className="flex items-center justify-between mb-1.5 pr-10">
          <div className="flex items-center gap-2">
            <span className="text-lg">{displayEmoji}</span>
            <span className="text-sm font-medium text-slate-100">
              {displayName}
            </span>
          </div>
          <span className="text-[0.7rem] text-slate-400">
            Plan: ${Number.isFinite(monthlyPlan) ? monthlyPlan.toFixed(0) : "0"}/mo
          </span>
        </div>

        <div className="text-xs text-slate-400 mb-1">
          ${Number.isFinite(saved) ? saved.toFixed(0) : "0"} / $
          {Number.isFinite(target) ? target.toFixed(0) : "0"}
        </div>

        <NeonProgressBar value={progress} />
      </button>

      {canEdit && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onEdit(goal?.id);
          }}
          className="absolute top-2 right-2 px-2 py-1 rounded-md border border-slate-700/80 bg-slate-900/40 text-slate-100 text-xs hover:border-cyan-400/70 hover:bg-slate-900/60 transition"
          aria-label="Edit goal"
          title="Edit"
        >
          ✏️
        </button>
      )}
    </div>
  );
}

export default GoalCard;
