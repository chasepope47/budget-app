// src/lib/reports.js
import { groupBy } from "../components/ui.js";

export const DEFAULT_REPORT_CONFIG = {
  dateRange: "30d",
  accountFilter: "all",
  groupBy: "category",
  showIncomeBreakdown: true,
  showExpenseBreakdown: true,
  showSavingsNode: true,
  showGoalFlows: true,
  showTransferSummary: true,
  maxGroups: 6,
};

const DATE_RANGE_MAP = {
  "30d": 30,
  "90d": 90,
  "6m": 182,
  "12m": 365,
  all: null,
};

const TRANSFER_KEYWORDS = [
  "transfer",
  "online transfer",
  "internal transfer",
  "ach",
  "xfer",
  "external transfer",
  "payment to",
  "payment from",
];

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function normalizeReportConfig(config = {}) {
  return {
    ...DEFAULT_REPORT_CONFIG,
    ...(config || {}),
  };
}

function buildTransferLookup(accounts = []) {
  const lookup = new Map();
  for (const account of accounts || []) {
    const txs = Array.isArray(account?.transactions)
      ? account.transactions
      : [];
    for (const tx of txs) {
      const date = (tx?.date || "").slice(0, 10);
      const amount = Math.abs(Number(tx?.amount));
      if (!date || !Number.isFinite(amount) || amount === 0) continue;
      const key = `${date}|${amount.toFixed(2)}`;
      if (!lookup.has(key)) lookup.set(key, []);
      lookup.get(key).push({
        accountId: account.id,
        sign: Math.sign(Number(tx.amount)),
        description: (tx.description || "").toLowerCase(),
      });
    }
  }
  return lookup;
}

function matchesTransferKeyword(text = "") {
  const lower = text.toLowerCase();
  return TRANSFER_KEYWORDS.some((kw) => lower.includes(kw));
}

function classifyFlowType(tx, accountId, lookup) {
  if (!tx) return "unknown";
  const manual = tx.flowType;
  if (manual && manual !== "auto") return manual;

  const amount = Number(tx.amount);
  if (!Number.isFinite(amount) || amount === 0) return "unknown";

  const description = tx.description || "";
  const category = tx.category || "";
  if (matchesTransferKeyword(description) || matchesTransferKeyword(category)) {
    return "transfer";
  }

  const date = (tx.date || "").slice(0, 10);
  const key =
    date && Number.isFinite(Math.abs(amount))
      ? `${date}|${Math.abs(amount).toFixed(2)}`
      : null;
  if (key && lookup.has(key)) {
    const entries = lookup.get(key);
    const hasOpposite = entries.some((entry) => entry.sign > 0) &&
      entries.some((entry) => entry.sign < 0);
    if (hasOpposite) {
      const otherAccount = entries.find(
        (entry) =>
          entry.accountId !== accountId &&
          Math.sign(amount) !== entry.sign
      );
      if (otherAccount) {
        return "transfer";
      }
    }
  }

  if (amount > 0) return "income";
  if (amount < 0) return "expense";
  return "unknown";
}

export function buildTransactionFlowMeta(accounts = []) {
  const lookup = buildTransferLookup(accounts);
  const flattened = [];
  const byAccount = {};

  for (const account of accounts || []) {
    const txs = Array.isArray(account?.transactions)
      ? account.transactions
      : [];
    const typedList = [];
    txs.forEach((tx, index) => {
      const flowType = classifyFlowType(tx, account.id, lookup);
      typedList[index] = flowType;
      flattened.push({
        accountId: account.id,
        accountName: account.name,
        index,
        flowType,
        ...tx,
      });
    });
    byAccount[account.id] = typedList;
  }

  return { flattened, byAccount };
}

function filterByAccount(transactions = [], accountFilter = "all") {
  if (accountFilter === "all") return transactions;
  return transactions.filter((tx) => tx.accountId === accountFilter);
}

function filterByDate(transactions = [], dateRangeKey = "30d") {
  const days = DATE_RANGE_MAP[dateRangeKey];
  if (days == null) {
    return {
      transactions,
      startDate: null,
      endDate: null,
    };
  }

  const endDate = new Date();
  endDate.setHours(0, 0, 0, 0);
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - days);

  const filtered = transactions.filter((tx) => {
    const date = normalizeDate(tx.date);
    if (!date) return false;
    return date >= startDate && date <= endDate;
  });

  return { transactions: filtered, startDate, endDate };
}

function formatRangeLabel(start, end) {
  if (!start || !end) return "All time";
  const opts = { month: "short", day: "numeric", year: "numeric" };
  return `${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(
    undefined,
    opts
  )}`;
}

function groupTransactions(transactions = [], groupByKey = "category", fallbackLabel) {
  if (!transactions.length) return [];
  const grouped = groupBy(transactions, (tx) => {
    if (groupByKey === "account") {
      return tx.accountName || tx.accountId || fallbackLabel;
    }
    if (groupByKey === "description") {
      return tx.description || fallbackLabel;
    }
    return tx.category || fallbackLabel;
  });
  return Object.entries(grouped).map(([key, rows]) => ({
    key,
    label: key || fallbackLabel,
    value: rows.reduce(
      (sum, tx) => sum + Math.abs(Number(tx.amount) || 0),
      0
    ),
    count: rows.length,
  }));
}

function collapseGroups(groups = [], maxGroups = 6, otherLabel = "Other") {
  if (groups.length <= maxGroups) {
    return groups.sort((a, b) => b.value - a.value);
  }

  const sorted = [...groups].sort((a, b) => b.value - a.value);
  const primary = sorted.slice(0, maxGroups - 1);
  const remainder = sorted.slice(maxGroups - 1);
  const otherTotal = remainder.reduce((sum, group) => sum + group.value, 0);
  if (otherTotal > 0) {
    primary.push({
      key: "other",
      label: otherLabel,
      value: otherTotal,
      count: remainder.reduce((sum, group) => sum + group.count, 0),
    });
  }
  return primary;
}

export function buildCashFlowReport({
  accounts = [],
  goals = [],
  budget = null,
  config = {},
  flowMeta = null,
} = {}) {
  const normalizedConfig = normalizeReportConfig(config);
  const meta = flowMeta || buildTransactionFlowMeta(accounts);
  const filteredByAccount = filterByAccount(
    meta.flattened,
    normalizedConfig.accountFilter
  );
  const { transactions: filteredTransactions, startDate, endDate } =
    filterByDate(filteredByAccount, normalizedConfig.dateRange);

  const incomeTx = filteredTransactions.filter((tx) => tx.flowType === "income");
  const expenseTx = filteredTransactions.filter((tx) => tx.flowType === "expense");
  const transferTx = filteredTransactions.filter(
    (tx) => tx.flowType === "transfer"
  );

  const incomeTotal = incomeTx.reduce(
    (sum, tx) => sum + (Number(tx.amount) || 0),
    0
  );
  const expenseTotal = expenseTx.reduce(
    (sum, tx) => sum + Math.abs(Number(tx.amount) || 0),
    0
  );
  const transferTotal = transferTx.reduce(
    (sum, tx) => sum + Math.abs(Number(tx.amount) || 0),
    0
  );

  const netIncome = incomeTotal - expenseTotal;
  const savingsAmount = netIncome > 0 ? netIncome : 0;
  const shortfall = expenseTotal > incomeTotal ? expenseTotal - incomeTotal : 0;
  const effectiveInflow = incomeTotal + shortfall;
  const timeframeLabel = formatRangeLabel(startDate, endDate);

  const incomeGroupsRaw = groupTransactions(
    incomeTx,
    normalizedConfig.groupBy,
    "Other income"
  );
  const expenseGroupsRaw = groupTransactions(
    expenseTx,
    normalizedConfig.groupBy,
    "General spending"
  );

  const incomeGroups = collapseGroups(
    incomeGroupsRaw,
    normalizedConfig.maxGroups,
    "Other income"
  );
  const expenseGroups = collapseGroups(
    expenseGroupsRaw,
    normalizedConfig.maxGroups + 1,
    "Other spending"
  );

  const nodes = [];
  const links = [];

  const incomeNodeId = "flow-income";
  nodes.push({
    id: incomeNodeId,
    label: "Cash Flow",
    value: Math.max(effectiveInflow, 0),
    column: 1,
    color: "#22d3ee",
    subtitle:
      netIncome >= 0
        ? `Net +$${savingsAmount.toFixed(2)}`
        : `Shortfall -$${Math.abs(netIncome).toFixed(2)}`,
  });

  if (normalizedConfig.showIncomeBreakdown) {
    incomeGroups.forEach((group, index) => {
      const nodeId = `income-${index}`;
      nodes.push({
        id: nodeId,
        label: group.label,
        value: group.value,
        column: 0,
        color: "#38bdf8",
        subtitle: `${((group.value / Math.max(incomeTotal || 1, 1)) * 100).toFixed(
          1
        )}%`,
      });
      links.push({
        source: nodeId,
        target: incomeNodeId,
        value: group.value,
        color: "#38bdf8",
      });
    });
  } else {
    const nodeId = "income-aggregate";
    nodes.push({
      id: nodeId,
      label: "Total income",
      value: incomeTotal,
      column: 0,
      color: "#38bdf8",
    });
    links.push({
      source: nodeId,
      target: incomeNodeId,
      value: incomeTotal,
      color: "#38bdf8",
    });
  }

  if (shortfall > 0) {
    nodes.push({
      id: "shortfall",
      label: "Covered by savings / credit",
      value: shortfall,
      column: 0,
      color: "#f97316",
    });
    links.push({
      source: "shortfall",
      target: incomeNodeId,
      value: shortfall,
      color: "#f97316",
    });
  }

  const expenseTargetNodes = [];
  if (normalizedConfig.showExpenseBreakdown) {
    expenseGroups.forEach((group, index) => {
      const nodeId = `expense-${index}`;
      nodes.push({
        id: nodeId,
        label: group.label,
        value: group.value,
        column: 2,
        color: "#fb7185",
        subtitle: `${((group.value / Math.max(expenseTotal || 1, 1)) * 100).toFixed(
          1
        )}%`,
      });
      expenseTargetNodes.push({ nodeId, value: group.value });
    });
  } else if (expenseTotal > 0) {
    const nodeId = "expense-total";
    nodes.push({
      id: nodeId,
      label: "Expenses",
      value: expenseTotal,
      column: 2,
      color: "#fb7185",
    });
    expenseTargetNodes.push({ nodeId, value: expenseTotal });
  }

  expenseTargetNodes.forEach((target) => {
    links.push({
      source: incomeNodeId,
      target: target.nodeId,
      value: target.value,
      color: "#fb7185",
    });
  });

  let savingsNodeId = null;
  if (savingsAmount > 0 && normalizedConfig.showSavingsNode) {
    savingsNodeId = "savings";
    nodes.push({
      id: savingsNodeId,
      label: "Savings",
      value: savingsAmount,
      column: 2,
      color: "#4ade80",
      subtitle: `${((savingsAmount / Math.max(incomeTotal || 1, 1)) * 100).toFixed(
        1
      )}%`,
    });
    links.push({
      source: incomeNodeId,
      target: savingsNodeId,
      value: savingsAmount,
      color: "#4ade80",
    });
  }

  if (savingsNodeId && normalizedConfig.showGoalFlows) {
    const withPlans = goals
      .map((goal) => ({
        id: goal.id,
        name: goal.name || "Goal",
        monthlyPlan: Math.max(0, Number(goal.monthlyPlan) || 0),
      }))
      .filter((goal) => goal.monthlyPlan > 0);

    const totalPlan = withPlans.reduce((sum, goal) => sum + goal.monthlyPlan, 0);
    if (totalPlan > 0) {
      const limitedGoalNodes = withPlans.slice(0, 4);
      limitedGoalNodes.forEach((goal, index) => {
        const nodeId = `goal-${goal.id || index}`;
        nodes.push({
          id: nodeId,
          label: goal.name,
          value: savingsAmount * (goal.monthlyPlan / totalPlan),
          column: 3,
          color: "#c084fc",
        });
        links.push({
          source: savingsNodeId,
          target: nodeId,
          value: savingsAmount * (goal.monthlyPlan / totalPlan),
          color: "#c084fc",
        });
      });
    }
  }

  return {
    timeframeLabel,
    summary: {
      incomeTotal,
      expenseTotal,
      netIncome,
      savingsAmount,
      savingsRate:
        incomeTotal > 0 ? (savingsAmount / incomeTotal) * 100 : 0,
      transferTotal,
    },
    groups: {
      income: incomeGroups,
      expense: expenseGroups,
    },
    nodes,
    links,
  };
}
