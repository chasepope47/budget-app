import React from "react";

function NavButton({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full border text-xs transition
      ${
        active
          ? "border-cyan-400 bg-cyan-500/10 text-cyan-200"
          : "border-slate-600/60 text-slate-300 hover:border-cyan-400/60 hover:text-cyan-200"
      }`}
    >
      {label}
    </button>
  );
}

export default NavButton;
