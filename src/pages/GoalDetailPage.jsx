// src/pages/GoalDetailPage.jsx
import React from "react";
import Card from "../components/Card.jsx";
import NeonProgressBar from "../components/NeonProgressBar.jsx";
import GoalActionsMenu from "../components/GoalActionsMenu.jsx";
import GoalCard from "../components/GoalCard.jsx";

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function GoalDetailPage({
  goals = [],
  onSelectGoal = () => {},

  goal,
  mode = "edit", // "create" | "edit"
  onRequestCreateGoal = () => {},

  onEditGoal = () => {},
  onDeleteGoal = () => {},
  onDuplicateGoal = () => {},
  onExportGoal = () => {},
  onAddContributionRequest = () => {},
}) {
  const [view, setView] = React.useState("detail"); // "detail" | "all"
  const createOnceRef = React.useRef(false);

  React.useEffect(() => {
    if (mode !== "create") return;
    if (goal?.id) return;
    if (createOnceRef.current) return;
    createOnceRef.current = true;
    onRequestCreateGoal();
  }, [mode, goal?.id, onRequestCreateGoal]);

  React.useEffect(() => {
    if (!goal?.id) setView("all");
  }, [goal?.id]);

  // ----- ALL GOALS VIEW -----
  if (view === "all") {
    const list = Array.isArray(goals) ? goals : [];

    return (
      <div className="space-y-5">
        <header className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold text-slate-100">All Goals</h1>
            <p className="text-xs text-slate-400">
              Select a goal to view details, or create a new one.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {goal?.id && (
              <button
                type="button"
                className="px-3 py-1.5 rounded-md border border-slate-700 text-xs text-slate-200 bg-slate-900/40 hover:border-cyan-400/70 transition"
                onClick={() => setView("detail")}
              >
                Back to goal
              </button>
            )}

            <button
              type="button"
              className="px-3 py-1.5 rounded-md border border-cyan-400/70 text-xs text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 transition"
              onClick={() => {
                onRequestCreateGoal();
                setView("detail");
              }}
            >
              + New Goal
            </button>
          </div>
        </header>

        {list.length === 0 ? (
          <Card title="NO GOALS YET">
            <p className="text-sm text-slate-300">
              You don’t have any goals yet. Create one to get started.
            </p>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {list.map((g) => (
              <GoalCard
                key={g.id}
                goal={g}
                onClick={() => {
                  onSelectGoal(g.id);
                  setView("detail");
                }}
                onEdit={() => {
                  onSelectGoal(g.id);
                  setView("detail");
                }}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ----- DETAIL VIEW -----
  if (!goal) {
    return (
      <div className="space-y-4">
        <Card title="GOALS">
          <p className="text-sm text-slate-300">No goal selected.</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setView("all")}
              className="px-4 py-2 rounded-lg border border-slate-700 text-xs text-slate-200 bg-slate-900/40 hover:border-cyan-400/70 transition"
            >
              View all goals
            </button>
            <button
              type="button"
              onClick={onRequestCreateGoal}
              className="px-4 py-2 rounded-lg border border-cyan-400/70 text-xs text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 transition"
            >
              + Create a goal
            </button>
          </div>
        </Card>
      </div>
    );
  }

  const saved = num(goal?.saved ?? goal?.current ?? 0, 0);
  const target = num(goal?.target ?? 0, 0);
  const monthlyPlan = num(goal?.monthlyPlan ?? 0, 0);
  const displayEmoji = goal?.icon || goal?.emoji || "🎯";
  const displayName = goal?.name || "Untitled Goal";
  const progress = target > 0 ? Math.min(100, (saved / target) * 100) : 0;

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{displayEmoji}</span>
            <div>
              <h1 className="text-xl font-semibold text-slate-100">
                {displayName}
              </h1>
              <p className="text-xs text-slate-400">
                Personalized goal view – future: themed backgrounds & animations.
              </p>
            </div>
          </div>
        </div>

        <GoalActionsMenu
          onViewAll={() => setView("all")}
          onEdit={() => onEditGoal(goal?.id)}
          onDelete={() => goal?.id && onDeleteGoal(goal.id)}
          onDuplicate={() => onDuplicateGoal(goal?.id)}
          onExport={() => onExportGoal(goal?.id)}
        />
      </header>

      <Card title="PROGRESS">
        <div className="flex flex-col gap-2 text-sm">
          <span className="text-slate-200">
            ${saved.toFixed(2)} / ${target.toFixed(2)}
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
            ${monthlyPlan.toFixed(2)}
          </span>
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Later we'll calculate this based on your income, expenses and due date.
        </p>

        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            className="px-3 py-1.5 text-xs rounded-md border border-pink-400/70 text-pink-200 bg-pink-500/10 hover:bg-pink-500/20 transition"
            onClick={() => onAddContributionRequest(goal?.id)}
          >
            Add Contribution
          </button>
        </div>
      </Card>
    </div>
  );
}

export default GoalDetailPage;
