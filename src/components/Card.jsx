import React from "react";

function Card({ title, children }) {
  return (
    <section className="card-surface border rounded-xl p-4">
      {title && (
        <h2 className="text-xs font-semibold tracking-[0.25em] text-slate-400 mb-3 uppercase">
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

export default Card;
