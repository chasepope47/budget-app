import React, { useMemo, useState } from "react";
import { THEME_OPTIONS, getThemeConfig } from "../themeConfig.js";

function ThemeOptionCard({ option, active, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(option.key)}
      className={`w-full text-left rounded-xl border px-3 py-2 transition ${
        active
          ? "border-cyan-400 bg-cyan-500/10"
          : "border-white/10 hover:border-cyan-400/60"
      }`}
    >
      <div
        className={`h-10 rounded-lg bg-gradient-to-r ${option.previewGradient} mb-2`}
      />
      <p className="text-sm font-semibold text-white">{option.label}</p>
      <p className="text-[11px] text-slate-300">{option.description}</p>
    </button>
  );
}

function ThemeSelector({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const currentTheme = useMemo(() => getThemeConfig(value), [value]);

  function handleSelect(next) {
    onChange?.(next);
    setOpen(false);
  }

  return (
    <div className="relative text-xs">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`px-2 py-1 rounded border transition ${currentTheme.pillClass}`}
      >
        Theme: {currentTheme.label}
      </button>

      <div
        className={`absolute right-0 mt-2 w-64 rounded-2xl border border-white/15 bg-[#05060F]/95 p-3 shadow-xl backdrop-blur transition-all duration-150 ${
          open
            ? "opacity-100 translate-y-0 pointer-events-auto"
            : "opacity-0 -translate-y-1 pointer-events-none"
        }`}
      >
        <div className="space-y-2">
          {THEME_OPTIONS.map((option) => (
            <ThemeOptionCard
              key={option.key}
              option={option}
              active={option.key === currentTheme.key}
              onSelect={handleSelect}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default ThemeSelector;
