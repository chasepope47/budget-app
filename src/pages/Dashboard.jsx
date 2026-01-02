// src/pages/Dashboard.jsx
import React from "react";
import Card from "../components/Card.jsx";
import NeonProgressBar from "../components/NeonProgressBar.jsx";
import GoalCard from "../components/GoalCard.jsx";
import BankImportCard from "../components/BankImportCard.jsx";
import Stat from "../components/Stat.jsx";

// ✅ NEW
import BalancePromptModal from "../components/BalancePromptModal.jsx";
import {
  getStatementDateRange,
  sumAmounts,
  isoDate,
  statementKeyFromRange,
} from "../lib/statementMath.js";

const DEFAULT_DASHBOARD_SECTIONS = [
  "monthOverview",
  "accountSnapshot",
  "goals",
  "csvImport",
];

function Dashboard({
  month = "",
  income = 0,
  fixed = 0,
  variable = 0,
  leftover = 0,
  goals = [],
  transactions = [],
  accounts = [],
  currentAccountId,
  onChangeCurrentAccount = () => {},
  onOpenGoal = () => {},
  onCreateGoal = () => {},
  onCsvImported = () => {},
  onTransactionsParsed,
  currentAccountBalance = 0,
  totalBalance = 0,
  sectionsOrder,
}) {
  const handleImport = onCsvImported || onTransactionsParsed || (() => {});
  const safeIncome = Number(income) || 0;
  const safeFixed = Number(fixed) || 0;
  const safeVariable = Number(variable) || 0;
  const safeLeftover = Number(leftover) || 0;
  const safeCurrentAccountBalance = Number(currentAccountBalance) || 0;
  const safeTotalBalance = Number(totalBalance) || 0;

  const allocatedPercent =
    safeIncome > 0 ? ((safeIncome - safeLeftover) / safeIncome) * 100 : 0;

  const order =
    sectionsOrder && sectionsOrder.length
      ? sectionsOrder
      : DEFAULT_DASHBOARD_SECTIONS;

  const hasAccountTransactions =
    Array.isArray(transactions) && transactions.length > 0;

  const [showAccountTransactions, setShowAccountTransactions] =
    React.useState(false);

  React.useEffect(() => {
    setShowAccountTransactions(false);
  }, [transactions]);

  // ✅ NEW: balance modal state
  const [balanceModalOpen, setBalanceModalOpen] = React.useState(false);
  const [balanceModalBusy, setBalanceModalBusy] = React.useState(false);
  const [pendingImport, setPendingImport] = React.useState(null);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-100">{month}</h1>
        <span className="text-xs text-slate-400">
          Overview of this month's money flow
        </span>
      </div>

      {order.map((sectionKey) => {
        switch (sectionKey) {
          case "monthOverview":
            return (
              <Card key="monthOverview" title="MONTH OVERVIEW">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <Stat label="Income" value={safeIncome} accent="text-emerald-300" />
                  <Stat label="Fixed" value={safeFixed} accent="text-rose-300" />
                  <Stat
                    label="Variable"
                    value={safeVariable}
                    accent="text-amber-300"
                  />
                  <Stat
                    label="Leftover"
                    value={safeLeftover}
                    accent="text-cyan-300"
                  />
                </div>

                <div className="mt-4">
                  <p className="text-xs text-slate-400 mb-1">Allocation this month</p>
                  <NeonProgressBar value={allocatedPercent} />
                </div>
              </Card>
            );

          case "accountSnapshot":
            return (
              <Card key="accountSnapshot" title="ACCOUNT SNAPSHOT">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[0.65rem] uppercase tracking-[0.18em] text-slate-500">
                      Current account
                    </span>

                    <select
                      className="mt-1 bg-[#05060F] border border-slate-700 rounded-md px-2 py-1 text-[0.75rem] text-slate-100"
                      value={currentAccountId}
                      onChange={(e) => onChangeCurrentAccount(e.target.value)}
                    >
                      {(accounts || []).map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="text-right">
                    <div className="text-[0.65rem] uppercase tracking-[0.18em] text-slate-500">
                      Balance
                    </div>
                    <div className="text-2xl font-semibold text-cyan-300">
                      ${safeCurrentAccountBalance.toFixed(2)}
                    </div>
                    <div className="text-[0.7rem] text-slate-500">
                      of ${safeTotalBalance.toFixed(2)} total
                    </div>
                  </div>
                </div>

                <hr className="my-3 border-slate-800" />

                <div>
                  <div className="text-[0.65rem] uppercase tracking-[0.2em] text-slate-500">
                    All accounts
                  </div>
                  <div className="mt-1 text-xl font-semibold text-emerald-300">
                    ${safeTotalBalance.toFixed(2)}
                  </div>
                  <p className="mt-1 text-[0.7rem] text-slate-500">
                    Total estimated cash across all linked accounts.
                  </p>
                </div>
              </Card>
            );

          case "goals":
            return (
              <div key="goals" className="space-y-3">
                <h2 className="text-xs tracking-[0.25em] text-slate-400 uppercase">
                  Goals
                </h2>

                <div className="grid md:grid-cols-2 gap-3">
                  {(Array.isArray(goals) ? goals : []).map((goal) => (
                    <GoalCard
                      key={goal.id}
                      goal={goal}
                      onClick={null}
                      onEdit={() => onOpenGoal(goal.id)}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  onClick={onCreateGoal}
                  className="mt-1 px-4 py-2 rounded-lg border border-cyan-400/70 text-xs text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 transition"
                >
                  + Add Goal
                </button>
              </div>
            );

          case "csvImport":
            return (
              <Card key="csvImport" title="BANK STATEMENT IMPORT (CSV)">
                <BankImportCard
                  onTransactionsParsed={async (rows, raw) => {
                    setShowAccountTransactions(false);

                    const transactionSum = sumAmounts(rows, "amount");
                    const range = getStatementDateRange(rows, "date");
                    const statementKey = statementKeyFromRange(range);

                    const currentAcc =
                      (accounts || []).find((a) => a.id === currentAccountId) ||
                      null;

                    // ✅ If CSV has a running/ending balance column, skip modal entirely
                    const lastBalanceRow = [...(rows || [])]
                      .reverse()
                      .find(
                        (tx) =>
                          typeof tx?.balance === "number" &&
                          Number.isFinite(tx.balance)
                      );

                    if (lastBalanceRow) {
                      const endingBalance = Number(lastBalanceRow.balance);
                      const startingBalance = endingBalance - Number(transactionSum || 0);

                      const startISO = range?.start ? isoDate(range.start) : "";
                      const endISO = range?.end ? isoDate(range.end) : "";

                      await handleImport(rows, {
                        ...raw,
                        accountId: currentAccountId,
                        statement: {
                          startISO,
                          endISO,
                          statementKey,
                          transactionSum,
                          endingBalance,
                          startingBalance,
                          balanceSource: "csv",
                        },
                      });

                      return;
                    }

                    // ✅ Otherwise, use modal and suggest last confirmed ending balance
                    const suggestedEndingBalance =
                      currentAcc &&
                      Number.isFinite(Number(currentAcc.lastConfirmedEndingBalance))
                        ? Number(currentAcc.lastConfirmedEndingBalance)
                        : null;

                    setPendingImport({
                      rows,
                      raw,
                      transactionSum,
                      range,
                      statementKey,
                      accountId: currentAccountId,
                      accountName: currentAcc?.name || "",
                      suggestedEndingBalance,
                    });

                    setBalanceModalOpen(true);
                  }}
                />

                {hasAccountTransactions && (
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs uppercase tracking-[0.18em] text-slate-400">
                        Current account transactions
                      </h3>
                      <button
                        type="button"
                        className="text-[0.7rem] px-2 py-1 rounded-md border border-slate-600 text-slate-200 hover:border-cyan-400 transition"
                        onClick={() => setShowAccountTransactions((prev) => !prev)}
                      >
                        {showAccountTransactions ? "Hide" : "Show"}
                      </button>
                    </div>

                    {showAccountTransactions && (
                      <div className="max-h-64 overflow-auto border border-slate-800 rounded-lg">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-slate-900 text-slate-300">
                            <tr>
                              <th className="px-2 py-1">Date</th>
                              <th className="px-2 py-1">Description</th>
                              <th className="px-2 py-1">Category</th>
                              <th className="px-2 py-1 text-right">Amount</th>
                            </tr>
                          </thead>

                          <tbody className="divide-y divide-slate-800">
                            {transactions.map((tx, idx) => (
                              <tr key={idx} className="hover:bg-slate-900/70">
                                <td className="px-2 py-1 text-slate-300">
                                  {tx.date || "-"}
                                </td>
                                <td className="px-2 py-1 text-slate-200">
                                  {tx.description || "-"}
                                </td>
                                <td className="px-2 py-1 text-slate-300">
                                  {tx.category || "Other"}
                                </td>
                                <td
                                  className={`px-2 py-1 text-right ${
                                    typeof tx.amount === "number" && tx.amount < 0
                                      ? "text-rose-300"
                                      : "text-emerald-300"
                                  }`}
                                >
                                  {typeof tx.amount !== "number" || Number.isNaN(tx.amount)
                                    ? "-"
                                    : `$${tx.amount.toFixed(2)}`}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );

          default:
            return null;
        }
      })}

      {/* ✅ Balance modal */}
      <BalancePromptModal
        open={balanceModalOpen}
        busy={balanceModalBusy}
        accountName={pendingImport?.accountName || ""}
        statementLabel={
          pendingImport?.range?.start && pendingImport?.range?.end
            ? `${pendingImport.range.start.toLocaleDateString()} – ${pendingImport.range.end.toLocaleDateString()}`
            : ""
        }
        transactionSum={pendingImport?.transactionSum ?? 0}
        suggestedEndingBalance={pendingImport?.suggestedEndingBalance ?? null}
        onClose={() => {
          if (balanceModalBusy) return;
          setBalanceModalOpen(false);
          setPendingImport(null);
        }}
        onConfirm={async ({ endingBalance, startingBalance }) => {
          if (!pendingImport) return;

          setBalanceModalBusy(true);
          try {
            const startISO = pendingImport.range?.start
              ? isoDate(pendingImport.range.start)
              : "";
            const endISO = pendingImport.range?.end
              ? isoDate(pendingImport.range.end)
              : "";

            await handleImport(pendingImport.rows, {
              ...pendingImport.raw,
              accountId: pendingImport.accountId,
              statement: {
                startISO,
                endISO,
                statementKey: pendingImport.statementKey,
                transactionSum: pendingImport.transactionSum,
                endingBalance,
                startingBalance,
                balanceSource: "user",
              },
            });

            setBalanceModalOpen(false);
            setPendingImport(null);
          } finally {
            setBalanceModalBusy(false);
          }
        }}
      />
    </div>
  );
}

export default Dashboard;
