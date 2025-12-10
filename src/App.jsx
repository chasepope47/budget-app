import React, { useState, useEffect } from "react";

const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "balances", label: "Balances" },
  { key: "budget", label: "Budget" },
  { key: "transactions", label: "Transactions" },
  { key: "goalDetail", label: "Goals" },
];

const NAV_LABELS = NAV_ITEMS.reduce((map, item) => {
  map[item.key] = item.label;
  return map;
}, {});

const DEFAULT_DASHBOARD_SECTIONS = [
  "monthOverview",
  "accountSnapshot",
  "goals",
  "csvImport",
];

// ----- Local Storage -----
const STORAGE_KEY = "budgetAppState_v1";

function loadStoredState() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error("Failed to load stored state", err);
    return null;
  }
}

function saveStoredState(state) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error("Failed to save state", err);
  }
}

function migrateStoredState(stored) {
  if (!stored) return null;

  // If accounts already exist, just return as-is
  if (stored.accounts && Array.isArray(stored.accounts)) {
    return stored;
  }

  // If only old "transactions" exist, wrap them in a default account
  const defaultAccount = {
    id: "main",
    name: "Main Account",
    type: "checking",
    transactions: Array.isArray(stored.transactions)
      ? stored.transactions
      : [],
  };

  return {
    ...stored,
    accounts: [defaultAccount],
    currentAccountId: stored.currentAccountId || "main",
  };
}

function mergeTransactions(existing, incoming) {
  // create a simple key like: "2025-01-01|starbucks|-5.75"
  const makeKey = (tx) =>
    `${(tx.date || "").trim()}|${(tx.description || "")
      .trim()
      .toLowerCase()}|${isNaN(tx.amount) ? "NaN" : tx.amount}`;

  const seen = new Set(existing.map((tx) => makeKey(tx)));
  const merged = [...existing];

  for (const tx of incoming) {
    const key = makeKey(tx);
    if (!seen.has(key)) {
      merged.push(tx);
      seen.add(key);
    }
  }

  return merged;
}

// ----- Sample Data -----
const sampleBudget = {
  month: "January 2026",
  incomeItems: [
    { name: "Paycheck", amount: 3800 },
    { name: "Side Work", amount: 700 },
  ],
  fixedExpenses: [
    { name: "Rent", amount: 1400 },
    { name: "Utilities", amount: 250 },
    { name: "Car (Azera)", amount: 300 },
    { name: "Car (Rogue)", amount: 220 },
    { name: "Phone", amount: 90 },
    { name: "Subscriptions", amount: 70 },
  ],
  variableExpenses: [
    { name: "Groceries", amount: 400 },
    { name: "Gas", amount: 200 },
    { name: "Eating Out", amount: 150 },
    { name: "Fun Money", amount: 100 },
  ],
};

const sampleGoals = [
  {
    id: "japan",
    name: "Japan Trip",
    emoji: "🇯🇵",
    saved: 500,
    target: 5000,
    monthlyPlan: 270,
    theme: "japan",
  },
  {
    id: "azera",
    name: "Azera Loan",
    emoji: "🚗",
    saved: 0,
    target: 7692.46,
    monthlyPlan: 380,
    theme: "car",
  },
];

function sumAmounts(items) {
  return items.reduce((sum, item) => sum + item.amount, 0);
}


function computeNetTransactions(account) {
  const txs = Array.isArray(account?.transactions)
    ? account.transactions
    : [];
  return txs.reduce(
    (sum, tx) => sum + (typeof tx.amount === "number" ? tx.amount : 0),
    0
  );
}

function normalizeAccounts(accs) {
  return (accs || []).map((acc) => ({
    ...acc,
    startingBalance:
      typeof acc.startingBalance === "number" ? acc.startingBalance : 0,
  }));
}

function App() {
  const rawStored = loadStoredState();
  const stored = migrateStoredState(rawStored);

  const [budget, setBudget] = useState(stored?.budget || sampleBudget);
  const [goals, setGoals] = useState(stored?.goals || sampleGoals);
  const [accounts, setAccounts] = useState(
    normalizeAccounts(
      stored?.accounts || [
        {
          id: "main",
          name: "Main Account",
          type: "checking",
          transactions: [],
        },
      ]
    )
  );
  const [currentAccountId, setCurrentAccountId] = useState(
    stored?.currentAccountId ||
      (stored?.accounts && stored.accounts[0]?.id) ||
      "main"
  );

  // NEW: nav & layout customization
  const [navOrder, setNavOrder] = useState(
    stored?.navOrder && stored.navOrder.length
      ? stored.navOrder
      : NAV_ITEMS.map((n) => n.key)
  );

  const [homePage, setHomePage] = useState(stored?.homePage || "dashboard");

  const [dashboardSectionsOrder, setDashboardSectionsOrder] = useState(
  stored?.dashboardSectionsOrder && stored.dashboardSectionsOrder.length
    ? stored.dashboardSectionsOrder
    : DEFAULT_DASHBOARD_SECTIONS
);

const [customizeMode, setCustomizeMode] = useState(false);

  const [currentPage, setCurrentPage] = useState(homePage);
  const [selectedGoalId, setSelectedGoalId] = useState(
    stored?.selectedGoalId || "japan"
  );

  // ---- current account + balance ----
  const currentAccount =
    accounts.find((acc) => acc.id === currentAccountId) || accounts[0];
  const transactions = currentAccount ? currentAccount.transactions || [] : [];

    // EDIT a single transaction in the current account
  function handleEditTransaction(index, updatedFields) {
    setAccounts((prev) =>
      prev.map((acc) => {
        if (acc.id !== currentAccountId) return acc;

        const oldTxs = Array.isArray(acc.transactions)
          ? acc.transactions
          : [];

        const newTxs = oldTxs.map((tx, i) =>
          i === index ? { ...tx, ...updatedFields } : tx
        );

        return { ...acc, transactions: newTxs };
      })
    );
  }

  // DELETE a single transaction in the current account
  function handleDeleteTransaction(index) {
    setAccounts((prev) =>
      prev.map((acc) => {
        if (acc.id !== currentAccountId) return acc;

        const oldTxs = Array.isArray(acc.transactions)
          ? acc.transactions
          : [];

        const newTxs = oldTxs.filter((_, i) => i !== index);

        return { ...acc, transactions: newTxs };
      })
    );
  }

  const accountStarting =
    currentAccount && typeof currentAccount.startingBalance === "number"
      ? currentAccount.startingBalance
      : 0;

  const accountNet = computeNetTransactions(currentAccount);
  const accountBalance = accountStarting + accountNet;

  // --- compute balances for all accounts ---
const accountRows = (accounts || []).map((acc) => {
  const starting =
    typeof acc.startingBalance === "number" ? acc.startingBalance : 0;
  const net = computeNetTransactions(acc);
  const balance = starting + net;
  return { id: acc.id, name: acc.name, balance };
});

const totalBalance = accountRows.reduce(
  (sum, row) => sum + row.balance,
  0
);

const currentAccountBalance =
  accountRows.find((row) => row.id === currentAccountId)?.balance ?? 0;

  // ---- Persist state to localStorage on changes ----
  useEffect(() => {
    saveStoredState({
      budget,
      goals,
      accounts,
      currentAccountId,
      selectedGoalId,
      navOrder,
      homePage,
      dashboardSectionsOrder,
    });
  }, [budget, goals, accounts, currentAccountId, selectedGoalId, navOrder, homePage, dashboardSectionsOrder,]);

  const totalIncome = sumAmounts(budget.incomeItems);
  const totalFixed = sumAmounts(budget.fixedExpenses);
  const totalVariable = sumAmounts(budget.variableExpenses);
  const leftoverForGoals = totalIncome - totalFixed - totalVariable;

  const selectedGoal =
    goals.find((g) => g.id === selectedGoalId) || goals[0];

  return (
    <div className="min-h-screen bg-[#05060A] text-slate-100 flex flex-col">
      <header className="border-b border-[#1f2937] bg-[#05060F]">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex flex-col">
            <span className="text-xs tracking-[0.2em] text-cyan-300">
              BUDGET COMMAND CENTER
            </span>
            <span className="text-sm text-slate-400">
              Dark cyber budgeting with themed goals
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* Account selector + balance */}
            <div className="flex flex-col items-end gap-1">
              <span className="text-[0.6rem] uppercase tracking-[0.18em] text-slate-500">
                Account
              </span>

              <div className="flex items-center gap-2">
                <select
                  className="bg-[#05060F] border border-slate-700 text-xs rounded-md px-2 py-1 text-slate-100"
                  value={currentAccountId}
                  onChange={(e) => setCurrentAccountId(e.target.value)}
                >
                  {accounts.map((acct) => (
                    <option key={acct.id} value={acct.id}>
                      {acct.name}
                    </option>
                  ))}
                </select>
                <button
                  className="text-xs px-2 py-1 rounded-md border border-cyan-500/70 text-cyan-200 hover:bg-cyan-500/10 transition"
                  onClick={() => {
                    const name = window.prompt("New account name:");
                    if (!name) return;
                    const id =
                      name.toLowerCase().replace(/\s+/g, "-") +
                      "-" +
                      Date.now();
                    setAccounts((prev) => [
                      ...prev,
                      {
                        id,
                        name,
                        type: "checking",
                        startingBalance: 0,
                        transactions: [],
                      },
                    ]);
                    setCurrentAccountId(id);
                  }}
                >
                  + New
                </button>
              </div>

              <div className="flex items-center gap-2 text-[0.7rem] text-slate-400">
                <span>
                  Balance:{" "}
                  <span className="text-cyan-300 font-semibold">
                    ${accountBalance.toFixed(2)}
                  </span>
                </span>
                <button
                  className="underline decoration-dotted hover:text-cyan-300"
                  onClick={() => {
                    const current =
                      currentAccount &&
                      typeof currentAccount.startingBalance === "number"
                        ? currentAccount.startingBalance
                        : 0;
                    const input = window.prompt(
                      "Set starting balance for this account (e.g. 1234.56):",
                      current
                    );
                    if (input == null) return;
                    const value = Number(input);
                    if (Number.isNaN(value)) {
                      alert("That didn’t look like a number.");
                      return;
                    }
                    setAccounts((prev) =>
                      prev.map((acc) =>
                        acc.id === currentAccountId
                          ? { ...acc, startingBalance: value }
                          : acc
                      )
                    );
                  }}
                >
                  Set balance
                </button>
              </div>
            </div>

           <nav className="flex items-center gap-2 text-xs">
             {navOrder.map((pageKey) => (
               <NavButton
                 key={pageKey}
                 label={NAV_LABELS[pageKey] || pageKey}
                 active={currentPage === pageKey}
                 onClick={() => setCurrentPage(pageKey)}
               />
             ))}
           
             <button
               className={`ml-3 px-2 py-1 rounded-full border text-[0.65rem] uppercase tracking-[0.16em] ${
                 customizeMode
                   ? "border-fuchsia-400 bg-fuchsia-500/10 text-fuchsia-200"
                   : "border-slate-600/60 text-slate-300 hover:border-cyan-400/60 hover:text-cyan-200"
               }`}
               onClick={() => setCustomizeMode((v) => !v)}
             >
               {customizeMode ? "Done" : "Customize"}
             </button>
           </nav>
          </div>
        </div>
      </header>

      <main className="flex-1w-full max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-6">
        {customizeMode && (
         <CustomizationPanel
           navOrder={navOrder}
           setNavOrder={setNavOrder}
           homePage={homePage}
           setHomePage={(pageKey) => {
             setHomePage(pageKey);
             setCurrentPage(pageKey);
           }}
           dashboardSectionsOrder={dashboardSectionsOrder}
           setDashboardSectionsOrder={setDashboardSectionsOrder}
         />
        )}

        {currentPage === "dashboard" && (
          <Dashboard
            month={budget.month}
            income={totalIncome}
            fixed={totalFixed}
            variable={totalVariable}
            leftover={leftoverForGoals}
            goals={goals}
            transactions={transactions}
            currentAccountBalance={currentAccountBalance}
            totalBalance={totalBalance}
            onOpenGoal={(id) => {
              setSelectedGoalId(id);
              setCurrentPage("goalDetail");
            }}
            onTransactionsUpdate={(rows) =>
              setAccounts((prev) =>
                prev.map((account) =>
                  account.id === currentAccountId
                    ? {
                        ...account,
                        transactions: mergeTransactions(
                          account.transactions || [],
                          rows
                        ),
                      }
                    : account
                )
              )
            }
          />
        )}

        {currentPage === "balances" && (
          <BalancesDashboard
            accounts={accounts}
            onSetAccountBalance={(accountId, newBalance) =>{
              setAccounts((prev) =>
                prev.map((acc) => {
                  if (acc.id !== accountId) return acc;
                  const net = computeNetTransactions(acc);
                  const startingBalance = newBalance - net;
                  return { ...acc, startingBalance };
                })
              );
            }}
            />
          )}

        {currentPage === "budget" && (
          <BudgetPage
            month={budget.month}
            budget={budget}
            totals={{
              income: totalIncome,
              fixed: totalFixed,
              variable: totalVariable,
              leftover: leftoverForGoals,
            }}
            onBudgetChange={(newBudget) => setBudget(newBudget)}
          />
        )}

        {currentPage === "transactions" && (
          <TransactionsPage transactions={transactions} onUpdateTransaction={handleEditTransaction} onDeleteTransaction={handleDeleteTransaction} />
        )}

        {currentPage === "goalDetail" && (
          <GoalDetailPage goal={selectedGoal} />
        )}
      </main>
    </div>
  );
}

// ----- Reusable UI Components -----
function NavButton({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full border text-xs transition
      ${
        active
          ? "border-cyan-400 bg-cyan-500/10 text-cyan-200"
          : "border-slate-600/60 text-slate-300 hover:border-cyan-400/60 hover:text-cyan-200"
      }`}
    >
      {label}
    </button>
  );
}

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

function NeonProgressBar({ value }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-cyan-300 via-fuchsia-400 to-cyan-200 shadow-[0_0_20px_rgba(34,211,238,0.8)]"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

// ----- Dashboard -----
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
  sectionsOrder = DEFAULT_DASHBOARD_SECTIONS,
}) {
  const allocatedPercent =
    income > 0 ? ((income - leftover) / income) * 100 : 0;

  const order =
    sectionsOrder && sectionsOrder.length
      ? sectionsOrder
      : DEFAULT_DASHBOARD_SECTIONS;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-100">{month}</h1>
        <span className="text-xs text-slate-400">
          Overview of this month's money flow
        </span>
      </div>

      {/* Render sections in customizable order */}
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
                  <NeonProgressBar
                    value={income > 0 ? ((income - leftover) / income) * 100 : 0}
                  />
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
                  onTransactionsParsed={(rows) =>
                    onTransactionsUpdate(rows)
                  }
                />

                {Array.isArray(transactions) &&
                  transactions.length > 0 && (
                    <div className="mt-4">
                      <h3 className="text-xs uppercase tracking-[0.18em] text-slate-400 mb-2">
                        Parsed Transactions
                      </h3>
                      <div className="max-h-64 overflow-auto border border-slate-800 rounded-lg">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-slate-900 text-slate-300">
                            <tr>
                              <th className="px-2 py-1">Date</th>
                              <th className="px-2 py-1">
                                Description
                              </th>
                              <th className="px-2 py-1">Category</th>
                              <th className="px-2 py-1 text-right">
                                Amount
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800">
                            {transactions.map((tx, idx) => (
                              <tr
                                key={idx}
                                className="hover:bg-slate-900/70"
                              >
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
                                    tx.amount < 0
                                      ? "text-rose-300"
                                      : "text-emerald-300"
                                  }`}
                                >
                                  {isNaN(tx.amount)
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

function Stat({ label, value, accent }) {
  return (
    <div className="flex flex-col">
      <span className="text-[0.65rem] uppercase tracking-[0.22em] text-slate-500">
        {label}
      </span>
      <span className={`text-base font-semibold ${accent}`}>
        ${value.toFixed(2)}
      </span>
    </div>
  );
}

function GoalCard({ goal, onClick }) {
  const progress = (goal.saved / goal.target) * 100;
  return (
    <button
      onClick={onClick}
      className="text-left bg-[#090a11] border border-slate-800 rounded-xl p-3 hover:border-cyan-400/70 hover:shadow-[0_0_18px_rgba(34,211,238,0.35)] transition"
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="text-lg">{goal.emoji}</span>
          <span className="text-sm font-medium text-slate-100">
            {goal.name}
          </span>
        </div>
        <span className="text-[0.7rem] text-slate-400">
          Plan: ${goal.monthlyPlan.toFixed(0)}/mo
        </span>
      </div>

      <div className="text-xs text-slate-400 mb-1">
        ${goal.saved.toFixed(0)} / ${goal.target.toFixed(0)}
      </div>
      <NeonProgressBar value={progress} />
    </button>
  );
}

function moveItem(array, index, direction) {
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= array.length) return array;
  const copy = [...array];
  const [item] = copy.splice(index, 1);
  copy.splice(newIndex, 0, item);
  return copy;
}

function CustomizationPanel({
  navOrder,
  setNavOrder,
  homePage,
  setHomePage,
  dashboardSectionsOrder,
  setDashboardSectionsOrder,
}) {
  const dashboardLabels = {
    monthOverview: "Month overview",
    accountSnapshot: "Account snapshot",
    goals: "Goals",
    csvImport: "Bank import + parsed transactions",
  };

  return (
    <Card title="LAYOUT & NAVIGATION">
      <div className="grid md:grid-cols-2 gap-4 text-xs">
        {/* Nav order */}
        <div>
          <h3 className="text-[0.7rem] uppercase tracking-[0.18em] text-slate-400 mb-2">
            Navigation buttons
          </h3>
          <p className="mb-2 text-slate-500">
            Reorder the top buttons and pick which page opens first.
          </p>
          <div className="space-y-1">
            {navOrder.map((key, index) => (
              <div
                key={key}
                className="flex items-center justify-between bg-[#05060F] border border-slate-700/70 rounded-lg px-2 py-1"
              >
                <div className="flex items-center gap-2">
                  <button
                    className="px-1 text-slate-500 hover:text-cyan-200"
                    onClick={() =>
                      setNavOrder((prev) =>
                        moveItem(prev, index, -1)
                      )
                    }
                  >
                    ↑
                  </button>
                  <button
                    className="px-1 text-slate-500 hover:text-cyan-200"
                    onClick={() =>
                      setNavOrder((prev) =>
                        moveItem(prev, index, 1)
                      )
                    }
                  >
                    ↓
                  </button>
                  <span className="text-slate-200">
                    {NAV_LABELS[key] || key}
                  </span>
                </div>
                <label className="flex items-center gap-1 text-[0.7rem] text-slate-400">
                  <input
                    type="radio"
                    className="accent-cyan-400"
                    checked={homePage === key}
                    onChange={() => setHomePage(key)}
                  />
                  Home
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* Dashboard sections */}
        <div>
          <h3 className="text-[0.7rem] uppercase tracking-[0.18em] text-slate-400 mb-2">
            Dashboard sections
          </h3>
          <p className="mb-2 text-slate-500">
            Drag-style reorder with arrows to decide what you see first on
            the Dashboard.
          </p>
          <div className="space-y-1">
            {dashboardSectionsOrder.map((key, index) => (
              <div
                key={key}
                className="flex items-center justify-between bg-[#05060F] border border-slate-700/70 rounded-lg px-2 py-1"
              >
                <div className="flex items-center gap-2">
                  <button
                    className="px-1 text-slate-500 hover:text-cyan-200"
                    onClick={() =>
                      setDashboardSectionsOrder((prev) =>
                        moveItem(prev, index, -1)
                      )
                    }
                  >
                    ↑
                  </button>
                  <button
                    className="px-1 text-slate-500 hover:text-cyan-200"
                    onClick={() =>
                      setDashboardSectionsOrder((prev) =>
                        moveItem(prev, index, 1)
                      )
                    }
                  >
                    ↓
                  </button>
                  <span className="text-slate-200">
                    {dashboardLabels[key] || key}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function BalancesDashboard({ accounts = [], onSetAccountBalance }) {
  const rows = (accounts || []).map((acc) => {
    const starting =
      typeof acc.startingBalance === "number" ? acc.startingBalance : 0;
    const net = computeNetTransactions(acc);
    const balance = starting + net;
    return { ...acc, starting, net, balance };
  });

  const totalBalance = rows.reduce((sum, r) => sum + r.balance, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-100">
          Account Balances
        </h1>
        <span className="text-xs text-slate-400">
          Estimated money across all your accounts
        </span>
      </div>

      {/* Total card (similar vibe to Month Overview / Remaining for Goals) */}
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
            No accounts yet. Add one from the header to start tracking.
          </p>
        )}
      </Card>

      {/* Account cards – styled like Goal cards / Budget sections */}
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

              return (
                <section
                  key={row.id}
                  className="bg-[#090a11] border border-slate-800 rounded-xl p-4 hover:border-cyan-400/70 hover:shadow-[0_0_18px_rgba(34,211,238,0.35)] transition"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="text-[0.65rem] uppercase tracking-[0.2em] text-slate-500">
                        {row.type || "checking"}
                      </div>
                      <div className="text-sm font-medium text-slate-100">
                        {row.name}
                      </div>
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

                  <NeonProgressBar value={share} />
                  <div className="mt-1 flex justify-between items-center text-[0.7rem] text-slate-500">
                    <span>
                      {share.toFixed(1)}% of total cash
                    </span>
                    <button
                      className="text-cyan-300 underline decoration-dotted hover:text-cyan-200"
                      onClick={() => {
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
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ----- Budget Page -----
function BudgetPage({ month, budget, totals, onBudgetChange }) {
  function handleAddItem(sectionKey) {
    const name = window.prompt(`New ${sectionKey} item name:`);
    if (!name) return;

    const amountInput = window.prompt(
      `Amount for "${name}" (numbers only):`
    );
    const amount = Number(amountInput);
    if (isNaN(amount)) {
      alert("That didn't look like a valid number.");
      return;
    }

    const updatedSection = [...budget[sectionKey], { name, amount }];
    const updatedBudget = { ...budget, [sectionKey]: updatedSection };
    onBudgetChange(updatedBudget);
  }

  function handleDeleteItem(sectionKey, index) {
    if (!window.confirm("Delete this item?")) return;

    const updatedSection = budget[sectionKey].filter((_, i) => i !== index);
    const updatedBudget = { ...budget, [sectionKey]: updatedSection };
    onBudgetChange(updatedBudget);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-100">
          {month} Budget
        </h1>
        <span className="text-xs text-slate-400">
          Income → Expenses → Goals
        </span>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card title="INCOME">
          <ListWithTotal
            items={budget.incomeItems}
            total={totals.income}
            onDelete={(index) =>
              handleDeleteItem("incomeItems", index)
            }
          />
          <button
            className="mt-3 px-3 py-1.5 text-xs rounded-md border border-emerald-400/70 text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/20 transition"
            onClick={() => handleAddItem("incomeItems")}
          >
            + Add Income Item
          </button>
        </Card>

        <Card title="FIXED EXPENSES">
          <ListWithTotal
            items={budget.fixedExpenses}
            total={totals.fixed}
            onDelete={(index) =>
              handleDeleteItem("fixedExpenses", index)
            }
          />
          <button
            className="mt-3 px-3 py-1.5 text-xs rounded-md border border-rose-400/70 text-rose-200 bg-rose-500/10 hover:bg-rose-500/20 transition"
            onClick={() => handleAddItem("fixedExpenses")}
          >
            + Add Fixed Expense
          </button>
        </Card>

        <Card title="VARIABLE SPENDING">
          <ListWithTotal
            items={budget.variableExpenses}
            total={totals.variable}
            onDelete={(index) =>
              handleDeleteItem("variableExpenses", index)
            }
          />
          <button
            className="mt-3 px-3 py-1.5 text-xs rounded-md border border-amber-400/70 text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 transition"
            onClick={() => handleAddItem("variableExpenses")}
          >
            + Add Variable Expense
          </button>
        </Card>

        <Card title="REMAINING FOR GOALS">
          <div className="text-2xl font-semibold text-cyan-300">
            ${totals.leftover.toFixed(2)}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            This is what's left after income minus all listed expenses.
          </p>

          <button className="mt-3 px-3 py-1.5 text-xs rounded-md border border-cyan-400/70 text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 transition">
            Edit Budget (coming soon)
          </button>
        </Card>
      </div>
    </div>
  );
}

function ListWithTotal({ items, total, onDelete }) {
  return (
    <div className="space-y-2 text-sm">
      {items.map((item, index) => (
        <div
          key={item.name + index}
          className="flex items-center justify-between text-slate-200 gap-2"
        >
          <div className="flex-1 flex justify-between">
            <span>{item.name}</span>
            <span className="text-slate-300">
              ${item.amount.toFixed(2)}
            </span>
          </div>
          {onDelete && (
            <button
              className="text-[0.65rem] text-slate-500 hover:text-rose-400"
              onClick={() => onDelete(index)}
            >
              ✕
            </button>
          )}
        </div>
      ))}
      <div className="mt-2 pt-2 border-t border-slate-700 flex items-center justify-between text-xs">
        <span className="uppercase tracking-[0.18em] text-slate-500">
          Total
        </span>
        <span className="text-slate-100">${total.toFixed(2)}</span>
      </div>
    </div>
  );
}

// ----- Transactions Page -----
function TransactionsPage({
  transactions = [],
  onUpdateTransaction = () => {},
  onDeleteTransaction = () => {},
}) {
  const hasData = Array.isArray(transactions) && transactions.length > 0;

  return (
    <div className="space-y-4 w-full">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
        <h1 className="text-lg font-semibold text-slate-100">
          Transactions
        </h1>
        <span className="text-xs text-slate-400">
          Imported from your bank CSV files
        </span>
      </header>

      <Card title="ALL TRANSACTIONS">
        {!hasData && (
          <p className="text-xs text-slate-400">
            No transactions yet. Import a CSV on the Dashboard to see them
            here.
          </p>
        )}

        {hasData && (
          // horizontal scroll on very small screens
          <div className="w-full overflow-x-auto">
            {/* vertical scroll inside, with max height based on viewport */}
            <div className="min-w-[640px] max-h-[65vh] overflow-y-auto border border-slate-800 rounded-lg">
              <table className="w-full text-[0.7rem] sm:text-xs text-left">
                <thead className="bg-slate-900 text-slate-300 sticky top-0">
                  <tr>
                    <th className="px-2 py-1">Date</th>
                    <th className="px-2 py-1">Description</th>
                    <th className="px-2 py-1">Category</th>
                    <th className="px-2 py-1 text-right">Amount</th>
                    <th className="px-2 py-1 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {transactions.map((tx, idx) => (
                    <tr key={idx} className="hover:bg-slate-900/70">
                      {/* Date (read-only for now) */}
                      <td className="px-2 py-1 text-slate-300 whitespace-nowrap">
                        {tx.date || "-"}
                      </td>

                      {/* Editable description */}
                      <td className="px-2 py-1 text-slate-200">
                        <input
                          className="w-full bg-transparent border-b border-slate-700 focus:outline-none focus:border-cyan-400 text-[0.7rem] sm:text-xs"
                          value={tx.description || ""}
                          onChange={(e) =>
                            onUpdateTransaction(idx, {
                              description: e.target.value,
                            })
                          }
                        />
                      </td>

                      {/* Editable category */}
                      <td className="px-2 py-1 text-slate-300">
                        <input
                          className="w-full bg-transparent border-b border-slate-700 focus:outline-none focus:border-cyan-400 text-[0.7rem] sm:text-xs"
                          value={tx.category || ""}
                          onChange={(e) =>
                            onUpdateTransaction(idx, {
                              category: e.target.value,
                            })
                          }
                        />
                      </td>

                      {/* Amount (read-only for now) */}
                      <td
                        className={`px-2 py-1 text-right whitespace-nowrap ${
                          tx.amount < 0 ? "text-rose-300" : "text-emerald-300"
                        }`}
                      >
                        {isNaN(tx.amount)
                          ? "-"
                          : `$${tx.amount.toFixed(2)}`}
                      </td>

                      {/* Delete button */}
                      <td className="px-2 py-1 text-right">
                        <button
                          className="text-[0.7rem] px-2 py-1 rounded-md border border-rose-500/60 text-rose-300 hover:bg-rose-400/10"
                          onClick={() => {
                            if (
                              window.confirm(
                                "Delete this transaction from this account?"
                              )
                            ) {
                              onDeleteTransaction(idx);
                            }
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}


// ----- Goal Detail Page -----
function GoalDetailPage({ goal }) {
  const progress = (goal.saved / goal.target) * 100;

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{goal.emoji}</span>
          <h1 className="text-xl font-semibold text-slate-100">
            {goal.name}
          </h1>
        </div>
        <p className="text-xs text-slate-400">
          Personalized goal view – future: themed backgrounds & animations.
        </p>
      </header>

      <Card title="PROGRESS">
        <div className="flex flex-col gap-2 text-sm">
          <span className="text-slate-200">
            ${goal.saved.toFixed(2)} / ${goal.target.toFixed(2)}
          </span>
          <NeonProgressBar value={progress} />
          <span className="text-xs text-slate-400">
            {progress.toFixed(1)}% complete
          </span>
        </div>
      </Card>

      <Card title="PLAN">
        <p className="text-sm text-slate-200">
          Recommended monthly contribution:
          <span className="ml-1 text-cyan-300 font-semibold">
            ${goal.monthlyPlan.toFixed(2)}
          </span>
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Later we'll calculate this based on your income, expenses and due
          date.
        </p>

        <div className="mt-3 flex gap-2">
          <button className="px-3 py-1.5 text-xs rounded-md border border-pink-400/70 text-pink-200 bg-pink-500/10 hover:bg-pink-500/20 transition">
            Add Contribution
          </button>
          <button className="px-3 py-1.5 text-xs rounded-md border border-slate-600 text-slate-200 hover:border-slate-400 transition">
            Edit Goal
          </button>
        </div>
      </Card>
    </div>
  );
}

function BankImportCard({ onTransactionsParsed }) {
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setFileName(file.name);

    try {
      const text = await file.text();
      const rows = parseCsvTransactions(text);
      onTransactionsParsed(rows);
    } catch (err) {
      console.error(err);
      setError("Could not read or parse this file. Make sure it's a CSV.");
    }
  }

  return (
    <div className="space-y-2 text-xs">
      <p className="text-slate-400">
        Upload a <span className="text-cyan-300 font-semibold">.csv</span>{" "}
        bank statement. We&apos;ll parse basic fields like date, description,
        and amount.
      </p>

      <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-cyan-400/70 text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 cursor-pointer transition">
        <span>Choose CSV file</span>
        <input
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleFileChange}
        />
      </label>

      {fileName && (
        <p className="text-[0.7rem] text-slate-500">
          Selected: <span className="text-slate-300">{fileName}</span>
        </p>
      )}

      {error && <p className="text-[0.7rem] text-rose-400">{error}</p>}

      <p className="text-[0.7rem] text-slate-500">
        Tip: Most banks let you export recent transactions as CSV from their
        website.
      </p>
    </div>
  );
}

function categorizeTransaction(description, amount) {
  const text = (description || "").toLowerCase();

  if (amount > 0) {
    // Money coming in
    if (text.includes("payroll") || text.includes("direct deposit")) {
      return "Income – Paycheck";
    }
    if (text.includes("refund") || text.includes("rebate")) {
      return "Income – Refund";
    }
    return "Income – Other";
  }

  // Money going out (expenses)
  if (text.includes("uber") || text.includes("lyft") || text.includes("taxi")) {
    return "Transport – Rideshare";
  }
  if (
    text.includes("shell") ||
    text.includes("chevron") ||
    text.includes("exxon") ||
    text.includes("gas") ||
    text.includes("fuel")
  ) {
    return "Transport – Gas";
  }
  if (
    text.includes("walmart") ||
    text.includes("costco") ||
    text.includes("grocery") ||
    text.includes("smith") ||
    text.includes("kroger")
  ) {
    return "Groceries";
  }
  if (
    text.includes("starbucks") ||
    text.includes("coffee") ||
    text.includes("mcdonald") ||
    text.includes("taco bell") ||
    text.includes("restaurant") ||
    text.includes("cafe")
  ) {
    return "Food & Dining";
  }
  if (
    text.includes("netflix") ||
    text.includes("spotify") ||
    text.includes("hulu") ||
    text.includes("disney") ||
    text.includes("subscription") ||
    text.includes("prime")
  ) {
    return "Subscriptions";
  }
  if (
    text.includes("rent") ||
    text.includes("landlord") ||
    text.includes("mortgage")
  ) {
    return "Housing – Rent/Mortgage";
  }
  if (
    text.includes("power") ||
    text.includes("electric") ||
    text.includes("water") ||
    text.includes("utility") ||
    text.includes("utilities")
  ) {
    return "Utilities";
  }
  if (text.includes("gym") || text.includes("fitness")) {
    return "Health & Fitness";
  }
  if (
    text.includes("insurance") ||
    text.includes("geico") ||
    text.includes("allstate")
  ) {
    return "Insurance";
  }
  if (
    text.includes("amazon") ||
    text.includes("target") ||
    text.includes("best buy") ||
    text.includes("shop")
  ) {
    return "Shopping";
  }

  return "Other";
}

const HEADER_ALIASES = {
  date: [
    "date",
    "transaction date",
    "posted date",
    "posting date",
    "trans date",
  ],
  description: [
    "description",
    "details",
    "memo",
    "payee",
    "transaction description",
    "narrative",
  ],
  debit: ["debit", "withdrawal", "outflow", "money out", "charge"],
  credit: [
    "credit",
    "deposit",
    "inflow",
    "money in",
    "payment",
    "credit amount",
  ],
  amount: ["amount", "amt", "transaction amount", "value"],
};

function normalizeHeaderRow(line) {
  return line
    .split(",")
    .map((h) => h.trim().toLowerCase().replace(/"/g, ""));
}

function findHeaderIndex(header, aliases) {
  return header.findIndex((h) => aliases.includes(h));
}

function parseAmountCell(cell) {
  if (!cell) return NaN;
  let cleaned = String(cell).trim();

  // remove quotes
  cleaned = cleaned.replace(/"/g, "");

  // handle parentheses for negatives: (123.45) => -123.45
  let negative = false;
  if (cleaned.startsWith("(") && cleaned.endsWith(")")) {
    negative = true;
    cleaned = cleaned.slice(1, -1);
  }

  // strip $ and commas
  cleaned = cleaned.replace(/[$,]/g, "");

  if (cleaned === "") return NaN;

  let num = Number(cleaned);
  if (isNaN(num)) return NaN;
  return negative ? -num : num;
}

function parseCsvTransactions(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return [];

  // try to treat first non-empty line as header
  const header = normalizeHeaderRow(lines[0]);

  const dateIndex = findHeaderIndex(header, HEADER_ALIASES.date);
  const descIndex = findHeaderIndex(
    header,
    HEADER_ALIASES.description
  );
  const amountIndex = findHeaderIndex(header, HEADER_ALIASES.amount);
  const debitIndex = findHeaderIndex(header, HEADER_ALIASES.debit);
  const creditIndex = findHeaderIndex(header, HEADER_ALIASES.credit);

  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    const cols = raw.split(",").map((c) => c.trim());

    if (cols.length === 0 || cols.every((c) => c === "")) continue;

    const date = dateIndex >= 0 ? cols[dateIndex] : "";
    const description = descIndex >= 0 ? cols[descIndex] : "";

    let amount = NaN;

    if (amountIndex >= 0) {
      // single Amount column
      amount = parseAmountCell(cols[amountIndex]);
    } else if (debitIndex >= 0 || creditIndex >= 0) {
      // separate Debit/Credit columns
      const debit =
        debitIndex >= 0 ? parseAmountCell(cols[debitIndex]) : 0;
      const credit =
        creditIndex >= 0 ? parseAmountCell(cols[creditIndex]) : 0;
      // convention: money in = positive, money out = negative
      amount = credit - debit;
    }

    // if row is basically empty, skip
    if (!date && !description && isNaN(amount)) continue;

    const category = categorizeTransaction(description, amount);

    rows.push({
      date,
      description,
      amount,
      category,
    });
  }

  return rows;
}

export default App;