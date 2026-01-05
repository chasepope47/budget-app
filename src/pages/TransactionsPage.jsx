// src/pages/TransactionsPage.jsx
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

const FLOW_TYPE_LABELS = {
  income: "Income",
  expense: "Expense",
  transfer: "Transfer",
  ignore: "Ignored",
  unknown: "Unknown",
};

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function TransactionsPage(props) {
  const {
    transactions = [],
    accountName: accountNameProp = "",
    accounts = [],
    currentAccountId = "main",

    onAddTransaction = () => {},
    onUpdateTransaction = () => {},
    onDeleteTransaction = () => {},

    typeHints = [],
    scheduledTemplates = [],
    onScheduledTemplatesChange = () => {},

    filter: filterFromApp,
    onFilterChange: onFilterChangeFromApp,

    filterText: filterTextProp,
    onChangeFilterText: onChangeFilterTextProp,
  } = props;

  const accountFromList =
    Array.isArray(accounts) && accounts.length > 0
      ? accounts.find((a) => a.id === currentAccountId)
      : null;
  const accountName = accountNameProp || accountFromList?.name || "";

  const filterText = (filterTextProp ?? filterFromApp ?? "").toString();
  const onChangeFilterText =
    onChangeFilterTextProp ?? onFilterChangeFromApp ?? (() => {});

  const hasData = Array.isArray(transactions) && transactions.length > 0;

  const [filters, setFilters] = useState({
    query: "",
    minAmount: "",
    maxAmount: "",
  });

  const [sortBy, setSortBy] = useState("date");
  const [sortDirection, setSortDirection] = useState("desc");

  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    const next = (filterText || "").trim();
    if (!next) return;
    setFilters((prev) => ({ ...prev, query: next }));
  }, [filterText]);

  const handleFilterChange = (field) => (event) => {
    const value = event.target.value;

    setFilters((prev) => ({
      ...prev,
      [field]: value,
    }));

    if (field === "query") {
      onChangeFilterText(value);
    }
  };

  const handleClearFilters = () => {
    setFilters({ query: "", minAmount: "", maxAmount: "" });
    onChangeFilterText("");
  };

  const hasActiveFilter = filters.query || filters.minAmount || filters.maxAmount;

  const toggleSortDirection = () => {
    setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
  };

  const rowsToRender = useMemo(() => {
    if (!hasData) return [];

    const withIndex = transactions.map((tx, index) => ({ tx, index }));

    const filtered = withIndex.filter(({ tx }) => {
      const q = filters.query.trim().toLowerCase();
      const amountNum = Number(tx.amount);

      if (q) {
        const haystack = [tx.description || "", tx.category || ""].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      if (filters.minAmount !== "") {
        const min = Number(filters.minAmount);
        if (!Number.isNaN(min) && !Number.isNaN(amountNum)) {
          if (amountNum < min) return false;
        }
      }

      if (filters.maxAmount !== "") {
        const max = Number(filters.maxAmount);
        if (!Number.isNaN(max) && !Number.isNaN(amountNum)) {
          if (amountNum > max) return false;
        }
      }

      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      const A = a.tx;
      const B = b.tx;
      const dir = sortDirection === "asc" ? 1 : -1;

      if (sortBy === "amount") {
        const aAmt = Number(A.amount) || 0;
        const bAmt = Number(B.amount) || 0;
        return (aAmt - bAmt) * dir;
      }

      if (sortBy === "description" || sortBy === "category") {
        const aStr = (A[sortBy] || "").toLowerCase();
        const bStr = (B[sortBy] || "").toLowerCase();
        return aStr.localeCompare(bStr) * dir;
      }

      const aDate = Date.parse(A.date) || 0;
      const bDate = Date.parse(B.date) || 0;
      return (aDate - bDate) * dir;
    });

    return sorted;
  }, [transactions, filters, sortBy, sortDirection, hasData]);

  function handleSaveNew(tx) {
    onAddTransaction({
      ...tx,
      accountId: tx.accountId || currentAccountId || "main",
    });
  }

  function handleCreateRecurringFromModal(templateFields) {
    const nextTemplate = {
      id: `sched-${Date.now()}`,
      ...templateFields,
    };

    const list = Array.isArray(scheduledTemplates) ? scheduledTemplates : [];
    onScheduledTemplatesChange([...list, nextTemplate]);
  }

  return (
    <div className="space-y-4 w-full">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">Transactions</h1>
          <span className="text-xs text-slate-400">Imported + manual entries</span>
          <p className="text-[0.65rem] text-slate-500">
            Currently viewing:{" "}
            <span className="font-semibold text-cyan-200">{accountName || "None"}</span>
          </p>

          {!!filterText.trim() && (
            <div className="mt-2 inline-flex items-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 text-[0.65rem] text-cyan-200">
              <span className="font-mono">Report filter:</span>
              <span className="text-slate-100">{filterText}</span>
              <button
                type="button"
                onClick={handleClearFilters}
                className="ml-1 rounded border border-cyan-500/40 px-2 py-[2px] text-[0.65rem] hover:bg-cyan-500/10"
              >
                Clear
              </button>
            </div>
          )}
        </div>

        {hasData && (
          <span className="text-[0.65rem] text-slate-500">
            Showing {rowsToRender.length} of {transactions.length}
          </span>
        )}
      </header>

      <Card title="ALL TRANSACTIONS">
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="h-8 px-3 rounded-md border border-cyan-500/60 text-[0.7rem] font-medium text-cyan-200 hover:bg-cyan-500/10"
          >
            + Add Transaction
          </button>
        </div>

        {!hasData && (
          <p className="text-xs text-slate-400">
            No transactions yet. Import a CSV on the Dashboard or add one manually.
          </p>
        )}

        {hasData && (
          <>
            <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div className="flex flex-col gap-1 w-full md:w-auto">
                <label className="text-[0.65rem] uppercase tracking-[0.18em] text-slate-500">
                  Search
                </label>
                <input
                  type="text"
                  value={filters.query}
                  onChange={handleFilterChange("query")}
                  placeholder="Search description or category..."
                  className="h-8 w-full md:w-64 rounded-md bg-slate-900/70 px-2 text-[0.7rem] text-slate-100 outline-none ring-1 ring-slate-700 focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-end">
                <div className="flex gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-[0.65rem] uppercase tracking-[0.18em] text-slate-500">
                      Min
                    </label>
                    <input
                      type="number"
                      value={filters.minAmount}
                      onChange={handleFilterChange("minAmount")}
                      className="h-8 w-24 rounded-md bg-slate-900/70 px-2 text-[0.7rem] text-slate-100 outline-none ring-1 ring-slate-700 focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[0.65rem] uppercase tracking-[0.18em] text-slate-500">
                      Max
                    </label>
                    <input
                      type="number"
                      value={filters.maxAmount}
                      onChange={handleFilterChange("maxAmount")}
                      className="h-8 w-24 rounded-md bg-slate-900/70 px-2 text-[0.7rem] text-slate-100 outline-none ring-1 ring-slate-700 focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleClearFilters}
                  disabled={!hasActiveFilter}
                  className="h-8 px-3 rounded-md border text-[0.7rem] font-medium transition border-slate-600 text-slate-200 hover:border-cyan-400 hover:text-cyan-200 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Clear filters
                </button>
              </div>
            </div>

            <div className="mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2 text-[0.7rem]">
              <div className="flex items-center gap-2">
                <span className="uppercase tracking-[0.18em] text-slate-500">Sort by</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="h-8 rounded-md bg-slate-900/70 px-2 text-[0.7rem] text-slate-100 outline-none ring-1 ring-slate-700 focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="date">Date</option>
                  <option value="amount">Amount</option>
                  <option value="description">Description</option>
                  <option value="category">Category</option>
                </select>

                <button
                  type="button"
                  onClick={toggleSortDirection}
                  className="h-8 px-3 rounded-md border border-slate-600 text-slate-200 hover:border-cyan-400 hover:text-cyan-200 transition"
                >
                  {sortDirection === "asc" ? "Asc ↑" : "Desc ↓"}
                </button>
              </div>
            </div>
          </>
        )}

        {hasData && rowsToRender.length === 0 && (
          <p className="text-xs text-slate-400">No transactions match your current filters.</p>
        )}

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
                  {rowsToRender.map(({ tx, index }) => (
                    <tr key={index} className="hover:bg-slate-900/70">
                      <td className="px-2 py-1 text-slate-300 whitespace-nowrap">{tx.date || "-"}</td>

                      <td className="px-2 py-1 text-slate-200">
                        <input
                          className="w-full bg-transparent border-b border-slate-700 focus:outline-none focus:border-cyan-400 text-[0.7rem] sm:text-xs"
                          value={tx.description || ""}
                          onChange={(e) => onUpdateTransaction(index, { description: e.target.value })}
                        />
                        <div className="sm:hidden mt-1 text-[0.65rem] text-slate-500">
                          {(tx.category || "").trim() ? tx.category : "Uncategorized"}
                        </div>
                      </td>

                      <td className="px-2 py-1 text-slate-300 hidden sm:table-cell">
                        <input
                          className="w-full bg-transparent border-b border-slate-700 focus:outline-none focus:border-cyan-400 text-[0.7rem] sm:text-xs"
                          value={tx.category || ""}
                          onChange={(e) => onUpdateTransaction(index, { category: e.target.value })}
                        />
                      </td>

                      <td className="px-2 py-1 text-slate-300 hidden sm:table-cell">
                        <div className="flex flex-col gap-1">
                          <select
                            className="w-full bg-slate-900/40 rounded-md border border-slate-700 px-2 py-1 text-[0.65rem] focus:outline-none focus:border-cyan-400"
                            value={tx.flowType || "auto"}
                            onChange={(e) => {
                              const next = e.target.value;
                              onUpdateTransaction(index, {
                                flowType: next === "auto" ? undefined : next,
                              });
                            }}
                          >
                            {FLOW_TYPE_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                          <span className="text-[0.6rem] text-slate-500">
                            Detected: {FLOW_TYPE_LABELS[typeHints[index]] || "Unknown"}
                          </span>
                        </div>
                      </td>

                      <td
                        className={`px-2 py-1 text-right whitespace-nowrap ${
                          tx.amount < 0 ? "text-rose-300" : "text-emerald-300"
                        }`}
                      >
                        {Number.isFinite(Number(tx.amount)) ? `$${Number(tx.amount).toFixed(2)}` : "-"}
                      </td>

                      <td className="px-2 py-1 text-right">
                        <button
                          className="text-[0.7rem] px-2 py-1 rounded-md border border-rose-500/60 text-rose-300 hover:bg-rose-400/10"
                          onClick={() => {
                            if (window.confirm("Delete this transaction from this account?")) {
                              onDeleteTransaction(index);
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

      <TransactionModal
        open={addOpen}
        title="Add Transaction"
        accounts={accounts}
        defaultAccountId={currentAccountId || "main"}
        initial={{ date: todayISO(), accountId: currentAccountId || "main" }}
        allowRecurring={true}
        onCreateRecurring={handleCreateRecurringFromModal}
        onSave={handleSaveNew}
        onClose={() => setAddOpen(false)}
      />
    </div>
  );
}

export default TransactionsPage;
