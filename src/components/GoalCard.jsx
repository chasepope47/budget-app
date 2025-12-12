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

function GoalCard({ goal, onClick }) {
  const saved = Number(goal?.saved ?? goal?.current ?? 0);
  const target = Number(goal?.target ?? 0);
  const monthlyPlan = Number(goal?.monthlyPlan ?? 0);
  const displayEmoji = goal?.icon || goal?.emoji || "🎯";
  const displayName = goal?.name || "Untitled Goal";
  const progress = target > 0 ? Math.min(100, (saved / target) * 100) : 0;
  const themeClass = getThemeStyles(goal?.theme);

  return (
    <button
      onClick={onClick}
      className={`text-left rounded-xl p-3 hover:border-cyan-400/70 hover:shadow-[0_0_18px_rgba(34,211,238,0.35)] transition ${themeClass}`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="text-lg">{displayEmoji}</span>
          <span className="text-sm font-medium text-slate-100">
            {displayName}
          </span>
        </div>
        <span className="text-[0.7rem] text-slate-400">
          Plan: ${monthlyPlan.toFixed(0)}/mo
        </span>
      </div>

      <div className="text-xs text-slate-400 mb-1">
        ${saved.toFixed(0)} / ${target.toFixed(0)}
      </div>
      <NeonProgressBar value={progress} />
    </button>
  );
}

export default GoalCard;
