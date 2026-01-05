// src/components/TransactionModal.jsx
import React from "react";

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isValidISODate(v) {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export default function TransactionModal({
  open,
  title = "Add Transaction",
  initial = {},
  accounts = [],
  defaultAccountId = "main",
  onClose = () => {},
  onSave = () => {},
  // optional: show recurring options
  allowRecurring = false,
  onCreateRecurring = () => {},
}) {
  const [description, setDescription] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [date, setDate] = React.useState(todayISO());
  const [category, setCategory] = React.useState("");
  const [accountId, setAccountId] = React.useState(defaultAccountId);

  const [makeRecurring, setMakeRecurring] = React.useState(false);
  const [cadence, setCadence] = React.useState("monthly");

  React.useEffect(() => {
    if (!open) return;

    setDescription(String(initial.description || ""));
    setAmount(
      initial.amount === 0 || typeof initial.amount === "number"
        ? String(initial.amount)
        : String(initial.amount || "")
    );
    setDate(String(initial.date || todayISO()));
    setCategory(String(initial.category || ""));
    setAccountId(String(initial.accountId || defaultAccountId));

    setMakeRecurring(false);
    setCadence("monthly");
  }, [open, initial, defaultAccountId]);

  if (!open) return null;

  function submit() {
    const desc = description.trim();
    if (!desc) return window.alert("Please enter a description.");

    const amt = Number(amount);
    if (!Number.isFinite(amt)) return window.alert("Please enter a valid number for amount.");

    if (!isValidISODate(date)) return window.alert("Use YYYY-MM-DD format for dates.");

    const tx = {
      description: desc,
      amount: amt,
      date,
      category: category.trim(),
      accountId: accountId || defaultAccountId || "main",
    };

    onSave(tx);

    if (allowRecurring && makeRecurring) {
      const allowed = ["once", "weekly", "biweekly", "monthly", "yearly"];
      const safeCadence = allowed.includes(cadence) ? cadence : "monthly";

      const dayMatch = date.match(/^\d{4}-\d{2}-(\d{2})$/);
      const dayOfMonth = dayMatch ? Number(dayMatch[1]) : undefined;

      onCreateRecurring({
        label: tx.description || "Transaction",
        amount: amt,
        kind: amt >= 0 ? "income" : "expense",
        source: "transaction",
        startDate: date,
        cadence: safeCadence,
        dayOfMonth,
        accountId: tx.accountId,
        category: tx.category || undefined,
      });
    }

    onClose();
  }

  const hasAccounts = Array.isArray(accounts) && accounts.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
        role="button"
        aria-label="Close modal"
        tabIndex={-1}
      />
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-700/70 bg-[#05060F] p-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-100">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-rose-300 transition"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="mt-3 grid gap-3">
          <div>
            <label className="text-[0.65rem] uppercase tracking-[0.18em] text-slate-500">
              Description
            </label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 h-9 w-full rounded-md bg-slate-900/70 px-3 text-[0.8rem] text-slate-100 outline-none ring-1 ring-slate-700 focus:ring-2 focus:ring-cyan-500"
              placeholder="Walmart, Rent, Paycheck..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[0.65rem] uppercase tracking-[0.18em] text-slate-500">
                Amount
              </label>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                className="mt-1 h-9 w-full rounded-md bg-slate-900/70 px-3 text-[0.8rem] text-slate-100 outline-none ring-1 ring-slate-700 focus:ring-2 focus:ring-cyan-500"
                placeholder="-45.21 or 1200"
              />
              <div className="mt-1 text-[0.65rem] text-slate-500">
                Negative = expense, positive = income
              </div>
            </div>

            <div>
              <label className="text-[0.65rem] uppercase tracking-[0.18em] text-slate-500">
                Date
              </label>
              <input
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 h-9 w-full rounded-md bg-slate-900/70 px-3 text-[0.8rem] text-slate-100 outline-none ring-1 ring-slate-700 focus:ring-2 focus:ring-cyan-500"
                placeholder="YYYY-MM-DD"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[0.65rem] uppercase tracking-[0.18em] text-slate-500">
                Category (optional)
              </label>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1 h-9 w-full rounded-md bg-slate-900/70 px-3 text-[0.8rem] text-slate-100 outline-none ring-1 ring-slate-700 focus:ring-2 focus:ring-cyan-500"
                placeholder="Groceries, Rent..."
              />
            </div>

            <div>
              <label className="text-[0.65rem] uppercase tracking-[0.18em] text-slate-500">
                Account
              </label>
              {hasAccounts ? (
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md bg-slate-900/70 px-2 text-[0.8rem] text-slate-100 outline-none ring-1 ring-slate-700 focus:ring-2 focus:ring-cyan-500"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name || a.id}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md bg-slate-900/70 px-3 text-[0.8rem] text-slate-100 outline-none ring-1 ring-slate-700 focus:ring-2 focus:ring-cyan-500"
                  placeholder="main"
                />
              )}
            </div>
          </div>

          {allowRecurring && (
            <div className="rounded-xl border border-slate-700/60 bg-black/20 p-3">
              <label className="flex items-center gap-2 text-xs text-slate-200">
                <input
                  type="checkbox"
                  checked={makeRecurring}
                  onChange={(e) => setMakeRecurring(e.target.checked)}
                />
                Add to calendar as repeating due item
              </label>

              {makeRecurring && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[0.65rem] uppercase tracking-[0.18em] text-slate-500">
                    Cadence
                  </span>
                  <select
                    value={cadence}
                    onChange={(e) => setCadence(e.target.value)}
                    className="h-8 rounded-md bg-slate-900/70 px-2 text-[0.75rem] text-slate-100 outline-none ring-1 ring-slate-700 focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="once">Once</option>
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Biweekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
              )}
            </div>
          )}

          <div className="mt-1 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-3 rounded-md border border-slate-600 text-slate-200 hover:border-cyan-400 hover:text-cyan-200 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              className="h-9 px-3 rounded-md border border-cyan-500/60 text-cyan-200 hover:bg-cyan-500/10 transition"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
