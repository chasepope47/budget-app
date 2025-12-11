import React from "react";
import { formatMoney, formatPercent } from "../utils/format.js";

function NeonProgressBar({ value = 0 }) {
  const clamped = Math.max(0, Math.min(100, Number.isNaN(value) ? 0 : value));

  return (
    <div className="progress-bar">
      <div
        className="progress-bar-filled"
        style={{ width: `${clamped}%` }}
      >
        {clamped > 2 && <div className="progress-shine shine" />}
      </div>
    </div>
  );
}

export default NeonProgressBar;
