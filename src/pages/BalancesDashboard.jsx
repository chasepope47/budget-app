import React from "react";
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
  onViewAccount = () => {},
}) {
  const hasAccounts = Array.isArray(accounts) && accounts.length > 0;

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

              return (
              <div
                key={acc.id}
                className={`flex items-center justify-between gap-3 rounded-md px-3 py-2 text-xs ${
                  acc.id === currentAccountId
                    ? "bg-slate-800/70 border border-cyan-400/50"
                    : "bg-slate-900/60 border border-slate-700/70"
                }`}
              >
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
                      onViewAccount(acc.id);
                    }}
                    className="px-2 py-0.5 rounded text-[11px] border border-slate-500 hover:border-cyan-400"
                  >
                    View
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
            );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

export default BalancesDashboard;
