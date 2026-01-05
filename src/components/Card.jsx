// src/components/Card.jsx
import React from "react";

function Card({ title, actions = null, className = "", children }) {
  return (
    <section className={`card-surface border rounded-xl p-4 ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 mb-3">
          {title ? (
            <h2 className="text-xs font-semibold tracking-[0.25em] text-slate-400 uppercase">
              {title}
            </h2>
          ) : (
            <div />
          )}

          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}

export default Card;
