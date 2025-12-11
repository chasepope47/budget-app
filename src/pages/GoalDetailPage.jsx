import React from "react";
import Card from "../components/Card.jsx";
import NeonProgressBar from "../components/NeonProgressBar.jsx";

function GoalDetailPage({ goal }) {
  const progress = (goal.saved / goal.target) * 100;

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{goal.emoji}</span>
          <h1 className="text-xl font-semibold text-slate-100">
            {goal.name}
          </h1>
        </div>
        <p className="text-xs text-slate-400">
          Personalized goal view – future: themed backgrounds & animations.
        </p>
      </header>

      <Card title="PROGRESS">
        <div className="flex flex-col gap-2 text-sm">
          <span className="text-slate-200">
            ${goal.saved.toFixed(2)} / ${goal.target.toFixed(2)}
          </span>
          <NeonProgressBar value={progress} />
          <span className="text-xs text-slate-400">
            {progress.toFixed(1)}% complete
          </span>
        </div>
      </Card>

      <Card title="PLAN">
        <p className="text-sm text-slate-200">
          Recommended monthly contribution:
          <span className="ml-1 text-cyan-300 font-semibold">
            ${goal.monthlyPlan.toFixed(2)}
          </span>
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Later we'll calculate this based on your income, expenses and due
          date.
        </p>

        <div className="mt-3 flex gap-2">
          <button className="px-3 py-1.5 text-xs rounded-md border border-pink-400/70 text-pink-200 bg-pink-500/10 hover:bg-pink-500/20 transition">
            Add Contribution
          </button>
          <button className="px-3 py-1.5 text-xs rounded-md border border-slate-600 text-slate-200 hover:border-slate-400 transition">
            Edit Goal
          </button>
        </div>
      </Card>
    </div>
  );
}

export default GoalDetailPage;
