import React, { useState } from "react";
import Card from "../components/Card.jsx";
import { computeNetTransactions } from "../lib/accounts.js";

function BalancesDashboard({
  accounts = [],
  currentAccountId,
  onChangeCurrentAccount = () => {},
  onCreateAccount = () => {},
  onDeleteAccount = () => {},
  onSetAccountBalance = () => {},
  onRenameAccount = () => {},
}) {
  const hasAccounts = Array.isArray(accounts) && accounts.length > 0;
  const [expandedAccounts, setExpandedAccounts] = useState([]);

  const toggleAccount = (accountId) => {
    setExpandedAccounts((prev) =>
      prev.includes(accountId)
        ? prev.filter((id) => id !== accountId)
        : [...prev, accountId]
    );
  };

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-100">Accounts</h1>
        <button
          type="button"
          onClick={onCreateAccount}
          className="px-2 py-1 rounded-md bg-emerald-500 hover:bg-emerald-400 text-xs font-medium text-slate-900"
        >
          + New account
        </button>
      </header>

      <Card title="ALL ACCOUNTS">
        {!hasAccounts && (
          <p className="text-xs text-slate-400">
            No accounts yet. Create one to start tracking balances.
          </p>
        )}

        {hasAccounts && (
          <div className="space-y-2">
            {accounts.map((acc) => {
              const txCount = Array.isArray(acc.transactions)
                ? acc.transactions.length
                : 0;
              const net = computeNetTransactions(acc);
              const currentBalance =
                (typeof acc.startingBalance === "number"
                  ? acc.startingBalance
                  : 0) + net;

              const sortedTransactions = Array.isArray(acc.transactions)
                ? acc.transactions
                    .slice()
                    .filter((tx) => tx && typeof tx === "object")
                    .sort((a, b) => {
                      const aTime = Date.parse(a.date);
                      const bTime = Date.parse(b.date);
                      const aValid = Number.isFinite(aTime);
                      const bValid = Number.isFinite(bTime);
                      if (!aValid && !bValid) return 0;
                      if (!aValid) return 1;
                      if (!bValid) return -1;
                      return bTime - aTime;
                    })
                : [];
              const previewTransactions = sortedTransactions.slice(0, 3);
              const hasPreviewTransactions = previewTransactions.length > 0;
              const hasTransactions = sortedTransactions.length > 0;
              const isExpanded = expandedAccounts.includes(acc.id);

              return (
                <div
                  key={acc.id}
                  className={`space-y-2 rounded-md px-3 py-2 text-xs ${
                    acc.id === currentAccountId
                      ? "bg-slate-800/70 border border-cyan-400/50"
                      : "bg-slate-900/60 border border-slate-700/70"
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex-1">
                      <input
                        className="bg-transparent text-slate-100 font-medium text-xs w-full focus:outline-none"
                        value={acc.name}
                        onChange={(e) =>
                          onRenameAccount(acc.id, e.target.value)
                        }
                      />
                      <p className="text-[11px] text-slate-400">
                        Type: {acc.type || "checking"}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Transactions:{" "}
                        <span className="text-slate-200">{txCount}</span> · Net:{" "}
                        <span
                          className={
                            currentBalance >= 0
                              ? "text-emerald-300"
                              : "text-rose-300"
                          }
                        >
                          ${currentBalance.toFixed(2)}
                        </span>
                      </p>
                    </div>

                    <div className="flex flex-col items-end">
                      <label className="text-[11px] text-slate-400">
                        Starting balance
                      </label>
                      <input
                        type="number"
                        className="w-24 bg-slate-900/80 border border-slate-700 rounded px-1 py-0.5 text-right text-xs font-mono text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                        value={acc.startingBalance ?? 0}
                        onChange={(e) =>
                          onSetAccountBalance(
                            acc.id,
                            parseFloat(e.target.value || "0")
                          )
                        }
                      />
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          onChangeCurrentAccount(acc.id);
                          toggleAccount(acc.id);
                        }}
                        className="px-2 py-0.5 rounded text-[11px] border border-slate-500 hover:border-cyan-400"
                      >
                        {isExpanded ? "Hide" : "View"}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteAccount(acc.id)}
                        className="px-2 py-0.5 rounded text-[11px] text-red-300 hover:bg-red-500/10"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <div className="border-t border-slate-800/70 pt-2">
                    <p className="text-[0.6rem] uppercase tracking-[0.18em] text-slate-500">
                      {isExpanded ? "All transactions" : "Recent activity"}
                    </p>
                    {!hasPreviewTransactions && (
                      <p className="mt-1 text-[0.65rem] text-slate-500">
                        No transactions imported yet.
                      </p>
                    )}

                    {hasPreviewTransactions && (
                      <ul className="mt-1 divide-y divide-slate-800/60">
                        {previewTransactions.map((tx, index) => {
                          const amountValue = Number(tx.amount);
                          const amountDisplay = Number.isFinite(amountValue)
                            ? `$${amountValue.toFixed(2)}`
                            : "-";
                          return (
                            <li
                              key={tx.id || `${acc.id}-preview-${index}`}
                              className="flex items-center justify-between py-1 text-[0.7rem]"
                            >
                              <div className="min-w-0 pr-2">
                                <p className="truncate text-slate-100">
                                  {tx.description || "Untitled transaction"}
                                </p>
                                <p className="text-[0.6rem] text-slate-500">
                                  {tx.date || "No date"}
                                  {tx.category
                                    ? ` · ${tx.category}`
                                    : ""}
                                </p>
                              </div>
                              <span
                                className={`font-mono ${
                                  amountValue < 0
                                    ? "text-rose-300"
                                    : "text-emerald-300"
                                }`}
                              >
                                {amountDisplay}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    {isExpanded && hasTransactions && (
                      <div className="mt-2 max-h-72 overflow-auto rounded-md border border-slate-800/50">
                        <table className="w-full text-[0.7rem] text-left">
                          <thead className="bg-slate-900 text-slate-300 sticky top-0">
                            <tr>
                              <th className="px-2 py-1">Date</th>
                              <th className="px-2 py-1">Description</th>
                              <th className="px-2 py-1">Category</th>
                              <th className="px-2 py-1 text-right">
                                Amount
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/70">
                            {sortedTransactions.map((tx, index) => {
                              const amountValue = Number(tx.amount);
                              const amountDisplay = Number.isFinite(
                                amountValue
                              )
                                ? `$${amountValue.toFixed(2)}`
                                : "-";
                              return (
                                <tr key={tx.id || `${acc.id}-full-${index}`}>
                                  <td className="px-2 py-1 text-slate-300">
                                    {tx.date || "-"}
                                  </td>
                                  <td className="px-2 py-1 text-slate-200">
                                    {tx.description || "Transaction"}
                                  </td>
                                  <td className="px-2 py-1 text-slate-400">
                                    {tx.category || "Other"}
                                  </td>
                                  <td
                                    className={`px-2 py-1 text-right ${
                                      amountValue < 0
                                        ? "text-rose-300"
                                        : "text-emerald-300"
                                    }`}
                                  >
                                    {amountDisplay}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

export default BalancesDashboard;
