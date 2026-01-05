// src/pages/BudgetPage.jsx
import React from "react";
import Card from "../components/Card.jsx";
import MiniDueCalendar from "../components/MiniDueCalendar.jsx";
import TransactionModal from "../components/TransactionModal.jsx";
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

function safeArr(v) {
  return Array.isArray(v) ? v : [];
}

export default function BudgetPage({
  month,
  budget,
  totals = {},
  onBudgetChange,
  scheduledTemplates = [],
  scheduleChecks = {},
  onScheduledTemplatesChange = () => {},
  onScheduleChecksChange = () => {},

  // NEW (from App.jsx)
  accounts = [],
  currentAccountId = "main",
  onAddTransaction = () => {},
}) {
  const fixedTotal = Number(totals?.fixed ?? totals?.fixedTotal ?? 0);
  const variableTotal = Number(totals?.variable ?? totals?.variableTotal ?? 0);
  const incomeValue = Number(budget?.income ?? 0);
  const fixedItems = safeArr(budget?.fixed);
  const variableItems = safeArr(budget?.variable);

  const [selectedDueDateISO, setSelectedDueDateISO] = React.useState(() => todayISO());

  // Income inline edit
  const [incomeDraft, setIncomeDraft] = React.useState(() => incomeValue.toFixed(2));
  React.useEffect(() => {
    setIncomeDraft(Number(incomeValue).toFixed(2));
  }, [incomeValue]);

  function commitIncome(nextStr) {
    const next = Number(nextStr);
    if (!Number.isFinite(next)) return;
    onBudgetChange({ ...budget, income: next });
  }

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
    for (const t of safeArr(scheduledTemplates)) {
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

    const list = safeArr(scheduledTemplates);
    const nextTemplates = list.filter((t) => t.id !== templateId);
    onScheduledTemplatesChange(nextTemplates);

    const entries = Object.entries(scheduleChecks || {});
    const filteredChecks = entries.filter(([k]) => !k.startsWith(`${templateId}|`));
    onScheduleChecksChange(Object.fromEntries(filteredChecks));
  }

  // Manual transaction modal
  const [txOpen, setTxOpen] = React.useState(false);

  function saveManualTx(tx) {
    onAddTransaction(tx);
  }

  function createRecurring(templateFields) {
    const nextTemplate = { id: `sched-${Date.now()}`, ...templateFields };
    onScheduledTemplatesChange([...safeArr(scheduledTemplates), nextTemplate]);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-100">{month} Budget</h1>
        <span className="text-xs text-slate-400">Income + Expenses + Goals</span>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card title="INCOME">
          <div className="text-[0.7rem] text-slate-400">
            Total take-home income for the active month.
          </div>

          <div className="mt-2 flex items-end gap-2">
            <div className="text-3xl font-semibold text-emerald-300">$</div>
            <input
              value={incomeDraft}
              onChange={(e) => setIncomeDraft(e.target.value)}
              onBlur={() => commitIncome(incomeDraft)}
              inputMode="decimal"
              className="w-44 bg-black/20 border border-slate-700 rounded-md px-3 py-2 text-slate-100 text-xl outline-none focus:border-cyan-400/60"
            />
            <button
              className="h-10 px-3 text-xs rounded-md border border-emerald-400/70 text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/20 transition"
              onClick={() => commitIncome(incomeDraft)}
              type="button"
            >
              Save
            </button>
          </div>
        </Card>

        <Card title="MONTHLY DUE DATES">
          <div className="grid gap-3 md:grid-cols-2">
            <MiniDueCalendar
              items={occurrences}
              selectedDateISO={selectedDueDateISO}
              onSelectDate={setSelectedDueDateISO}
              initialMonthISO={selectedDueDateISO}
              badgeMode="auto" // ✅ auto shows $ totals when amounts exist
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
                onTogglePaid={handleTogglePaidOccurrence}
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
                onTogglePaid={handleTogglePaidOccurrence}
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
                onTogglePaid={handleTogglePaidOccurrence}
                onDelete={(occ) => handleDeleteTemplate(occ.templateId)}
              />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="text-xs text-slate-400">
              Due on <span className="text-slate-200">{selectedDueDateISO}</span>
            </div>

            <button
              type="button"
              className="h-8 px-3 rounded-md border border-cyan-500/60 text-[0.7rem] font-medium text-cyan-200 hover:bg-cyan-500/10"
              onClick={() => setTxOpen(true)}
            >
              + Add Transaction
            </button>
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

        {/* (keep your Fixed/Variable cards here unchanged if you want — I’m not re-pasting them to save space) */}
      </div>

      <TransactionModal
        open={txOpen}
        title={`Add Transaction (${selectedDueDateISO})`}
        accounts={accounts}
        defaultAccountId={currentAccountId || "main"}
        initial={{
          date: selectedDueDateISO,
          accountId: currentAccountId || "main",
        }}
        allowRecurring={true}
        onCreateRecurring={createRecurring}
        onSave={saveManualTx}
        onClose={() => setTxOpen(false)}
      />
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
