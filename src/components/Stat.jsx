import React from "react";

function Stat({ label, value, accent }) {
  return (
    <div className="flex flex-col">
      <span className="text-[0.65rem] uppercase tracking-[0.22em] text-slate-500">
        {label}
      </span>
      <span className={`text-base font-semibold ${accent}`}>
        ${value.toFixed(2)}
      </span>
    </div>
  );
}

export default Stat;
