// src/pages/BudgetPage.jsx //
import React from "react";
import Card from "../components/Card.jsx";
import MiniDueCalendar from "../components/MiniDueCalendar.jsx";

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseISODateLocal(iso) {
  // iso: YYYY-MM-DD
  if (!iso || typeof iso !== "string") return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function clampMoney(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

function BudgetPage({ month, budget, totals = {}, onBudgetChange }) {
  const fixedTotal = Number(totals?.fixed ?? totals?.fixedTotal ?? 0);
  const variableTotal = Number(totals?.variable ?? totals?.variableTotal ?? 0);
  const incomeValue = Number(budget?.income ?? 0);
  const fixedItems = Array.isArray(budget?.fixed) ? budget.fixed : [];
  const variableItems = Array.isArray(budget?.variable) ? budget.variable : [];

  // ✅ bills/due-dates list
  const bills = Array.isArray(budget?.bills) ? budget.bills : [];
  const [selectedDueDateISO, setSelectedDueDateISO] = React.useState(() =>
    todayISO()
  );

  const billsDueSelectedDay = React.useMemo(() => {
    return bills.filter((b) => b?.dueDate === selectedDueDateISO);
  }, [bills, selectedDueDateISO]);

  const today = React.useMemo(() => parseISODateLocal(todayISO()), []);
  const todayStr = React.useMemo(() => {
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }, [today]);

  const upcomingWindowEnd = React.useMemo(() => {
    return today ? addDays(today, 7) : null;
  }, [today]);

  const billGroups = React.useMemo(() => {
    const normalized = bills
      .map((b) => {
        const due = parseISODateLocal(b?.dueDate);
        return { ...b, _due: due };
      })
      .filter((b) => b._due); // only valid dates

    const unpaid = normalized.filter((b) => !b.paid);

    const overdue = unpaid
      .filter((b) => b._due < today)
      .sort((a, c) => a._due - c._due);

    const dueToday = unpaid
      .filter((b) => b.dueDate === todayStr)
      .sort((a, c) => clampMoney(c.amount) - clampMoney(a.amount));

    const upcoming = unpaid
      .filter(
        (b) => upcomingWindowEnd && b._due > today && b._due <= upcomingWindowEnd
      )
      .sort((a, c) => a._due - c._due);

    return { overdue, dueToday, upcoming };
  }, [bills, today, todayStr, upcomingWindowEnd]);

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

  /* ---------------- Bills (Due Dates) ---------------- */

  function handleAddBill() {
    const name = window.prompt("Bill name (e.g., Rent, Phone, Car Payment):");
    if (!name) return;

    const amountInput = window.prompt(
      `Amount for "${name}" (numbers only):`,
      "0"
    );
    if (amountInput === null) return;
    const amount = Number(amountInput);
    if (!Number.isFinite(amount)) {
      window.alert("That didn't look like a valid number.");
      return;
    }

    const dueDate = window.prompt(
      "Due date (YYYY-MM-DD):",
      selectedDueDateISO || todayISO()
    );
    if (!dueDate) return;

    // very light validation
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      window.alert("Please use YYYY-MM-DD format (example: 2026-01-15).");
      return;
    }

    const frequency = window.prompt(
      "Frequency? (once, weekly, biweekly, monthly, yearly)",
      "monthly"
    );
    if (frequency === null) return;

    const nextBill = {
      id: `bill-${Date.now()}`,
      name: name.trim(),
      amount,
      dueDate,
      frequency: (frequency || "monthly").trim().toLowerCase(),
      paid: false,
    };

    onBudgetChange({ ...budget, bills: [...bills, nextBill] });
    setSelectedDueDateISO(dueDate);
  }

  function handleToggleBillPaid(billId) {
    const nextBills = bills.map((b) =>
      b.id === billId ? { ...b, paid: !b.paid } : b
    );
    onBudgetChange({ ...budget, bills: nextBills });
  }

  function handleDeleteBill(billId) {
    if (!window.confirm("Delete this bill/due date?")) return;
    const nextBills = bills.filter((b) => b.id !== billId);
    onBudgetChange({ ...budget, bills: nextBills });
  }

  function isOverdueUnpaid(b) {
    if (!b) return false;
    if (b.paid) return false;
    const due = parseISODateLocal(b.dueDate);
    if (!due) return false;
    return due < today;
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
            type="button"
          >
            Edit Income
          </button>
        </Card>

        <Card title="FIXED EXPENSES">
          <ListWithTotal
            items={fixedItems}
            total={fixedTotal}
            onDelete={(index) => handleDeleteExpense("fixed", index)}
          />
          <button
            className="mt-3 px-3 py-1.5 text-xs rounded-md border border-rose-400/70 text-rose-200 bg-rose-500/10 hover:bg-rose-500/20 transition"
            onClick={() => handleAddExpense("fixed")}
            type="button"
          >
            + Add Fixed Expense
          </button>
        </Card>

        <Card title="VARIABLE SPENDING">
          <ListWithTotal
            items={variableItems}
            total={variableTotal}
            onDelete={(index) => handleDeleteExpense("variable", index)}
          />
          <button
            className="mt-3 px-3 py-1.5 text-xs rounded-md border border-amber-400/70 text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 transition"
            onClick={() => handleAddExpense("variable")}
            type="button"
          >
            + Add Variable Expense
          </button>
        </Card>

        <Card title="REMAINING FOR GOALS">
          <div className="text-2xl font-semibold text-cyan-300">
            ${Number(totals?.leftover ?? 0).toFixed(2)}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            This is what's left after income minus all listed expenses.
          </p>
        </Card>

        {/* ✅ Bills + Mini Calendar */}
        <Card title="BILLS & DUE DATES">
          <MiniDueCalendar
            items={bills}
            selectedDateISO={selectedDueDateISO}
            onSelectDate={setSelectedDueDateISO}
            initialMonthISO={setSelectedDueDateISO}
          />

          {/* ✅ Upcoming / Today / Overdue panel */}
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <BillsPanel
              title="OVERDUE"
              subtitle="Unpaid past due"
              emptyText="No overdue bills 🎉"
              items={billGroups.overdue}
              tone="rose"
              onJump={(iso) => setSelectedDueDateISO(iso)}
              onTogglePaid={handleToggleBillPaid}
              onDelete={handleDeleteBill}
            />

            <BillsPanel
              title="DUE TODAY"
              subtitle={todayStr}
              emptyText="Nothing due today."
              items={billGroups.dueToday}
              tone="amber"
              onJump={(iso) => setSelectedDueDateISO(iso)}
              onTogglePaid={handleToggleBillPaid}
              onDelete={handleDeleteBill}
            />

            <BillsPanel
              title="UPCOMING"
              subtitle="Next 7 days"
              emptyText="No upcoming bills."
              items={billGroups.upcoming}
              tone="cyan"
              onJump={(iso) => setSelectedDueDateISO(iso)}
              onTogglePaid={handleToggleBillPaid}
              onDelete={handleDeleteBill}
            />
          </div>

          {/* Selected day list */}
          <div className="mt-4 text-xs text-slate-400">
            Due on{" "}
            <span className="text-slate-200">{selectedDueDateISO}</span>
          </div>

          <div className="mt-2 space-y-2 text-sm">
            {billsDueSelectedDay.length === 0 ? (
              <p className="text-xs text-slate-500">No bills due that day.</p>
            ) : (
              billsDueSelectedDay.map((b) => {
                const amt = clampMoney(b?.amount);
                const overdue = isOverdueUnpaid(b);
                return (
                  <div
                    key={b.id}
                    className={[
                      "flex items-center justify-between gap-2 rounded-md border bg-black/20 px-3 py-2",
                      overdue
                        ? "border-rose-400/60"
                        : "border-slate-700/70",
                    ].join(" ")}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-200">{b.name}</span>
                        <span className="text-slate-400">
                          ${amt.toFixed(2)}
                        </span>
                        {overdue && (
                          <span className="text-[0.65rem] rounded-full border border-rose-400/60 px-2 py-0.5 text-rose-200 bg-rose-500/10">
                            overdue
                          </span>
                        )}
                      </div>
                      <div className="text-[0.7rem] text-slate-500">
                        {b.frequency || "monthly"} •{" "}
                        {b.paid ? "paid" : "unpaid"}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        className="px-2 py-1 text-[0.7rem] rounded-md border border-slate-600/70 text-slate-200 hover:border-cyan-400/60"
                        onClick={() => handleToggleBillPaid(b.id)}
                        type="button"
                      >
                        {b.paid ? "Unpay" : "Paid"}
                      </button>
                      <button
                        className="text-[0.75rem] text-slate-500 hover:text-rose-400"
                        onClick={() => handleDeleteBill(b.id)}
                        type="button"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <button
            className="mt-3 px-3 py-1.5 text-xs rounded-md border border-cyan-400/70 text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 transition"
            onClick={handleAddBill}
            type="button"
          >
            + Add Bill / Due Date
          </button>
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
                type="button"
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
        <span className="text-slate-100">${Number(total).toFixed(2)}</span>
      </div>
    </div>
  );
}

function BillsPanel({
  title,
  subtitle,
  items = [],
  emptyText,
  tone = "cyan", // "rose" | "amber" | "cyan"
  onJump = () => {},
  onTogglePaid = () => {},
  onDelete = () => {},
}) {
  const toneStyles = {
    rose: "border-rose-400/30 text-rose-200 bg-rose-500/5",
    amber: "border-amber-400/30 text-amber-200 bg-amber-500/5",
    cyan: "border-cyan-400/30 text-cyan-200 bg-cyan-500/5",
  };

  return (
    <div
      className={`rounded-md border ${
        toneStyles[tone] || toneStyles.cyan
      } p-3`}
    >
      <div className="flex items-baseline justify-between">
        <div className="text-[0.7rem] tracking-[0.18em] uppercase">
          {title}
        </div>
        <div className="text-[0.7rem] text-slate-400">{subtitle}</div>
      </div>

      <div className="mt-2 space-y-2">
        {items.length === 0 ? (
          <div className="text-xs text-slate-500">{emptyText}</div>
        ) : (
          items.slice(0, 5).map((b) => {
            const amt = clampMoney(b?.amount);
            return (
              <div
                key={b.id}
                className="flex items-center justify-between gap-2 rounded-md border border-slate-700/60 bg-black/20 px-2 py-2"
              >
                <button
                  type="button"
                  className="flex-1 text-left"
                  onClick={() => onJump(b.dueDate)}
                  title="Jump to this day"
                >
                  <div className="text-xs text-slate-200 leading-4">
                    {b.name}
                    <span className="text-slate-400">
                      {" "}
                      • ${amt.toFixed(2)}
                    </span>
                  </div>
                  <div className="text-[0.7rem] text-slate-500">
                    {b.dueDate} • {b.frequency || "monthly"}
                  </div>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="px-2 py-1 text-[0.7rem] rounded-md border border-slate-600/70 text-slate-200 hover:border-cyan-400/60"
                    onClick={() => onTogglePaid(b.id)}
                  >
                    {b.paid ? "Unpay" : "Paid"}
                  </button>
                  <button
                    type="button"
                    className="text-[0.75rem] text-slate-500 hover:text-rose-400"
                    onClick={() => onDelete(b.id)}
                    aria-label="Delete bill"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })
        )}

        {items.length > 5 && (
          <div className="text-[0.7rem] text-slate-500">
            +{items.length - 5} more…
          </div>
        )}
      </div>
    </div>
  );
}

export default BudgetPage;
