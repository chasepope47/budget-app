import React from "react";
import Card from "../components/Card.jsx";
import FlowSankey, { estimateFlowSankeyHeight } from "../components/FlowSankey.jsx";
import { formatCurrency } from "../components/ui.js";
import {
  DEFAULT_REPORT_CONFIG,
  normalizeReportConfig,
} from "../lib/reports.js";

const RANGE_OPTIONS = [
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "6m", label: "Last 6 months" },
  { value: "12m", label: "Last 12 months" },
  { value: "all", label: "All time" },
];

const GROUP_OPTIONS = [
  { value: "category", label: "By category" },
  { value: "description", label: "By description" },
  { value: "account", label: "By account" },
];

function ReportsPage({
  data,
  config,
  accounts = [],
  onUpdateConfig = () => {},
}) {
  const safeConfig = normalizeReportConfig(config);
  const summary = data?.summary || {
    incomeTotal: 0,
    expenseTotal: 0,
    netIncome: 0,
    savingsAmount: 0,
    savingsRate: 0,
    transferTotal: 0,
  };

  const accountOptions = React.useMemo(() => {
    return [
      { value: "all", label: "All accounts" },
      ...accounts.map((account) => ({
        value: account.id,
        label: account.name || account.id,
      })),
    ];
  }, [accounts]);

  const chartHeight = React.useMemo(() => {
    const estimated = estimateFlowSankeyHeight(data?.nodes || []);
    return Math.max(estimated, 520);
  }, [data?.nodes]);

  const handleSelectChange =
    (field) =>
    (event) => {
      onUpdateConfig({ [field]: event.target.value });
    };

  const handleToggleChange =
    (field) =>
    (event) => {
      onUpdateConfig({ [field]: event.target.checked });
    };

  const handleResetConfig = () => {
    onUpdateConfig({ ...DEFAULT_REPORT_CONFIG });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">
            Cash Flow Report
          </h2>
          <p className="text-xs text-slate-400">
            {data?.timeframeLabel || "All time"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs items-end">
          <label className="flex flex-col gap-1">
            <span className="text-[0.65rem] uppercase tracking-[0.18em] text-slate-500">
              Date range
            </span>
            <select
              value={safeConfig.dateRange}
              onChange={handleSelectChange("dateRange")}
              className="h-8 rounded-md bg-slate-900/80 px-2 text-[0.75rem] text-slate-100 border border-slate-700 focus:border-cyan-400 outline-none"
            >
              {RANGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[0.65rem] uppercase tracking-[0.18em] text-slate-500">
              Account
            </span>
            <select
              value={safeConfig.accountFilter}
              onChange={handleSelectChange("accountFilter")}
              className="h-8 rounded-md bg-slate-900/80 px-2 text-[0.75rem] text-slate-100 border border-slate-700 focus:border-cyan-400 outline-none"
            >
              {accountOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[0.65rem] uppercase tracking-[0.18em] text-slate-500">
              Group nodes by
            </span>
            <select
              value={safeConfig.groupBy}
              onChange={handleSelectChange("groupBy")}
              className="h-8 rounded-md bg-slate-900/80 px-2 text-[0.75rem] text-slate-100 border border-slate-700 focus:border-cyan-400 outline-none"
            >
              {GROUP_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={handleResetConfig}
            className="mt-auto h-8 px-3 rounded-md border border-slate-600 text-slate-200 hover:border-cyan-400 transition"
          >
            Reset
          </button>

          <div className="mt-auto">
            <ReportSettingsMenu
              config={safeConfig}
              handleToggleChange={handleToggleChange}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard label="Total income" value={summary.incomeTotal} accent="text-emerald-300" />
        <SummaryCard label="Total expenses" value={summary.expenseTotal} accent="text-rose-300" />
        <SummaryCard label="Net income" value={summary.netIncome} accent="text-cyan-300" />
        <SummaryCard
          label="Savings rate"
          value={summary.savingsRate / 100}
          format="percent"
          accent="text-amber-300"
        />
      </div>

      <Card title="CASH FLOW">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-4 text-xs text-slate-400">
          <div>
            <p>
              Visualizes income sources flowing into spending, savings, and goals for the selected
              range.
            </p>
            {summary.transferTotal > 0 && safeConfig.showTransferSummary && (
              <p className="mt-1 text-[0.65rem] text-slate-500">
                Transfers detected: {formatCurrency(summary.transferTotal, { maximumFractionDigits: 2 })} (excluded from spending totals).
              </p>
            )}
          </div>
        </div>

        <div
          className="-mx-2 rounded-2xl border border-slate-800/70 bg-slate-950/40 px-2 py-3 sm:mx-0 pb-8"
          style={{ minHeight: chartHeight + 200 }}
        >
          <FlowSankey
            nodes={data?.nodes || []}
            links={data?.links || []}
            height={chartHeight}
          />
        </div>
      </Card>

    </div>
  );
}

function SummaryCard({ label, value, accent = "text-cyan-200", format = "currency" }) {
  const formatted =
    format === "percent"
      ? `${(Number(value) * 100 || 0).toFixed(1)}%`
      : formatCurrency(value || 0);

  return (
    <div className="rounded-xl border border-slate-700/70 bg-slate-900/40 px-4 py-3">
      <p className="text-[0.65rem] uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <div className={`text-xl font-semibold ${accent}`}>
        {formatted}
      </div>
    </div>
  );
}

function Toggle({ label, description, checked, onChange }) {
  return (
    <label className="flex gap-3 items-start bg-[#05060F] border border-slate-700/70 rounded-lg p-3 cursor-pointer">
      <input
        type="checkbox"
        className="mt-1 accent-cyan-400"
        checked={!!checked}
        onChange={onChange}
      />
      <span>
        <span className="block text-slate-100 text-sm font-semibold">{label}</span>
        <span className="text-xs text-slate-500">{description}</span>
      </span>
    </label>
  );
}

function ReportSettingsMenu({ config, handleToggleChange }) {
  const [open, setOpen] = React.useState(false);
  const menuRef = React.useRef(null);
  const buttonRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    const handleClick = (event) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        type="button"
        ref={buttonRef}
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-2 rounded-md border border-slate-600 bg-slate-900/70 px-3 py-2 text-xs font-semibold text-slate-100 hover:border-cyan-400 hover:text-cyan-200 transition"
      >
        Report settings
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M3 4.5L6 7.5L9 4.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open ? (
        <div
          ref={menuRef}
          className="absolute right-0 z-10 mt-2 w-80 rounded-xl border border-slate-800/80 bg-slate-950/95 p-3 shadow-2xl backdrop-blur"
        >
          <p className="text-[0.6rem] uppercase tracking-[0.18em] text-slate-500">
            Report settings
          </p>
          <div className="mt-3 space-y-2 text-xs">
            <Toggle
              label="Show income sources"
              description="Break the left column into individual income categories."
              checked={config.showIncomeBreakdown}
              onChange={handleToggleChange("showIncomeBreakdown")}
            />
            <Toggle
              label="Show expense categories"
              description="Split outflows by category instead of a single block."
              checked={config.showExpenseBreakdown}
              onChange={handleToggleChange("showExpenseBreakdown")}
            />
            <Toggle
              label="Show savings node"
              description="Reserve a lane for leftover cash / savings."
              checked={config.showSavingsNode}
              onChange={handleToggleChange("showSavingsNode")}
            />
            <Toggle
              label="Show goal breakdown"
              description="Flow savings into your top planned goals."
              checked={config.showGoalFlows}
              onChange={handleToggleChange("showGoalFlows")}
            />
            <Toggle
              label="Show transfer summary"
              description="Mention how much was classified as transfers vs withdrawals."
              checked={config.showTransferSummary}
              onChange={handleToggleChange("showTransferSummary")}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default ReportsPage;
