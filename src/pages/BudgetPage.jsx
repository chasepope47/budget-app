import React from "react";
import Card from "../components/Card.jsx";

function BudgetPage({ month, budget, totals = {}, onBudgetChange }) {
  const fixedTotal = totals?.fixedTotal ?? 0;
  const variableTotal = totals?.variableTotal ?? 0;
  const leftover = totals?.leftover ?? 0;
  const incomeValue = Number(budget?.income ?? 0);
  const fixedItems = Array.isArray(budget?.fixed) ? budget.fixed : [];
  const variableItems = Array.isArray(budget?.variable) ? budget.variable : [];

  function handleEditIncome() {
    const input = window.prompt(
      "Monthly income amount:",
      incomeValue.toString()
    );
    if (input === null) return;
    const next = Number(input);
    if (!Number.isFinite(next)) {
      window.alert("Enter a valid number for income.");
      return;
    }
    onBudgetChange({ ...budget, income: next });
  }

  function handleAddExpense(sectionKey) {
    const name = window.prompt(`New ${sectionKey} item name:`);
    if (!name) return;

    const amountInput = window.prompt(`Amount for "${name}" (numbers only):`);
    const amount = Number(amountInput);
    if (!Number.isFinite(amount)) {
      window.alert("That didn't look like a valid number.");
      return;
    }

    const nextItem = {
      id: `budget-${sectionKey}-${Date.now()}`,
      label: name,
      amount,
    };
    const currentList = sectionKey === "fixed" ? fixedItems : variableItems;
    const updatedSection = [...currentList, nextItem];
    const updatedBudget = { ...budget, [sectionKey]: updatedSection };
    onBudgetChange(updatedBudget);
  }

  function handleDeleteExpense(sectionKey, index) {
    if (!window.confirm("Delete this item?")) return;
    const currentList = sectionKey === "fixed" ? fixedItems : variableItems;
    const updatedSection = currentList.filter((_, i) => i !== index);
    const updatedBudget = { ...budget, [sectionKey]: updatedSection };
    onBudgetChange(updatedBudget);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-100">{month} Budget</h1>
        <span className="text-xs text-slate-400">
          Income → Expenses → Goals
        </span>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card title="INCOME">
          <div className="text-3xl font-semibold text-emerald-300">
            ${incomeValue.toFixed(2)}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Total take-home income for the active month.
          </p>
          <button
            className="mt-3 px-3 py-1.5 text-xs rounded-md border border-emerald-400/70 text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/20 transition"
            onClick={handleEditIncome}
          >
            Edit Income
          </button>
        </Card>

        <Card title="FIXED EXPENSES">
          <ListWithTotal
            items={fixedItems}
            total={totals.fixedTotal}
            onDelete={(index) => handleDeleteExpense("fixed", index)}
          />
          <button
            className="mt-3 px-3 py-1.5 text-xs rounded-md border border-rose-400/70 text-rose-200 bg-rose-500/10 hover:bg-rose-500/20 transition"
            onClick={() => handleAddExpense("fixed")}
          >
            + Add Fixed Expense
          </button>
        </Card>

        <Card title="VARIABLE SPENDING">
          <ListWithTotal
            items={variableItems}
            total={totals.variableTotal}
            onDelete={(index) => handleDeleteExpense("variable", index)}
          />
          <button
            className="mt-3 px-3 py-1.5 text-xs rounded-md border border-amber-400/70 text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 transition"
            onClick={() => handleAddExpense("variable")}
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
        </Card>
      </div>
    </div>
  );
}

function ListWithTotal({ items = [], total = 0, onDelete }) {
  return (
    <div className="space-y-2 text-sm">
      {items.length === 0 && (
        <p className="text-xs text-slate-500">No items yet.</p>
      )}
      {items.map((item, index) => {
        const amount = Number(item?.amount ?? 0);
        const label = item?.label || item?.name || `Item ${index + 1}`;
        return (
          <div
            key={(item?.id || label) + index}
            className="flex items-center justify-between text-slate-200 gap-2"
          >
            <div className="flex-1 flex justify-between">
              <span>{label}</span>
              <span className="text-slate-300">${amount.toFixed(2)}</span>
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
        );
      })}
      <div className="mt-2 pt-2 border-t border-slate-700 flex items-center justify-between text-xs">
        <span className="uppercase tracking-[0.18em] text-slate-500">
          Total
        </span>
        <span className="text-slate-100">${total.toFixed(2)}</span>
      </div>
    </div>
  );
}

export default BudgetPage;
