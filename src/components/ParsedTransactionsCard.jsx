// src/components/ParsedTransactionsCard.jsx
import React from "react";

function ParsedTransactionsCard({ transactions = [] }) {
  const hasData = Array.isArray(transactions) && transactions.length > 0;

  if (!hasData) {
    return null; // nothing to show if the account has no transactions
  }

  const previewCount = Math.min(50, transactions.length); // or whatever you like

  return (
    <section className="mt-4">
      <h2 className="text-[0.7rem] uppercase tracking-[0.2em] text-slate-500 mb-1">
        Parsed Transactions
      </h2>

      <div className="border border-slate-800 rounded-lg bg-[#05060F] max-h-64 overflow-auto text-[0.75rem]">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-[#05060F]">
            <tr className="border-b border-slate-700">
              <th className="py-1.5 px-3 font-semibold text-slate-300">
                Date
              </th>
              <th className="py-1.5 px-3 font-semibold text-slate-300">
                Description
              </th>
              <th className="py-1.5 px-3 font-semibold text-right text-slate-300">
                Category
              </th>
              <th className="py-1.5 px-3 font-semibold text-right text-slate-300">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {transactions.slice(0, previewCount).map((tx, idx) => (
              <tr
                key={idx}
                className="border-b border-slate-800/60 hover:bg-slate-900/40"
              >
                <td className="py-1.5 px-3 whitespace-nowrap text-slate-200">
                  {tx.date}
                </td>
                <td className="py-1.5 px-3 text-slate-300">
                  {tx.description}
                </td>
                <td className="py-1.5 px-3 text-right text-slate-400">
                  {tx.category || "Other"}
                </td>
                <td
                  className={`py-1.5 px-3 text-right ${
                    tx.amount < 0 ? "text-rose-300" : "text-emerald-300"
                  }`}
                >
                  {tx.amount < 0 ? "-" : ""}
                  ${Math.abs(tx.amount || 0).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default ParsedTransactionsCard;
