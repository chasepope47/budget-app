import React from "react";

function Card({ title, children }) {
  return (
    <section className="bg-[#0B0C14] border border-slate-800/80 rounded-xl p-4 shadow-[0_0_20px_rgba(0,255,224,0.08)]">
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
