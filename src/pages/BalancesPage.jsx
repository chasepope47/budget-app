// src/pages/BalancesPage.jsx
import React from "react";
import Card from "../components/Card.jsx";
import NeonProgressBar from "../components/NeonProgressBar.jsx";
import ParsedTransactionsCard from "../components/ParsedTransactionsCard.jsx";

function computeNetTransactions(account) {
  const txs = Array.isArray(account?.transactions)
    ? account.transactions
    : [];
  return txs.reduce(
    (sum, tx) => sum + (typeof tx.amount === "number" ? tx.amount : 0),
    0
  );
}

function BalancesDashboard({
  accounts = [],
  currentAccountId,
  onChangeCurrentAccount = () => {},
  onCreateAccount = () => {},
  onDeleteAccount = () => {},
  onSetAccountBalance,
  onRenameAccount = () => {},
}) {
  const rows = (accounts || []).map((acc) => {
    const starting =
      typeof acc.startingBalance === "number" ? acc.startingBalance : 0;
    const net = computeNetTransactions(acc);
    const balance = starting + net;
    return { ...acc, starting, net, balance };
  });

  const totalBalance = rows.reduce((sum, r) => sum + r.balance, 0);
  const currentRow =
    rows.find((r) => r.id === currentAccountId) || rows[0] || null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">
            Accounts
          </h1>
          <span className="text-xs text-slate-400">
            Manage your accounts, balances, and estimated totals
          </span>
        </div>

        {accounts.length > 0 && (
          <div className="flex flex-col items-end gap-1">
            <span className="text-[0.6rem] uppercase tracking-[0.18em] text-slate-500">
              Current account
            </span>

            <div className="flex items-center gap-2">
              <select
                className="bg-[#05060F] border border-slate-700 text-xs rounded-md px-2 py-1 text-slate-100"
                value={currentAccountId}
                onChange={(e) => onChangeCurrentAccount(e.target.value)}
              >
                {accounts.map((acct) => (
                  <option key={acct.id} value={acct.id}>
                    {acct.name}
                  </option>
                ))}
              </select>

              <button
                className="text-xs px-2 py-1 rounded-md border border-cyan-500/70 text-cyan-200 hover:bg-cyan-500/10 transition"
                onClick={onCreateAccount}
              >
                + New
              </button>

              <button
                className="text-xs px-2 py-1 rounded-md border border-rose-500/70 text-rose-300 hover:bg-rose-500/10 transition"
                onClick={() => onDeleteAccount(currentAccountId)}
              >
                Delete
              </button>
            </div>

            {currentRow && (
              <div className="flex items-center gap-2 text-[0.7rem] text-slate-400">
                <span>
                  Balance:{" "}
                  <span className="text-cyan-300 font-semibold">
                    ${currentRow.balance.toFixed(2)}
                  </span>
                </span>
                <button
                  className="underline decoration-dotted hover:text-cyan-300"
                  onClick={() => {
                    const input = window.prompt(
                      `Set starting balance for "${currentRow.name}" (e.g. 1234.56):`,
                      currentRow.starting.toFixed(2)
                    );
                    if (input == null) return;
                    const value = Number(input);
                    if (Number.isNaN(value)) {
                      alert("That didn’t look like a number.");
                      return;
                    }
                    onSetAccountBalance(currentRow.id, value + currentRow.net);
                  }}
                >
                  Set starting balance
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <Card title="TOTAL ESTIMATED CASH">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[0.7rem] uppercase tracking-[0.2em] text-slate-500">
              Across all accounts
            </div>
            <div className="mt-1 text-3xl font-semibold text-cyan-300">
              ${totalBalance.toFixed(2)}
            </div>
          </div>
        </div>
        {rows.length > 0 && (
          <div className="mt-4">
            <NeonProgressBar value={100} />
            <p className="mt-1 text-[0.7rem] text-slate-500">
              Based on starting balances + imported transactions.
            </p>
          </div>
        )}
        {rows.length === 0 && (
          <p className="mt-2 text-xs text-slate-400">
            No accounts yet. Add one to start tracking.
          </p>
        )}
      </Card>

      {rows.length > 0 && (
        <>
          <h2 className="text-xs tracking-[0.25em] text-slate-400 uppercase">
            Accounts
          </h2>

          <div className="grid md:grid-cols-2 gap-4">
            {rows.map((row) => {
              const share =
                totalBalance > 0
                  ? Math.max(0, Math.min(100, (row.balance / totalBalance) * 100))
                  : 0;

              const isCurrent = row.id === currentAccountId;

              return (
                <section
                  key={row.id}
                  className={`bg-[#090a11] border rounded-xl p-4 transition cursor-pointer ${
                    isCurrent
                      ? "border-cyan-400/80 shadow-[0_0_18px_rgba(34,211,238,0.45)]"
                      : "border-slate-800 hover:border-cyan-400/70 hover:shadow-[0_0_18px_rgba(34,211,238,0.35)]"
                  }`}
                  onClick={() => onChangeCurrentAccount(row.id)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="text-[0.65rem] uppercase tracking-[0.2em] text-slate-500">
                        {row.type || "checking"}
                      </div>
                      <input
                        className="mt-0.5 bg-transparent border-b border-slate-700 text-sm font-medium text-slate-100 focus:outline-none focus:border-cyan-400"
                        value={row.name}
                        onChange={(e) =>
                          onRenameAccount(row.id, e.target.value)
                        }
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>

                    <div className="text-right">
                      <div className="text-[0.65rem] uppercase tracking-[0.2em] text-slate-500">
                        Balance
                      </div>
                      <div className="text-lg font-semibold text-cyan-300">
                        ${row.balance.toFixed(2)}
                      </div>
                    </div>
                  </div>

                  <div className="text-[0.7rem] text-slate-400 mb-2">
                    <span className="mr-3">
                      Start:{" "}
                      <span className="text-slate-200">
                        ${row.starting.toFixed(2)}
                      </span>
                    </span>
                    <span>
                      Net tx:{" "}
                      <span
                        className={
                          row.net < 0 ? "text-rose-300" : "text-emerald-300"
                        }
                      >
                        {row.net < 0 ? "-" : ""}
                        ${Math.abs(row.net).toFixed(2)}
                      </span>
                    </span>
                  </div>

                  {/* Parsed transactions for the selected account */}
                  {currentRow && (
                    <ParsedTransactionsCard
                      transactions={
                        Array.isArray(currentRow.transactions)
                          ? currentRow.transactions
                          : []
                      }
                    />
                  )}

                  <NeonProgressBar value={share} />
                  <div className="mt-1 flex justify-between items-center text-[0.7rem] text-slate-500">
                    <span>{share.toFixed(1)}% of total cash</span>
                    <button
                      className="text-cyan-300 underline decoration-dotted hover:text-cyan-200"
                      onClick={(e) => {
                        e.stopPropagation();
                        const input = window.prompt(
                          `Set current balance for "${row.name}" (e.g. 1234.56):`,
                          row.balance.toFixed(2)
                        );
                        if (input == null) return;
                        const value = Number(input);
                        if (Number.isNaN(value)) {
                          alert("That didn't look like a number.");
                          return;
                        }
                        onSetAccountBalance(row.id, value);
                      }}
                    >
                      Set estimated balance
                    </button>
                  </div>
                  
                  {/* Only show transactions for the selected account */}
                  {isCurrent && (
                    <div className="mt-3">
                      <ParsedTransactionsCard
                        transactions={
                          Array.isArray(row.transactions) ? row.transactions : []
                        }
                      />
                    </div>
                  )}
                  </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default BalancesDashboard;
