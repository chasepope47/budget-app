// BudgetPage - updated to use normalized Supabase-backed props
import React from "react";
import Card from "../components/Card.jsx";

// --------------------
// Date + money helpers
// --------------------
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseISODateLocal(iso) {
  if (!iso || typeof iso !== "string") return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function formatISODate(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function addMonths(date, n) {
  const d = new Date(date);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const maxDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, maxDay));
  return d;
}

function clampMoney(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

function monthKeyFromISO(iso) {
  return (iso || "").slice(0, 7);
}

function checkKey(templateId, dueDateISO) {
  return `${templateId}|${dueDateISO}`;
}

function expandTemplatesForMonth(templates = [], monthKey) {
  if (!monthKey || monthKey.length < 7) return [];
  const start = parseISODateLocal(`${monthKey}-01`);
  if (!start) return [];
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
  end.setHours(0, 0, 0, 0);
  const out = [];

  const pushIfInRange = (t, dt) => {
    if (!dt) return;
    const d = new Date(dt);
    d.setHours(0, 0, 0, 0);
    if (d < start || d > end) return;
    out.push({ templateId: t.id, label: t.label || "Due item", amount: clampMoney(t.amount), dueDate: formatISODate(d) });
  };

  for (const t of (Array.isArray(templates) ? templates : [])) {
    if (!t?.id) continue;
    const cadence = String(t.cadence || t.kind || "once").toLowerCase();
    const startDate = parseISODateLocal(t.start_date || t.startDate);
    if (!startDate) continue;

    if (cadence === "once") { pushIfInRange(t, startDate); continue; }
    if (cadence === "weekly" || cadence === "biweekly") {
      const step = cadence === "weekly" ? 7 : 14;
      let cur = new Date(startDate); cur.setHours(0, 0, 0, 0);
      if (cur < start) { const diff = Math.floor((start - cur) / 86400000); cur = addDays(cur, Math.ceil(diff / step) * step); }
      while (cur <= end) { pushIfInRange(t, cur); cur = addDays(cur, step); }
      continue;
    }
    if (cadence === "monthly") {
      const desiredDay = Number(t.day_of_month || t.dayOfMonth) || startDate.getDate();
      let cur = new Date(startDate); cur.setHours(0, 0, 0, 0);
      while (cur < start) cur = addMonths(cur, 1);
      while (cur <= end) {
        const maxDay = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate();
        const dt = new Date(cur.getFullYear(), cur.getMonth(), Math.min(desiredDay, maxDay));
        dt.setHours(0, 0, 0, 0);
        pushIfInRange(t, dt);
        cur = addMonths(cur, 1);
      }
      continue;
    }
    if (cadence === "yearly") {
      const dt = new Date(start.getFullYear(), startDate.getMonth(), startDate.getDate());
      dt.setHours(0, 0, 0, 0);
      pushIfInRange(t, dt);
      continue;
    }
    pushIfInRange(t, startDate);
  }

  out.sort((a, b) => (a.dueDate > b.dueDate ? 1 : a.dueDate < b.dueDate ? -1 : 0));
  return out;
}

function BudgetPage({
  month,
  monthKey,
  estimatedIncome = 0,
  useActualIncome = false,
  actualIncome = 0,
  fixedItems = [],
  variableItems = [],
  fixedTotal = 0,
  variableTotal = 0,
  leftover = 0,
  scheduledTemplates = [],
  scheduleChecks = {},
  accounts = [],
  currentAccountId = null,
  householdId,
  onSetEstimatedIncome = () => {},
  onToggleUseActualIncome = () => {},
  onAddBudgetItem = () => {},
  onDeleteBudgetItem = () => {},
  onAddTransaction = () => {},
  onAddScheduledTemplate = () => {},
  onDeleteScheduledTemplate = () => {},
  onToggleScheduleCheck = () => {},
}) {
  const [selectedDueDateISO, setSelectedDueDateISO] = React.useState(() => todayISO());
  const [calendarMonthISO, setCalendarMonthISO] = React.useState(() => `${monthKeyFromISO(todayISO())}-01`);

  React.useEffect(() => {
    if (!selectedDueDateISO) return;
    setCalendarMonthISO(`${monthKeyFromISO(selectedDueDateISO)}-01`);
  }, [selectedDueDateISO]);

  const calendarMonthKey = React.useMemo(() => monthKeyFromISO(calendarMonthISO), [calendarMonthISO]);
  const occurrences = React.useMemo(() => expandTemplatesForMonth(scheduledTemplates, calendarMonthKey), [scheduledTemplates, calendarMonthKey]);

  const templateById = React.useMemo(() => {
    const map = {};
    for (const t of scheduledTemplates) if (t?.id) map[t.id] = t;
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
    const normalized = occurrences.map((o) => ({
      ...o,
      _due: parseISODateLocal(o?.dueDate),
      paid: !!scheduleChecks[checkKey(o.templateId, o.dueDate)],
      cadence: templateById[o.templateId]?.cadence || "once",
    })).filter((o) => o._due);

    const unpaid = normalized.filter((o) => !o.paid);
    return {
      overdue: unpaid.filter((o) => today && o._due < today).sort((a, b) => a._due - b._due),
      dueToday: unpaid.filter((o) => o.dueDate === todayStr).sort((a, b) => clampMoney(b.amount) - clampMoney(a.amount)),
      upcoming: unpaid.filter((o) => upcomingWindowEnd && today && o._due > today && o._due <= upcomingWindowEnd).sort((a, b) => a._due - b._due),
    };
  }, [occurrences, scheduleChecks, templateById, today, todayStr, upcomingWindowEnd]);

  function handleEditEstimatedIncome() {
    const input = window.prompt("Estimated monthly income amount:", estimatedIncome.toString());
    if (input === null) return;
    const next = Number(input);
    if (!Number.isFinite(next)) { window.alert("Enter a valid number."); return; }
    onSetEstimatedIncome(next);
  }

  function handleAddQuickTransaction(kind) {
    const isIncome = kind === "income";
    const description = window.prompt("Description:", isIncome ? "Paycheck" : "Expense");
    if (!description) return;
    const amountInput = window.prompt("Amount:", "0");
    if (amountInput === null) return;
    const rawAmt = Number(amountInput);
    if (!Number.isFinite(rawAmt)) { window.alert("Enter a valid number."); return; }
    const dateInput = window.prompt("Date (YYYY-MM-DD):", selectedDueDateISO || todayISO());
    if (!dateInput) return;
    const categoryInput = window.prompt("Category (optional):", isIncome ? "Income" : "");
    const amount = isIncome ? Math.abs(rawAmt) : -Math.abs(rawAmt);
    onAddTransaction({
      description: description.trim(),
      amount,
      date: dateInput,
      category: (categoryInput || "").trim(),
      accountId: currentAccountId || null,
      flowType: isIncome ? "income" : "expense",
    });
  }

  async function createRecurringTemplate({ label, amount, kind, source, defaultDateISO }) {
    const wantsRecurring = window.confirm("Add to calendar as repeating due item?");
    if (!wantsRecurring) return null;
    const startDateInput = window.prompt("Start date (YYYY-MM-DD):", defaultDateISO || todayISO());
    if (!startDateInput) return null;
    const startDate = parseISODateLocal(startDateInput);
    if (!startDate) { window.alert("Invalid date."); return null; }
    const cadenceInput = window.prompt("Cadence? (once, weekly, biweekly, monthly, yearly)", "monthly");
    if (cadenceInput === null) return null;
    const allowed = ["once", "weekly", "biweekly", "monthly", "yearly"];
    const cadence = allowed.includes((cadenceInput || "").toLowerCase()) ? cadenceInput.toLowerCase() : "monthly";
    const template = await onAddScheduledTemplate({
      household_id: householdId,
      label: (label || "").trim() || "Due item",
      amount: Number(amount) || 0,
      kind: kind || "expense",
      source,
      start_date: formatISODate(startDate),
      cadence,
      day_of_month: startDate.getDate(),
      account_id: currentAccountId || null,
    });
    if (template) {
      const startISO = formatISODate(startDate);
      setSelectedDueDateISO(startISO);
      setCalendarMonthISO(`${monthKeyFromISO(startISO)}-01`);
    }
    return template;
  }

  async function handleAddBudgetItem(sectionKey) {
    const name = window.prompt(`New ${sectionKey} item name:`);
    if (!name) return;
    const amountInput = window.prompt(`Amount for "${name}":`);
    const amount = Number(amountInput);
    if (!Number.isFinite(amount)) { window.alert("Invalid number."); return; }
    const source = sectionKey === "fixed" ? "budget-fixed" : "budget-variable";
    const templateId = await createRecurringTemplate({ label: name, amount, kind: "expense", source, defaultDateISO: selectedDueDateISO || todayISO() });
    await onAddBudgetItem(sectionKey, name, amount, templateId || undefined);
  }

  async function handleDeleteBudgetItem(sectionKey, item) {
    if (!window.confirm("Delete this item?")) return;
    if (item?.template_id) {
      const del = window.confirm("This item is linked to a calendar due item. Delete that too?");
      if (del) await onDeleteScheduledTemplate(item.template_id);
    }
    await onDeleteBudgetItem(item.id);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-100">{month} Budget</h1>
        <span className="text-xs text-slate-400">Income + Expenses + Schedule</span>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Income card */}
        <Card title="INCOME">
          <div className="grid gap-2">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-[0.7rem] uppercase tracking-[0.18em] text-slate-500">Estimated</div>
                <div className="text-2xl font-semibold text-emerald-300">${clampMoney(estimatedIncome).toFixed(2)}</div>
              </div>
              <div className="text-right">
                <div className="text-[0.7rem] uppercase tracking-[0.18em] text-slate-500">Actual so far</div>
                <div className="text-2xl font-semibold text-cyan-200">${clampMoney(actualIncome).toFixed(2)}</div>
              </div>
            </div>
            <div className="text-xs text-slate-400">
              Leftover ({useActualIncome ? "actual" : "estimated"}):
              <span className="text-slate-100 font-semibold ml-1">${clampMoney(leftover).toFixed(2)}</span>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button className="px-3 py-1.5 text-xs rounded-md border border-emerald-400/70 text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/20 transition"
                onClick={handleEditEstimatedIncome} type="button">Edit estimate</button>
              <button className="px-3 py-1.5 text-xs rounded-md border border-cyan-400/70 text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 transition"
                onClick={onToggleUseActualIncome} type="button">
                {useActualIncome ? "Using actual ✓" : "Use actual income"}
              </button>
              <button className="px-3 py-1.5 text-xs rounded-md border border-cyan-400/70 text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 transition"
                onClick={() => handleAddQuickTransaction("income")} type="button">+ Add income</button>
            </div>
          </div>
        </Card>

        {/* Fixed expenses */}
        <Card title="FIXED EXPENSES">
          <ListWithTotal items={fixedItems} total={fixedTotal} onDelete={(item) => handleDeleteBudgetItem("fixed", item)} />
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="px-3 py-1.5 text-xs rounded-md border border-rose-400/70 text-rose-200 bg-rose-500/10 hover:bg-rose-500/20 transition"
              onClick={() => handleAddBudgetItem("fixed")} type="button">+ Add Fixed Expense</button>
            <button className="px-3 py-1.5 text-xs rounded-md border border-rose-400/60 text-rose-200 bg-black/10 hover:bg-rose-500/10 transition"
              onClick={() => handleAddQuickTransaction("expense")} type="button">+ Log expense</button>
          </div>
        </Card>

        {/* Variable spending */}
        <Card title="VARIABLE SPENDING">
          <ListWithTotal items={variableItems} total={variableTotal} onDelete={(item) => handleDeleteBudgetItem("variable", item)} />
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="px-3 py-1.5 text-xs rounded-md border border-amber-400/70 text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 transition"
              onClick={() => handleAddBudgetItem("variable")} type="button">+ Add Variable Expense</button>
            <button className="px-3 py-1.5 text-xs rounded-md border border-amber-400/60 text-amber-200 bg-black/10 hover:bg-amber-500/10 transition"
              onClick={() => handleAddQuickTransaction("expense")} type="button">+ Log expense</button>
          </div>
        </Card>

        {/* Due dates */}
        <Card title="MONTHLY DUE DATES">
          <div className="space-y-3">
            <BillsPanel title="OVERDUE" subtitle="Due before today" emptyText="No overdue items 🎉"
              items={occurrenceGroups.overdue} tone="rose" templateLookup={templateById} scheduleChecks={scheduleChecks}
              onJump={setSelectedDueDateISO} onTogglePaid={(occ) => onToggleScheduleCheck(occ.templateId, occ.dueDate)}
              onDelete={(occ) => onDeleteScheduledTemplate(occ.templateId)} />
            <BillsPanel title="DUE TODAY" subtitle={todayStr} emptyText="Nothing due today."
              items={occurrenceGroups.dueToday} tone="amber" templateLookup={templateById} scheduleChecks={scheduleChecks}
              onJump={setSelectedDueDateISO} onTogglePaid={(occ) => onToggleScheduleCheck(occ.templateId, occ.dueDate)}
              onDelete={(occ) => onDeleteScheduledTemplate(occ.templateId)} />
            <BillsPanel title="UPCOMING" subtitle="Next 7 days" emptyText="No upcoming items."
              items={occurrenceGroups.upcoming} tone="cyan" templateLookup={templateById} scheduleChecks={scheduleChecks}
              onJump={setSelectedDueDateISO} onTogglePaid={(occ) => onToggleScheduleCheck(occ.templateId, occ.dueDate)}
              onDelete={(occ) => onDeleteScheduledTemplate(occ.templateId)} />
          </div>

          <div className="mt-4 text-xs text-slate-400">Due on <span className="text-slate-200">{selectedDueDateISO}</span></div>
          <div className="mt-2 space-y-2 text-sm">
            {selectedDayItems.length === 0
              ? <p className="text-xs text-slate-500">No items due that day.</p>
              : selectedDayItems.map((item) => {
                  const amt = clampMoney(item?.amount);
                  const paid = !!scheduleChecks[checkKey(item.templateId, item.dueDate)];
                  const overdue = !paid && !!today && parseISODateLocal(item.dueDate) && parseISODateLocal(item.dueDate) < today;
                  const cadence = templateById[item.templateId]?.cadence || "once";
                  return (
                    <div key={`${item.templateId}-${item.dueDate}`}
                      className={`flex items-center justify-between gap-2 rounded-md border bg-black/20 px-3 py-2 ${overdue ? "border-rose-400/60" : "border-slate-700/70"}`}>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-200">{item.label}</span>
                          <span className="text-slate-400">${amt.toFixed(2)}</span>
                          {overdue && <span className="text-[0.65rem] rounded-full border border-rose-400/60 px-2 py-0.5 text-rose-200 bg-rose-500/10">overdue</span>}
                        </div>
                        <div className="text-[0.7rem] text-slate-500">{cadence} · {paid ? "paid" : "unpaid"}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button className="px-2 py-1 text-[0.7rem] rounded-md border border-slate-600/70 text-slate-200 hover:border-cyan-400/60"
                          onClick={() => onToggleScheduleCheck(item.templateId, item.dueDate)} type="button">
                          {paid ? "Unpay" : "Paid"}
                        </button>
                        <button className="text-[0.75rem] text-slate-500 hover:text-rose-400"
                          onClick={() => onDeleteScheduledTemplate(item.templateId)} type="button" aria-label="Delete">✕</button>
                      </div>
                    </div>
                  );
                })}
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
      {items.map((item) => {
        const amount = clampMoney(item?.amount);
        const label = item?.label || `Item`;
        const linked = !!item?.template_id;
        return (
          <div key={item.id} className="flex items-center justify-between text-slate-200 gap-2">
            <div className="flex-1 flex justify-between items-center">
              <span className="flex items-center gap-2">
                {label}
                {linked && <span className="rounded-full border border-slate-600/70 px-2 py-[2px] text-[0.65rem] text-slate-200 bg-black/20">linked</span>}
              </span>
              <span className="text-slate-300">${amount.toFixed(2)}</span>
            </div>
            {onDelete && (
              <button className="text-[0.65rem] text-slate-500 hover:text-rose-400" onClick={() => onDelete(item)} type="button">✕</button>
            )}
          </div>
        );
      })}
      <div className="mt-2 pt-2 border-t border-slate-700 flex items-center justify-between text-xs">
        <span className="uppercase tracking-[0.18em] text-slate-500">Total</span>
        <span className="text-slate-100">${clampMoney(total).toFixed(2)}</span>
      </div>
    </div>
  );
}

function BillsPanel({ title, subtitle, items = [], emptyText, tone = "cyan", templateLookup = {}, scheduleChecks = {}, onJump, onTogglePaid, onDelete }) {
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
        {items.length === 0
          ? <div className="text-xs text-slate-500">{emptyText}</div>
          : items.slice(0, 5).map((item) => {
              const amt = clampMoney(item?.amount);
              const cadence = templateLookup[item.templateId]?.cadence || "once";
              const paid = !!scheduleChecks[checkKey(item.templateId, item.dueDate)];
              return (
                <div key={`${item.templateId}-${item.dueDate}`}
                  className="flex items-center justify-between gap-2 rounded-md border border-slate-700/60 bg-black/20 px-2 py-2">
                  <button type="button" className="flex-1 text-left" onClick={() => onJump(item.dueDate)}>
                    <div className="text-xs text-slate-200 leading-4">
                      {item.label}<span className="text-slate-400"> · ${amt.toFixed(2)}</span>
                      {paid && <span className="ml-2 text-[0.65rem] rounded-full border border-emerald-400/50 px-2 py-[2px] text-emerald-200 bg-emerald-500/10">paid</span>}
                    </div>
                    <div className="text-[0.7rem] text-slate-500">{item.dueDate} · {cadence}</div>
                  </button>
                  <div className="flex items-center gap-2">
                    <button type="button" className="px-2 py-1 text-[0.7rem] rounded-md border border-slate-600/70 text-slate-200 hover:border-cyan-400/60"
                      onClick={() => onTogglePaid(item)}>{paid ? "Unpay" : "Paid"}</button>
                    <button type="button" className="text-[0.75rem] text-slate-500 hover:text-rose-400"
                      onClick={() => onDelete(item)} aria-label="Delete">✕</button>
                  </div>
                </div>
              );
            })}
        {items.length > 5 && <div className="text-[0.7rem] text-slate-500">+{items.length - 5} more</div>}
      </div>
    </div>
  );
}

export default BudgetPage;
