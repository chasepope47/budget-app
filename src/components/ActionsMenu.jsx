import React, { useState } from "react";
import ThemeSelector from "./ThemeSelector.jsx";

function ActionsMenu({
  customizeMode,
  setCustomizeMode,
  onReset,
  onSignOut,
  themeValue,
  onChangeTheme = () => {},
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        className="flex items-center justify-center w-9 h-9 rounded-full border border-slate-600/70 text-slate-300 hover:border-cyan-400/60 hover:text-cyan-200 transition"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="relative flex flex-col justify-between w-4 h-3">
          <span
            className={`h-[2px] rounded-full bg-current transition-transform duration-200 ${
              open ? "translate-y-[5px] rotate-45" : ""
            }`}
          />
          <span
            className={`h-[2px] rounded-full bg-current transition-opacity duration-200 ${
              open ? "opacity-0" : "opacity-100"
            }`}
          />
          <span
            className={`h-[2px] rounded-full bg-current transition-transform duration-200 ${
              open ? "-translate-y-[5px] -rotate-45" : ""
            }`}
          />
        </span>
      </button>

      <div
        className={`absolute right-0 mt-2 w-52 bg-[#0B0C14] border border-slate-700/70 rounded-lg shadow-lg z-50 text-xs origin-top-right transform transition-all duration-150 ${
          open
            ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
            : "opacity-0 scale-95 -translate-y-1 pointer-events-none"
        }`}
      >
        <div className="px-2 py-2 border-b border-slate-800/70">
          <ThemeSelector
            value={themeValue}
            onChange={onChangeTheme}
            variant="menu"
            onAfterSelect={() => setOpen(false)}
          />
        </div>

        <button
          type="button"
          className="w-full text-left px-3 py-2 hover:bg-slate-800/80 text-slate-200"
          onClick={() => {
            setCustomizeMode((v) => !v);
            setOpen(false);
          }}
        >
          {customizeMode ? "Finish Customizing" : "Customize Layout"}
        </button>

        <button
          type="button"
          className="w-full text-left px-3 py-2 hover:bg-slate-800/80 text-rose-300"
          onClick={() => {
            setOpen(false);
            onReset();
          }}
        >
          Reset Data
        </button>

        <button
          type="button"
          className="w-full text-left px-3 py-2 hover:bg-slate-800/80 text-slate-200"
          onClick={async () => {
            setOpen(false);
            try {
              await onSignOut();
            } catch (err) {
              console.error("Sign out failed:", err);
            }
          }}
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}

export default ActionsMenu;
