import React, { useState,useEffect } from "react";

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

function App() {
  const stored = loadStoredState();

  const [budget, setBudget] = useState(stored?.budget || sampleBudget);
  const [goals, setGoals] = useState(stored?.goals || sampleGoals);
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [selectedGoalId, setSelectedGoalId] = useState(
    stored?.selectedGoalId || "japan"
  );

  useEffect(() => {
    saveStoredState({ budget, goals, selectedGoalId });
  }, [budget, goals, selectedGoalId]);

  const totalIncome = sumAmounts(budget.incomeItems);
  const totalFixed = sumAmounts(budget.fixedExpenses);
  const totalVariable = sumAmounts(budget.variableExpenses);
  const leftoverForGoals = totalIncome - totalFixed - totalVariable;

  const selectedGoal =
    sampleGoals.find((g) => g.id === selectedGoalId) || sampleGoals[0];

  return (
    <div className="min-h-screen bg-[#05060A] text-slate-100 flex flex-col">
      <header className="border-b border-[#1f2937] bg-[#05060F]">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-xs tracking-[0.2em] text-cyan-300">
              BUDGET COMMAND CENTER
            </span>
            <span className="text-sm text-slate-400">
              Dark cyber budgeting with themed goals
            </span>
          </div>

          <nav className="flex gap-2 text-xs">
            <NavButton
              label="Dashboard"
              active={currentPage === "dashboard"}
              onClick={() => setCurrentPage("dashboard")}
            />
            <NavButton
              label="Budget"
              active={currentPage === "budget"}
              onClick={() => setCurrentPage("budget")}
            />
            <NavButton
              label="Goal Detail"
              active={currentPage === "goalDetail"}
              onClick={() => setCurrentPage("goalDetail")}
            />
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto px-4 py-6 space-y-6">
        {currentPage === "dashboard" && (
          <Dashboard
            month={sampleBudget.month}
            income={totalIncome}
            fixed={totalFixed}
            variable={totalVariable}
            leftover={leftoverForGoals}
            goals={sampleGoals}
            onOpenGoal={(id) => {
              setSelectedGoalId(id);
              setCurrentPage("goalDetail");
            }}
          />
        )}

        {currentPage === "budget" && (
          <BudgetPage
            month={sampleBudget.month}
            budget={sampleBudget}
            totals={{
              income: totalIncome,
              fixed: totalFixed,
              variable: totalVariable,
              leftover: leftoverForGoals,
            }}
          />
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
function Dashboard({ month, income, fixed, variable, leftover, goals, onOpenGoal }) {
  const allocatedPercent = income > 0 ? ((income - leftover) / income) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-100">{month}</h1>
        <span className="text-xs text-slate-400">
          Overview of this month's money flow
        </span>
      </div>

      <Card title="MONTH OVERVIEW">
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

      <button className="mt-2 px-4 py-2 rounded-lg border border-cyan-400/70 text-xs text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 transition">
        + Add Goal
      </button>
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

// ----- Budget Page -----
function BudgetPage({ month, budget, totals }) {
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
          <ListWithTotal items={budget.incomeItems} total={totals.income} />
        </Card>

        <Card title="FIXED EXPENSES">
          <ListWithTotal items={budget.fixedExpenses} total={totals.fixed} />
        </Card>

        <Card title="VARIABLE SPENDING">
          <ListWithTotal items={budget.variableExpenses} total={totals.variable} />
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

function ListWithTotal({ items, total }) {
  return (
    <div className="space-y-2 text-sm">
      {items.map((item) => (
        <div
          key={item.name}
          className="flex items-center justify-between text-slate-200"
        >
          <span>{item.name}</span>
          <span className="text-slate-300">${item.amount.toFixed(2)}</span>
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
          Later we'll calculate this based on your income, expenses and due date.
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

export default App;