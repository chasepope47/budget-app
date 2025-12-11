import React from "react";
import NeonProgressBar from "./NeonProgressBar.jsx";

function GoalCard({ goal, onClick }) {
  const progress = (goal.saved / goal.target) * 100;

  return (
    <button
      onClick={onClick}
      className="text-left bg-[#090a11] border border-slate-800 rounded-xl p-3 hover:border-cyan-400/70 hover:shadow-[0_0_18px_rgba(34,211,238,0.35)] transition"
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="text-lg">{goal.emoji}</span>
          <span className="text-sm font-medium text-slate-100">
            {goal.name}
          </span>
        </div>
        <span className="text-[0.7rem] text-slate-400">
          Plan: ${goal.monthlyPlan.toFixed(0)}/mo
        </span>
      </div>

      <div className="text-xs text-slate-400 mb-1">
        ${goal.saved.toFixed(0)} / ${goal.target.toFixed(0)}
      </div>
      <NeonProgressBar value={progress} />
    </button>
  );
}

export default GoalCard;
