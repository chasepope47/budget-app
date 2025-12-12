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

function ThemeSelector({
  value,
  onChange,
  variant = "default",
  onAfterSelect = () => {},
}) {
  const [open, setOpen] = useState(false);
  const currentTheme = useMemo(() => getThemeConfig(value), [value]);
  const isMenuVariant = variant === "menu";

  function handleSelect(next) {
    onChange?.(next);
    setOpen(false);
    onAfterSelect?.();
  }

  const buttonClasses = isMenuVariant
    ? "w-full text-left px-3 py-2 text-slate-200 hover:bg-slate-800/80 rounded-md transition"
    : `px-2 py-1 rounded border transition ${currentTheme.pillClass}`;

  const dropdownClasses = `absolute ${
    isMenuVariant ? "left-0" : "right-0"
  } ${isMenuVariant ? "mt-1" : "mt-2"} w-64 rounded-2xl border border-white/15 bg-[#05060F]/95 p-3 shadow-xl backdrop-blur z-50 transition-all duration-150 ${
    open
      ? "opacity-100 translate-y-0 pointer-events-auto"
      : "opacity-0 -translate-y-1 pointer-events-none"
  }`;

  return (
    <div className={`relative text-xs ${isMenuVariant ? "w-full" : ""}`}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={buttonClasses}
      >
        Theme: {currentTheme.label}
      </button>

      <div className={dropdownClasses}>
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
