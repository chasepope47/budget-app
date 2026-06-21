// TransactionsPage - updated for Supabase-backed props
import React, { useState, useMemo, useEffect } from "react";
import Card from "../components/Card.jsx";
import TransactionModal from "../components/TransactionModal.jsx";

const FLOW_TYPE_OPTIONS = [
  { value: "auto", label: "Auto (detect)" },
  { value: "income", label: "Income" },
  { value: "expense", label: "Expense" },
  { value: "transfer", label: "Transfer" },
  { value: "ignore", label: "Ignore" },
];

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function TransactionsPage({
  month = "",
  transactions = [],
  accounts = [],
  currentAccountId = null,
  onChangeCurrentAccount = () => {},
  onAddTransaction = () => {},
  onUpdateTransaction = () => {},
  onDeleteTransaction = () => {},
  onClearTransactions = () => {},
  scheduledTemplates = [],
  onScheduledTemplatesChange = () => {},
}) {
  const accountFromList = Array.isArray(accounts) ? accounts.find((a) => a.id === currentAccountId) : null;
  const accountName = accountFromList?.name ?? "";

  const [filters, setFilters] = useState({ query: "", minAmount: "", maxAmount: "" });
  const [sortBy, setSortBy] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [addOpen, setAddOpen] = useState(false);

  const hasData = transactions.length > 0;
  const hasActiveFilter = filters.query || filters.minAmount || filters.maxAmount;

  const rowsToRender = useMemo(() => {
    if (!hasData) return [];
    const filtered = transactions.filter((tx) => {
      const q = filters.query.trim().toLowerCase();
      if (q) {
        const hay = [tx.description || "", tx.category || ""].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const amt = Number(tx.amount);
      if (filters.minAmount !== "" && !isNaN(Number(filters.minAmount)) && amt < Number(filters.minAmount)) return false;
      if (filters.maxAmount !== "" && !isNaN(Number(filters.maxAmount)) && amt > Number(filters.maxAmount)) return false;
      return true;
    });
    return [...filtered].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortBy === "amount") return (Number(a.amount) - Number(b.amount)) * dir;
      if (sortBy === "description" || sortBy === "category") return ((a[sortBy] || "").localeCompare(b[sortBy] || "")) * dir;
      return ((Date.parse(a.date) || 0) - (Date.parse(b.date) || 0)) * dir;
    });
  }, [transactions, filters, sortBy, sortDir, hasData]);

  return (
    <div className="space-y-4 w-full">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">Transactions</h1>
          <span className="text-xs text-slate-400">Imported + manual entries</span>
          {accountName && (
            <p className="text-[0.65rem] text-slate-500">
              Account: <span className="font-semibold text-cyan-200">{accountName}</span>
            </p>
          )}
        </div>
        {hasData && <span className="text-[0.65rem] text-slate-500">Showing {rowsToRender.length} of {transactions.length}</span>}
      </header>

      <Card title="ALL TRANSACTIONS">
        <div className="mb-3 flex items-center justify-between gap-2">
          <button type="button" onClick={() => setAddOpen(true)}
            className="h-8 px-3 rounded-md border border-cyan-500/60 text-[0.7rem] font-medium text-cyan-200 hover:bg-cyan-500/10">
            + Add Transaction
          </button>
          {hasData && (
            <button type="button"
              onClick={() => {
                if (window.confirm(`Delete all ${transactions.length} transaction${transactions.length === 1 ? "" : "s"} for ${month}? This cannot be undone.`)) {
                  onClearTransactions(transactions.map((t) => t.id));
                }
              }}
              className="h-8 px-3 rounded-md border border-rose-500/60 text-[0.7rem] font-medium text-rose-300 hover:bg-rose-400/10">
              Clear all
            </button>
          )}
        </div>

        {!hasData && <p className="text-xs text-slate-400">No transactions yet. Import a CSV on the Dashboard or add one manually.</p>}

        {hasData && (
          <>
            <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <input type="text" value={filters.query}
                onChange={(e) => setFilters((p) => ({ ...p, query: e.target.value }))}
                placeholder="Search description or category…"
                className="h-8 w-full md:w-64 rounded-md bg-slate-900/70 px-2 text-[0.7rem] text-slate-100 outline-none ring-1 ring-slate-700 focus:ring-2 focus:ring-cyan-500" />
              <div className="flex items-center gap-2">
                <input type="number" value={filters.minAmount} placeholder="Min"
                  onChange={(e) => setFilters((p) => ({ ...p, minAmount: e.target.value }))}
                  className="h-8 w-24 rounded-md bg-slate-900/70 px-2 text-[0.7rem] text-slate-100 outline-none ring-1 ring-slate-700 focus:ring-2 focus:ring-cyan-500" />
                <input type="number" value={filters.maxAmount} placeholder="Max"
                  onChange={(e) => setFilters((p) => ({ ...p, maxAmount: e.target.value }))}
                  className="h-8 w-24 rounded-md bg-slate-900/70 px-2 text-[0.7rem] text-slate-100 outline-none ring-1 ring-slate-700 focus:ring-2 focus:ring-cyan-500" />
                <button type="button" disabled={!hasActiveFilter}
                  onClick={() => setFilters({ query: "", minAmount: "", maxAmount: "" })}
                  className="h-8 px-3 rounded-md border text-[0.7rem] font-medium transition border-slate-600 text-slate-200 hover:border-cyan-400 hover:text-cyan-200 disabled:opacity-40 disabled:cursor-not-allowed">
                  Clear
                </button>
              </div>
            </div>

            <div className="mb-3 flex items-center justify-end gap-2 text-[0.7rem]">
              <span className="uppercase tracking-[0.18em] text-slate-500">Sort by</span>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
                className="h-8 rounded-md bg-slate-900/70 px-2 text-[0.7rem] text-slate-100 outline-none ring-1 ring-slate-700">
                <option value="date">Date</option>
                <option value="amount">Amount</option>
                <option value="description">Description</option>
                <option value="category">Category</option>
              </select>
              <button type="button" onClick={() => setSortDir((d) => d === "asc" ? "desc" : "asc")}
                className="h-8 px-3 rounded-md border border-slate-600 text-slate-200 hover:border-cyan-400 hover:text-cyan-200 transition">
                {sortDir === "asc" ? "Asc ↑" : "Desc ↓"}
              </button>
            </div>
          </>
        )}

        {hasData && rowsToRender.length === 0 && <p className="text-xs text-slate-400">No transactions match your filters.</p>}

        {hasData && rowsToRender.length > 0 && (
          <div className="hScroll">
            <div className="min-w-[640px] max-h-[65vh] overflow-y-auto border border-slate-800 rounded-lg">
              <table className="w-full text-[0.7rem] sm:text-xs text-left">
                <thead className="bg-slate-900 text-slate-300 sticky top-0">
                  <tr>
                    <th className="px-2 py-1">Date</th>
                    <th className="px-2 py-1">Description</th>
                    <th className="px-2 py-1 hidden sm:table-cell">Category</th>
                    <th className="px-2 py-1 hidden sm:table-cell">Type</th>
                    <th className="px-2 py-1 text-right">Amount</th>
                    <th className="px-2 py-1 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {rowsToRender.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-900/70">
                      <td className="px-2 py-1 text-slate-300 whitespace-nowrap">{tx.date || "-"}</td>
                      <td className="px-2 py-1 text-slate-200">
                        <input className="w-full bg-transparent border-b border-slate-700 focus:outline-none focus:border-cyan-400 text-[0.7rem] sm:text-xs"
                          value={tx.description || ""}
                          onChange={(e) => onUpdateTransaction(tx.id, { description: e.target.value })} />
                      </td>
                      <td className="px-2 py-1 text-slate-300 hidden sm:table-cell">
                        <input className="w-full bg-transparent border-b border-slate-700 focus:outline-none focus:border-cyan-400 text-[0.7rem] sm:text-xs"
                          value={tx.category || ""}
                          onChange={(e) => onUpdateTransaction(tx.id, { category: e.target.value })} />
                      </td>
                      <td className="px-2 py-1 text-slate-300 hidden sm:table-cell">
                        <select className="w-full bg-slate-900/40 rounded-md border border-slate-700 px-2 py-1 text-[0.65rem] focus:outline-none focus:border-cyan-400"
                          value={tx.flow_type || "auto"}
                          onChange={(e) => onUpdateTransaction(tx.id, { flow_type: e.target.value === "auto" ? null : e.target.value })}>
                          {FLOW_TYPE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
                      </td>
                      <td className={`px-2 py-1 text-right whitespace-nowrap ${tx.amount < 0 ? "text-rose-300" : "text-emerald-300"}`}>
                        {Number.isFinite(Number(tx.amount)) ? `$${Number(tx.amount).toFixed(2)}` : "-"}
                      </td>
                      <td className="px-2 py-1 text-right">
                        <button className="text-[0.7rem] px-2 py-1 rounded-md border border-rose-500/60 text-rose-300 hover:bg-rose-400/10"
                          onClick={() => { if (window.confirm("Delete this transaction?")) onDeleteTransaction(tx.id); }}>
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

      <TransactionModal
        open={addOpen}
        title="Add Transaction"
        accounts={accounts}
        defaultAccountId={currentAccountId || undefined}
        initial={{ date: todayISO(), accountId: currentAccountId }}
        allowRecurring={false}
        onSave={(tx) => {
          onAddTransaction({ ...tx, accountId: tx.accountId || currentAccountId });
          setAddOpen(false);
        }}
        onClose={() => setAddOpen(false)}
      />
    </div>
  );
}

export default TransactionsPage;
