// src/pages/BudgetPage.jsx //
import React from "react";
import Card from "../components/Card.jsx";
import MiniDueCalendar from "../components/MiniDueCalendar.jsx";
import { expandTemplatesForMonth, checkKey } from "../lib/schedule.js";

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseISODateLocal(iso) {
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

function formatISODate(date) {
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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

function BudgetPage({
  month,
  budget,
  totals = {},
  onBudgetChange,
  scheduledTemplates = [],
  scheduleChecks = {},
  onScheduledTemplatesChange = () => {},
  onScheduleChecksChange = () => {},
}) {
  const fixedTotal = Number(totals?.fixed ?? totals?.fixedTotal ?? 0);
  const variableTotal = Number(totals?.variable ?? totals?.variableTotal ?? 0);
  const incomeValue = Number(budget?.income ?? 0);
  const fixedItems = Array.isArray(budget?.fixed) ? budget.fixed : [];
  const variableItems = Array.isArray(budget?.variable) ? budget.variable : [];

  const [selectedDueDateISO, setSelectedDueDateISO] = React.useState(() => todayISO());

  const monthKey = React.useMemo(() => {
    if (typeof month === "string") return month.slice(0, 7);
    return month;
  }, [month]);

  const occurrences = React.useMemo(
    () => expandTemplatesForMonth(scheduledTemplates, monthKey),
    [scheduledTemplates, monthKey]
  );

  const templateById = React.useMemo(() => {
    const map = {};
    for (const t of Array.isArray(scheduledTemplates) ? scheduledTemplates : []) {
      if (t?.id) map[t.id] = t;
    }
    return map;
  }, [scheduledTemplates]);

  const occurrencesByDate = React.useMemo(() => {
    const map = new Map();
    for (const item of occurrences) {
      const key = item?.dueDate;
      if (!key) continue;
      const list = map.get(key) || [];
      list.push(item);
      map.set(key, list);
    }
    return map;
  }, [occurrences]);

  const selectedDayItems = occurrencesByDate.get(selectedDueDateISO) || [];

  const today = React.useMemo(() => parseISODateLocal(todayISO()), []);
  const todayStr = React.useMemo(() => (today ? formatISODate(today) : ""), [today]);
  const upcomingWindowEnd = React.useMemo(() => (today ? addDays(today, 7) : null), [today]);

  const occurrenceGroups = React.useMemo(() => {
    const normalized = occurrences
      .map((o) => {
        const due = parseISODateLocal(o?.dueDate);
        return {
          ...o,
          _due: due,
          paid: !!scheduleChecks[checkKey(o.templateId, o.dueDate)]?.paid,
          cadence: templateById[o.templateId]?.cadence || "once",
        };
      })
      .filter((o) => o._due);

    const unpaid = normalized.filter((o) => !o.paid);

    const overdue = unpaid
      .filter((o) => today && o._due < today)
      .sort((a, b) => a._due - b._due);

    const dueToday = unpaid
      .filter((o) => o.dueDate === todayStr)
      .sort((a, b) => clampMoney(b.amount) - clampMoney(a.amount));

    const upcoming = unpaid
      .filter((o) => upcomingWindowEnd && today && o._due > today && o._due <= upcomingWindowEnd)
      .sort((a, b) => a._due - b._due);

    return { overdue, dueToday, upcoming };
  }, [occurrences, scheduleChecks, templateById, today, todayStr, upcomingWindowEnd]);

  function handleEditIncome() {
    const input = window.prompt("Monthly income amount:", incomeValue.toString());
    if (input === null) return;
    const next = Number(input);
    if (!Number.isFinite(next)) {
      window.alert("Enter a valid number for income.");
      return;
    }
    onBudgetChange({ ...budget, income: next });
  }

  function promptRecurringTemplate({ label, amount, source }) {
    const wantsRecurring = window.confirm("Add to calendar as repeating due item?");
    if (!wantsRecurring) return;

    const defaultDate = selectedDueDateISO || todayISO();
    const startDateInput = window.prompt("Start date (YYYY-MM-DD):", defaultDate);
    if (!startDateInput) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDateInput)) {
      window.alert("Please use YYYY-MM-DD format (example: 2026-01-15).");
      return;
    }
    const startDate = parseISODateLocal(startDateInput);
    if (!startDate) {
      window.alert("Could not parse that date. Try again with YYYY-MM-DD.");
      return;
    }

    const cadenceInput = window.prompt(
      "Cadence? (once, weekly, biweekly, monthly, yearly)",
      "monthly"
    );
    if (cadenceInput === null) return;
    const allowed = ["once", "weekly", "biweekly", "monthly", "yearly"];
    const cadence = (cadenceInput || "monthly").trim().toLowerCase();
    const normalizedCadence = allowed.includes(cadence) ? cadence : "monthly";

    const nextTemplate = {
      id: `sched-${Date.now()}`,
      label: (label || "").trim() || "Due item",
      amount: Number(amount) || 0,
      kind: "expense",
      source,
      startDate: formatISODate(startDate),
      cadence: normalizedCadence,
      dayOfMonth: startDate.getDate(),
    };

    const list = Array.isArray(scheduledTemplates) ? scheduledTemplates : [];
    onScheduledTemplatesChange([...list, nextTemplate]);
    setSelectedDueDateISO(formatISODate(startDate));
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

    const source = sectionKey === "fixed" ? "budget-fixed" : "budget-variable";
    promptRecurringTemplate({ label: name, amount, source });
  }

  function handleDeleteExpense(sectionKey, index) {
    if (!window.confirm("Delete this item?")) return;
    const currentList = sectionKey === "fixed" ? fixedItems : variableItems;
    const updatedSection = currentList.filter((_, i) => i !== index);
    const updatedBudget = { ...budget, [sectionKey]: updatedSection };
    onBudgetChange(updatedBudget);
  }

  function handleTogglePaidOccurrence(occurrence) {
    if (!occurrence?.templateId || !occurrence?.dueDate) return;
    const key = checkKey(occurrence.templateId, occurrence.dueDate);
    const currentPaid = !!scheduleChecks[key]?.paid;
    onScheduleChecksChange({
      ...(scheduleChecks || {}),
      [key]: { paid: !currentPaid },
    });
  }

  function handleDeleteTemplate(templateId) {
    if (!templateId) return;
    if (!window.confirm("Delete this repeating due item?")) return;

    const list = Array.isArray(scheduledTemplates) ? scheduledTemplates : [];
    const nextTemplates = list.filter((t) => t.id !== templateId);
    onScheduledTemplatesChange(nextTemplates);

    const entries = Object.entries(scheduleChecks || {});
    const filteredChecks = entries.filter(([k]) => !k.startsWith(`${templateId}|`));
    onScheduleChecksChange(Object.fromEntries(filteredChecks));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-100">{month} Budget</h1>
        <span className="text-xs text-slate-400">Income + Expenses + Goals</span>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card title="INCOME">
          <div className="text-3xl font-semibold text-emerald-300">
            ${incomeValue.toFixed(2)}
          </div>
          <p className="mt-1 text-xs text-slate-400">Total take-home income for the active month.</p>
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

        <Card title="MONTHLY DUE DATES">
          <div className="grid gap-3 md:grid-cols-2">
            <MiniDueCalendar
              items={occurrences}
              selectedDateISO={selectedDueDateISO}
              onSelectDate={setSelectedDueDateISO}
              initialMonthISO={selectedDueDateISO}
            />

            <div className="space-y-3">
              <BillsPanel
                title="OVERDUE"
                subtitle="Due before today"
                emptyText="No overdue items 🎉"
                items={occurrenceGroups.overdue}
                tone="rose"
                templateLookup={templateById}
                onJump={(iso) => setSelectedDueDateISO(iso)}
                onTogglePaid={(occ) => handleTogglePaidOccurrence(occ)}
                onDelete={(occ) => handleDeleteTemplate(occ.templateId)}
              />

              <BillsPanel
                title="DUE TODAY"
                subtitle={todayStr}
                emptyText="Nothing due today."
                items={occurrenceGroups.dueToday}
                tone="amber"
                templateLookup={templateById}
                onJump={(iso) => setSelectedDueDateISO(iso)}
                onTogglePaid={(occ) => handleTogglePaidOccurrence(occ)}
                onDelete={(occ) => handleDeleteTemplate(occ.templateId)}
              />

              <BillsPanel
                title="UPCOMING"
                subtitle="Next 7 days"
                emptyText="No upcoming items."
                items={occurrenceGroups.upcoming}
                tone="cyan"
                templateLookup={templateById}
                onJump={(iso) => setSelectedDueDateISO(iso)}
                onTogglePaid={(occ) => handleTogglePaidOccurrence(occ)}
                onDelete={(occ) => handleDeleteTemplate(occ.templateId)}
              />
            </div>
          </div>

          {/* Selected day list */}
          <div className="mt-4 text-xs text-slate-400">
            Due on <span className="text-slate-200">{selectedDueDateISO}</span>
          </div>

          <div className="mt-2 space-y-2 text-sm">
            {selectedDayItems.length === 0 ? (
              <p className="text-xs text-slate-500">No items due that day.</p>
            ) : (
              selectedDayItems.map((item) => {
                const amt = clampMoney(item?.amount);
                const paid = !!scheduleChecks[checkKey(item.templateId, item.dueDate)]?.paid;
                const overdue =
                  !paid &&
                  !!today &&
                  parseISODateLocal(item.dueDate) &&
                  parseISODateLocal(item.dueDate) < today;
                const cadence = templateById[item.templateId]?.cadence || "once";
                return (
                  <div
                    key={`${item.templateId}-${item.dueDate}`}
                    className={[
                      "flex items-center justify-between gap-2 rounded-md border bg-black/20 px-3 py-2",
                      overdue ? "border-rose-400/60" : "border-slate-700/70",
                    ].join(" ")}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-200">{item.label}</span>
                        <span className="text-slate-400">${amt.toFixed(2)}</span>
                        {overdue && (
                          <span className="text-[0.65rem] rounded-full border border-rose-400/60 px-2 py-0.5 text-rose-200 bg-rose-500/10">
                            overdue
                          </span>
                        )}
                      </div>
                      <div className="text-[0.7rem] text-slate-500">
                        {cadence} · {paid ? "paid" : "unpaid"}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        className="px-2 py-1 text-[0.7rem] rounded-md border border-slate-600/70 text-slate-200 hover:border-cyan-400/60"
                        onClick={() => handleTogglePaidOccurrence(item)}
                        type="button"
                      >
                        {paid ? "Unpay" : "Paid"}
                      </button>
                      <button
                        className="text-[0.75rem] text-slate-500 hover:text-rose-400"
                        onClick={() => handleDeleteTemplate(item.templateId)}
                        type="button"
                        aria-label="Delete due item"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function ListWithTotal({ items = [], total = 0, onDelete }) {
  return (
    <div className="space-y-2 text-sm">
      {items.length === 0 && <p className="text-xs text-slate-500">No items yet.</p>}
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
                aria-label="Delete item"
              >
                ✕
              </button>
            )}
          </div>
        );
      })}
      <div className="mt-2 pt-2 border-t border-slate-700 flex items-center justify-between text-xs">
        <span className="uppercase tracking-[0.18em] text-slate-500">Total</span>
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
  tone = "cyan",
  templateLookup = {},
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
    <div className={`rounded-md border ${toneStyles[tone] || toneStyles.cyan} p-3`}>
      <div className="flex items-baseline justify-between">
        <div className="text-[0.7rem] tracking-[0.18em] uppercase">{title}</div>
        <div className="text-[0.7rem] text-slate-400">{subtitle}</div>
      </div>

      <div className="mt-2 space-y-2">
        {items.length === 0 ? (
          <div className="text-xs text-slate-500">{emptyText}</div>
        ) : (
          items.slice(0, 5).map((item) => {
            const amt = clampMoney(item?.amount);
            const cadence = templateLookup[item.templateId]?.cadence || "once";
            return (
              <div
                key={`${item.templateId}-${item.dueDate}`}
                className="flex items-center justify-between gap-2 rounded-md border border-slate-700/60 bg-black/20 px-2 py-2"
              >
                <button
                  type="button"
                  className="flex-1 text-left"
                  onClick={() => onJump(item.dueDate)}
                  title="Jump to this day"
                >
                  <div className="text-xs text-slate-200 leading-4">
                    {item.label}
                    <span className="text-slate-400"> · ${amt.toFixed(2)}</span>
                  </div>
                  <div className="text-[0.7rem] text-slate-500">
                    {item.dueDate} · {cadence}
                  </div>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="px-2 py-1 text-[0.7rem] rounded-md border border-slate-600/70 text-slate-200 hover:border-cyan-400/60"
                    onClick={() => onTogglePaid(item)}
                  >
                    Paid
                  </button>
                  <button
                    type="button"
                    className="text-[0.75rem] text-slate-500 hover:text-rose-400"
                    onClick={() => onDelete(item)}
                    aria-label="Delete due item"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })
        )}

        {items.length > 5 && (
          <div className="text-[0.7rem] text-slate-500">+{items.length - 5} more</div>
        )}
      </div>
    </div>
  );
}

export default BudgetPage;
