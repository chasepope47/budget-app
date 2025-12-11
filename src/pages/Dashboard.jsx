import React from "react";
import Card from "../components/Card.jsx";
import NeonProgressBar from "../components/NeonProgressBar.jsx";
import GoalCard from "../components/GoalCard.jsx";
import BankImportCard from "../components/BankImportCard.jsx";
import Stat from "../components/Stat.jsx";

const DEFAULT_DASHBOARD_SECTIONS = [
  "monthOverview",
  "accountSnapshot",
  "goals",
  "csvImport",
];

function Dashboard({
  month,
  income,
  fixed,
  variable,
  leftover,
  goals,
  transactions = [],
  onOpenGoal,
  onTransactionsUpdate = () => {},
  currentAccountBalance = 0,
  totalBalance = 0,
  sectionsOrder,
}) {
  const allocatedPercent =
    income > 0 ? ((income - leftover) / income) * 100 : 0;

  const order =
    sectionsOrder && sectionsOrder.length
      ? sectionsOrder
      : DEFAULT_DASHBOARD_SECTIONS;

  return (
    <div className="space-y-6">
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
                  <Stat label="Income" value={income} accent="text-emerald-300" />
                  <Stat label="Fixed" value={fixed} accent="text-rose-300" />
                  <Stat label="Variable" value={variable} accent="text-amber-300" />
                  <Stat label="Leftover" value={leftover} accent="text-cyan-300" />
                </div>

                <div className="mt-4">
                  <p className="text-xs text-slate-400 mb-1">
                    Allocation this month
                  </p>
                  <NeonProgressBar value={allocatedPercent} />
                </div>
              </Card>
            );

          case "accountSnapshot":
            return (
              <Card key="accountSnapshot" title="ACCOUNT SNAPSHOT">
                <div className="space-y-4 text-sm">
                  <div>
                    <div className="text-[0.65rem] uppercase tracking-[0.2em] text-slate-500">
                      Current account
                    </div>
                    <div className="mt-1 text-2xl font-semibold text-cyan-300">
                      ${currentAccountBalance.toFixed(2)}
                    </div>
                    <p className="mt-1 text-[0.7rem] text-slate-500">
                      Based on starting balance plus imported transactions.
                    </p>
                  </div>

                  <hr className="border-slate-800" />

                  <div>
                    <div className="text-[0.65rem] uppercase tracking-[0.2em] text-slate-500">
                      All accounts
                    </div>
                    <div className="mt-1 text-xl font-semibold text-emerald-300">
                      ${totalBalance.toFixed(2)}
                    </div>
                    <p className="mt-1 text-[0.7rem] text-slate-500">
                      Total estimated cash across all linked accounts.
                    </p>
                  </div>
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
                  {goals.map((goal) => (
                    <GoalCard
                      key={goal.id}
                      goal={goal}
                      onClick={() => onOpenGoal(goal.id)}
                    />
                  ))}
                </div>
                <button className="mt-1 px-4 py-2 rounded-lg border border-cyan-400/70 text-xs text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 transition">
                  + Add Goal
                </button>
              </div>
            );

          case "csvImport":
            return (
              <Card key="csvImport" title="BANK STATEMENT IMPORT (CSV)">
                <BankImportCard
                  onTransactionsParsed={(payload) => onTransactionsUpdate(payload)}
                />

                {Array.isArray(transactions) && transactions.length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-xs uppercase tracking-[0.18em] text-slate-400 mb-2">
                      Parsed Transactions
                    </h3>
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
                                {typeof tx.amount !== "number" ||
                                Number.isNaN(tx.amount)
                                  ? "-"
                                  : `$${tx.amount.toFixed(2)}`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </Card>
            );

          default:
            return null;
        }
      })}
    </div>
  );
}

export default Dashboard;
