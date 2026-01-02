// src/pages/BalancesDashboard.jsx
import React, { useState } from "react";
import Card from "../components/Card.jsx";
import { computeNetTransactions } from "../lib/accounts.js";

function fmtMoney(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "-";
  return `$${x.toFixed(2)}`;
}

function fmtDate(iso) {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleDateString();
}

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

              const computedBalance =
                (typeof acc.startingBalance === "number" ? acc.startingBalance : 0) +
                net;

              // ✅ Prefer confirmed/currentBalance if present (from statement)
              const hasConfirmed = Number.isFinite(Number(acc.currentBalance));
              const displayBalance = hasConfirmed
                ? Number(acc.currentBalance)
                : computedBalance;

              const asOfLabel = hasConfirmed ? fmtDate(acc.currentBalanceAsOf) : "";
              const statementKey = acc.lastStatementKey || "";
              const lastEnding = Number.isFinite(Number(acc.lastConfirmedEndingBalance))
                ? Number(acc.lastConfirmedEndingBalance)
                : null;

              // last statement entry (if present)
              const statementEntry =
                statementKey &&
                acc.statementBalances &&
                typeof acc.statementBalances === "object"
                  ? acc.statementBalances[statementKey] || null
                  : null;

              const balanceSource = statementEntry?.balanceSource || "";

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
                        onChange={(e) => onRenameAccount(acc.id, e.target.value)}
                      />
                      <p className="text-[11px] text-slate-400">
                        Type: {acc.type || "checking"}
                      </p>

                      {/* ✅ Balance row */}
                      <p className="text-[11px] text-slate-400">
                        Transactions:{" "}
                        <span className="text-slate-200">{txCount}</span> · Net:{" "}
                        <span className={net >= 0 ? "text-emerald-300" : "text-rose-300"}>
                          {fmtMoney(net)}
                        </span>
                        {" · "}
                        Current:{" "}
                        <span
                          className={
                            displayBalance >= 0 ? "text-emerald-300" : "text-rose-300"
                          }
                        >
                          {fmtMoney(displayBalance)}
                        </span>
                        {hasConfirmed ? (
                          <span className="text-slate-500">
                            {" "}
                            (confirmed{asOfLabel ? ` as of ${asOfLabel}` : ""})
                          </span>
                        ) : (
                          <span className="text-slate-500"> (computed)</span>
                        )}
                      </p>

                      {/* ✅ Statement metadata line */}
                      {hasConfirmed && (
                        <p className="text-[11px] text-slate-500">
                          Last statement:{" "}
                          <span className="text-slate-300">
                            {statementKey || "—"}
                          </span>
                          {balanceSource ? (
                            <span className="text-slate-500">
                              {" "}
                              · source:{" "}
                              <span className="text-slate-300">{balanceSource}</span>
                            </span>
                          ) : null}
                          {lastEnding != null ? (
                            <span className="text-slate-500">
                              {" "}
                              · ending:{" "}
                              <span className="text-slate-300">{fmtMoney(lastEnding)}</span>
                            </span>
                          ) : null}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-2">
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

                      {/* ✅ Helper: set starting balance to confirmed current balance */}
                      {hasConfirmed && (
                        <button
                          type="button"
                          className="px-2 py-0.5 rounded text-[11px] border border-slate-500 hover:border-cyan-400 text-slate-200"
                          onClick={() => onSetAccountBalance(acc.id, displayBalance)}
                          title="Sets starting balance to the confirmed current balance"
                        >
                          Use current as starting
                        </button>
                      )}
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
                    {!hasTransactions && (
                      <p className="mt-1 text-[0.65rem] text-slate-500">
                        No transactions imported yet.
                      </p>
                    )}

                    {isExpanded && hasTransactions && (
                      <div className="mt-2 max-h-72 overflow-auto rounded-md border border-slate-800/50">
                        <table className="w-full text-[0.7rem] text-left">
                          <thead className="bg-slate-900 text-slate-300 sticky top-0">
                            <tr>
                              <th className="px-2 py-1">Date</th>
                              <th className="px-2 py-1">Description</th>
                              <th className="px-2 py-1">Category</th>
                              <th className="px-2 py-1 text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/70">
                            {sortedTransactions.map((tx, index) => {
                              const amountValue = Number(tx.amount);
                              const amountDisplay = Number.isFinite(amountValue)
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
                                      amountValue < 0 ? "text-rose-300" : "text-emerald-300"
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
