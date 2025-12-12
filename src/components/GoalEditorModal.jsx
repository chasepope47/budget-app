import React, { useEffect, useMemo, useState } from "react";

const THEME_OPTIONS = [
  { key: "cyber", label: "Cyber Cyan", background: "bg-gradient-to-br from-[#041019] via-[#051c25] to-[#03070d]" },
  { key: "sunset", label: "Sunset Glow", background: "bg-gradient-to-br from-orange-500 via-pink-500 to-rose-500" },
  { key: "forest", label: "Forest Echo", background: "bg-gradient-to-br from-[#0f3d2a] via-[#145036] to-[#1e6746]" },
  { key: "midnight", label: "Midnight Pulse", background: "bg-gradient-to-br from-[#09001a] via-[#1b0231] to-[#330057]" },
];

const ICON_CHOICES = ["🎯", "🚀", "🏖️", "📚", "🏡", "💎", "🚗", "🧠"];

const DEFAULT_GOAL = {
  name: "",
  target: 0,
  current: 0,
  monthlyPlan: 0,
  emoji: "🎯",
  description: "",
  dueDate: "",
  theme: THEME_OPTIONS[0].key,
  icon: ICON_CHOICES[0],
  background: THEME_OPTIONS[0].key,
  animation: "pulse",
};

function GoalEditorModal({
  open,
  mode = "create",
  initialGoal = {},
  onClose,
  onSave,
  onDelete,
}) {
  const [form, setForm] = useState(DEFAULT_GOAL);

  useEffect(() => {
    if (!open) return;
    setForm({
      name: initialGoal?.name || "",
      target: Number(initialGoal?.target ?? 0),
      current: Number(initialGoal?.current ?? initialGoal?.saved ?? 0),
      monthlyPlan: Number(initialGoal?.monthlyPlan ?? 0),
      emoji: initialGoal?.emoji || "🎯",
      description: initialGoal?.description || "",
      dueDate: initialGoal?.dueDate || "",
      theme: initialGoal?.theme || THEME_OPTIONS[0].key,
      icon: initialGoal?.icon || ICON_CHOICES[0],
      background: initialGoal?.background || THEME_OPTIONS[0].key,
      animation: initialGoal?.animation || "pulse",
    });
  }, [initialGoal, open]);

  const isEdit = mode === "edit";
  const title = isEdit ? "Edit goal" : "Create new goal";

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleNumber(field, value) {
    const asNumber = Number(value);
    handleChange(field, Number.isFinite(asNumber) ? asNumber : 0);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) {
      handleChange("name", "Untitled goal");
    }
    onSave?.({
      ...form,
      name: form.name.trim() || "Untitled goal",
    });
  }

  const disableActions = !open;
  const progress = useMemo(() => {
    const target = Number(form.target) || 0;
    if (target <= 0) return 0;
    const saved = Math.max(0, Number(form.current) || 0);
    return Math.min(100, (saved / target) * 100);
  }, [form.target, form.current]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <form
        className="w-full max-w-lg space-y-4 rounded-2xl border border-white/10 bg-[#05060F] p-6 text-sm shadow-2xl"
        onSubmit={handleSubmit}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
              {title}
            </p>
            <p className="text-[11px] text-slate-400">
              Track savings progress, target amount, and plans.
            </p>
          </div>
          <button
            type="button"
            className="text-slate-500 hover:text-slate-200 text-base"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs text-slate-400">Goal name</span>
            <input
              type="text"
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
              value={form.name}
              onChange={(e) => handleChange("name", e.target.value)}
              placeholder="Emergency fund"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-slate-400">Emoji</span>
            <input
              type="text"
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
              value={form.emoji}
              onChange={(e) => handleChange("emoji", e.target.value.slice(0, 4))}
              placeholder="🎯"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="space-y-1">
            <span className="text-xs text-slate-400">Target amount</span>
            <input
              type="number"
              min="0"
              step="100"
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
              value={form.target}
              onChange={(e) => handleNumber("target", e.target.value)}
              placeholder="5000"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-slate-400">Saved so far</span>
            <input
              type="number"
              min="0"
              step="50"
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
              value={form.current}
              onChange={(e) => handleNumber("current", e.target.value)}
              placeholder="1000"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-slate-400">Monthly plan</span>
            <input
              type="number"
              min="0"
              step="1"
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
              value={form.monthlyPlan}
              onChange={(e) => handleNumber("monthlyPlan", e.target.value)}
              placeholder="250"
            />
          </label>
        </div>

        <label className="space-y-1 block">
          <span className="text-xs text-slate-400">Description</span>
          <textarea
            rows="3"
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
            value={form.description}
            onChange={(e) => handleChange("description", e.target.value)}
            placeholder="What is this goal for?"
          />
        </label>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs text-slate-400">Target date</span>
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => handleChange("dueDate", e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-cyan-400 focus:outline-none"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-slate-400">Animation style</span>
            <select
              value={form.animation}
              onChange={(e) => handleChange("animation", e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-cyan-400 focus:outline-none"
            >
              <option value="pulse">Pulse</option>
              <option value="glow">Glow</option>
              <option value="slide">Slide</option>
              <option value="wave">Wave</option>
            </select>
          </label>
        </div>

        <div className="space-y-3">
          <label className="block text-xs text-slate-400">Theme</label>
          <div className="grid grid-cols-2 gap-3">
            {THEME_OPTIONS.map((theme) => (
              <button
                type="button"
                key={theme.key}
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    theme: theme.key,
                    background: theme.key,
                  }))
                }
                className={`rounded-xl p-3 text-left transition border ${
                  form.theme === theme.key
                    ? "border-cyan-400 bg-cyan-500/10"
                    : "border-white/10 hover:border-cyan-400/50"
                }`}
              >
                <div
                  className={`h-12 rounded-lg ${theme.background} mb-2`}
                />
                <p className="text-sm text-white">{theme.label}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <span className="text-xs text-slate-400">Icon</span>
          <div className="flex flex-wrap gap-2">
            {ICON_CHOICES.map((choice) => (
              <button
                type="button"
                key={choice}
                onClick={() => handleChange("icon", choice)}
                className={`w-10 h-10 rounded-full border text-lg flex items-center justify-center ${
                  form.icon === choice
                    ? "border-cyan-400 bg-cyan-500/10"
                    : "border-white/10 hover:border-cyan-400/50"
                }`}
              >
                {choice}
              </button>
            ))}
          </div>
        </div>

        <div className="text-xs text-slate-400">
          Progress preview: {progress.toFixed(1)}%
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          {isEdit ? (
            <button
              type="button"
              disabled={disableActions}
              className="text-xs text-rose-300 hover:text-rose-200 disabled:opacity-50"
              onClick={() => {
                if (!initialGoal?.id) return;
                const confirmed = window.confirm(
                  `Delete goal "${initialGoal.name || "this goal"}"?`
                );
                if (confirmed) {
                  onDelete?.(initialGoal.id);
                }
              }}
            >
              Delete goal
            </button>
          ) : (
            <span />
          )}

          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-full border border-slate-600/70 px-4 py-2 text-xs text-slate-300 hover:border-slate-400"
              onClick={onClose}
              disabled={disableActions}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-full bg-cyan-500 px-4 py-2 text-xs font-semibold text-black hover:bg-cyan-400 disabled:opacity-60"
              disabled={disableActions}
            >
              {isEdit ? "Save changes" : "Create goal"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default GoalEditorModal;
