// App.jsx
import React, { useState, useEffect, useMemo, useRef } from "react";
import "./App.css";

import { useSupabaseAuth } from "./SupabaseAuthProvider.jsx";
import { loadUserState, saveUserState } from "./userStateApi.js";
import { loadOrCreateUserProfile, updateUserProfile } from "./userMetadataApi.js";
import { supabase } from "./supabaseClient";

// Components
import NavButton from "./components/NavButton.jsx";
import ActionsMenu from "./components/ActionsMenu.jsx";
import AuthScreen from "./components/AuthScreen.jsx";
import Toast from "./components/Toast.jsx";
import ProfileMenu from "./components/ProfileMenu.jsx";
import GoalEditorModal from "./components/GoalEditorModal.jsx";
import ContributionModal from "./components/ContributionModal.jsx";
import ThemeSelector from "./components/ThemeSelector.jsx";

// Pages
import Dashboard from "./pages/Dashboard.jsx";
import BalancesDashboard from "./pages/BalancesDashboard.jsx";
import BudgetPage from "./pages/BudgetPage.jsx";
import TransactionsPage from "./pages/TransactionsPage.jsx";
import GoalDetailPage from "./pages/GoalDetailPage.jsx";

// Libs
import {
  STORAGE_KEY,
  loadStoredState,
  saveStoredState,
  migrateStoredState,
} from "./lib/storage.js";

import {
  sumAmounts,
  computeNetTransactions,
  normalizeAccounts,
  mergeTransactions,
  importTransactionsWithDetection,
} from "./lib/accounts.js";
import { getThemeConfig } from "./themeConfig.js";

// ----- Navigation -----
const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "balances", label: "Accounts" },
  { key: "budget", label: "Budget" },
  { key: "transactions", label: "Transactions" },
  { key: "goalDetail", label: "Goals" },
];

const NAV_LABELS = NAV_ITEMS.reduce((map, item) => {
  map[item.key] = item.label;
  return map;
}, {});

const DEFAULT_DASHBOARD_SECTIONS = [
  "monthOverview",
  "accountSnapshot",
  "goals",
  "csvImport",
];
const DASHBOARD_SECTION_LABELS = {
  monthOverview: "Month Overview",
  accountSnapshot: "Account Snapshot",
  goals: "Goals",
  csvImport: "CSV Import",
};

function getCurrentMonthKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function createSampleBudget() {
  return {
    month: getCurrentMonthKey(),
    income: 5000,
    fixed: [
      { id: "rent", label: "Rent / Mortgage", amount: 1500 },
      { id: "utilities", label: "Utilities & Internet", amount: 250 },
      { id: "insurance", label: "Insurance", amount: 180 },
    ],
    variable: [
      { id: "groceries", label: "Groceries", amount: 500 },
      { id: "gas", label: "Gas & Transport", amount: 250 },
      { id: "fun", label: "Fun / Eating Out", amount: 300 },
    ],
  };
}

function createBlankBudget() {
  return {
    month: getCurrentMonthKey(),
    income: 0,
    fixed: [],
    variable: [],
  };
}

function createSampleGoals() {
  return [
    {
      id: "emergency",
      name: "Emergency Fund",
      target: 3000,
      current: 600,
      description: "3–6 months of core expenses to keep you safe.",
    },
    {
      id: "debt",
      name: "Crush Debt",
      target: 5000,
      current: 1200,
      description: "Throw extra at your highest interest debt.",
    },
  ];
}

function createBlankGoals() {
  return [];
}

const BASE_ACCOUNT_ID = "main";
function createBaseAccount(overrides = {}) {
  return {
    id: BASE_ACCOUNT_ID,
    name: "Main Checking",
    type: "checking",
    startingBalance: 0,
    transactions: [],
    ...overrides,
  };
}

function createSampleAccounts() {
  return [
    createBaseAccount({
      startingBalance: 2500,
    }),
  ];
}

function createBlankAccounts() {
  return [createBaseAccount()];
}

function normalizeNavOrder(order) {
  const defaults = NAV_ITEMS.map((n) => n.key);
  if (!Array.isArray(order) || !order.length) return defaults;
  const cleaned = order.filter((key) => defaults.includes(key));
  const missing = defaults.filter((key) => !cleaned.includes(key));
  return [...cleaned, ...missing];
}

function normalizeDashboardSections(order) {
  if (
    !Array.isArray(order) ||
    !order.length
  ) {
    return DEFAULT_DASHBOARD_SECTIONS;
  }
  const cleaned = order.filter((key) => key in DASHBOARD_SECTION_LABELS);
  const missing = DEFAULT_DASHBOARD_SECTIONS.filter(
    (key) => !cleaned.includes(key)
  );
  return [...cleaned, ...missing];
}

// ----- Helpers -----
function computeTotals(budget) {
  const fixedTotal = sumAmounts(budget.fixed || []);
  const variableTotal = sumAmounts(budget.variable || []);
  const leftover = (budget.income || 0) - fixedTotal - variableTotal;
  return { fixedTotal, variableTotal, leftover };
}

/**
 * When migrating from an older version where transactions were global,
 * move them into the main account.
 */
function moveGlobalTransactionsToAccounts(stored) {
  if (!stored) return stored;

  if (Array.isArray(stored.transactions) && stored.transactions.length) {
    const defaultAccount = {
      id: "main",
      name: "Main Checking",
      type: "checking",
      startingBalance: 0,
      transactions: Array.isArray(stored.transactions)
        ? stored.transactions
        : [],
    };

    return {
      ...stored,
      accounts: [defaultAccount],
      currentAccountId: stored.currentAccountId || "main",
    };
  }

  return stored;
}

// ---- CSV Parsing Helpers ----

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseDateFlexible(value) {
  if (!value) return null;

  // Already ISO-like?
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const parts = value.split(/[\/\-]/).map((p) => p.trim());
  if (parts.length === 3) {
    const [a, b, c] = parts.map((p) => parseInt(p, 10));

    // If first is 4-digit year: Y-M-D
    if (String(parts[0]).length === 4) {
      const year = a;
      const m = b;
      const d = c;
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        return `${year.toString().padStart(4, "0")}-${m
          .toString()
          .padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
      }
    }

    // If last is 4-digit year: m/d/Y or d/m/Y
    if (String(parts[2]).length === 4) {
      const year = c;
      const first = a;
      const second = b;

      // Try m/d/Y
      if (first >= 1 && first <= 12 && second >= 1 && second <= 31) {
        return `${year.toString().padStart(4, "0")}-${first
          .toString()
          .padStart(2, "0")}-${second.toString().padStart(2, "0")}`;
      }

      // Try d/m/Y
      if (second >= 1 && second <= 12 && first >= 1 && first <= 31) {
        return `${year.toString().padStart(4, "0")}-${second
          .toString()
          .padStart(2, "0")}-${first.toString().padStart(2, "0")}`;
      }
    }
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = parsed.getMonth() + 1;
    const day = parsed.getDate();
    return `${year.toString().padStart(4, "0")}-${month
      .toString()
      .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
  }

  return null;
}

function parseCsvToRows(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (!lines.length) return [];

  const headerLine = lines[0];
  const headerCells = parseCsvLine(headerLine).map((h) =>
    h.trim().toLowerCase()
  );

  const headerKeywords = ["date", "amount", "description", "memo", "name"];
  const hasHeaderKeywords = headerCells.some((h) =>
    headerKeywords.some((kw) => h.includes(kw))
  );

  const dataLines = hasHeaderKeywords ? lines.slice(1) : lines;

  return dataLines.map((line) => parseCsvLine(line));
}

function detectColumnIndexes(firstRow) {
  const cells = firstRow.map((c) => c.trim().toLowerCase());

  let dateIdx = -1;
  let amountIdx = -1;
  let descIdx = -1;

  cells.forEach((cell, index) => {
    if (dateIdx === -1 && /date|posted/.test(cell)) {
      dateIdx = index;
    }
    if (amountIdx === -1 && /amount|amt|value/.test(cell)) {
      amountIdx = index;
    }
    if (
      descIdx === -1 &&
      /description|memo|details|name|payee|merchant/.test(cell)
    ) {
      descIdx = index;
    }
  });

  if (dateIdx === -1) dateIdx = 0;
  if (amountIdx === -1) amountIdx = 1;
  if (descIdx === -1) descIdx = 2;

  return { dateIdx, amountIdx, descIdx };
}

function parseCsvToTransactions(text) {
  const rows = parseCsvToRows(text);
  if (!rows.length) return [];

  const { dateIdx, amountIdx, descIdx } = detectColumnIndexes(rows[0]);

  const result = [];

  for (const row of rows) {
    if (!row || !row.length) continue;

    const dateRaw = row[dateIdx] ?? "";
    const amountRaw = row[amountIdx] ?? "";
    const descRaw = row[descIdx] ?? "";

    const date = parseDateFlexible(dateRaw);

    const amountNum = parseFloat(
      String(amountRaw)
        .replace(/[$,]/g, "")
        .replace(/\s+/g, "")
    );
    if (Number.isNaN(amountNum)) continue;

    const description = descRaw || "(no description)";

    result.push({
      id: `tx-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      date: date || "",
      amount: amountNum,
      description,
    });
  }

  return result;
}

function guessAccountTypeFromRows(rows = []) {
  if (!rows.length) return "checking";
  let negatives = 0;
  let positives = 0;
  for (const tx of rows) {
    if (typeof tx.amount !== "number") continue;
    if (tx.amount < 0) negatives++;
    else if (tx.amount > 0) positives++;
  }
  if (negatives === 0 && positives === 0) return "checking";
  const ratio = negatives / (negatives + positives);
  return ratio >= 0.7 ? "credit" : "checking";
}

const KNOWN_BANK_KEYWORDS = [
  { match: "chase", label: "Chase" },
  { match: "capitalone", label: "Capital One" },
  { match: "wells", label: "Wells Fargo" },
  { match: "boa", label: "Bank of America" },
  { match: "navyfederal", label: "Navy Federal" },
  { match: "usaa", label: "USAA" },
  { match: "discover", label: "Discover" },
  { match: "amex", label: "American Express" },
];

function guessBankNameFromText(text = "") {
  const lower = text.toLowerCase();
  for (const { match, label } of KNOWN_BANK_KEYWORDS) {
    if (lower.includes(match)) return label;
  }
  return null;
}

// ----- Main App -----
function App() {
  const {
    user,
    authLoading,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    resetPassword,
  } = useSupabaseAuth();

  // flags/refs for syncing
  const applyingRemoteRef = useRef(false);
  const saveTimeoutRef = useRef(null);
  const initialStoredRef = useRef(null);

  // Load local state once
  if (initialStoredRef.current === null) {
    const rawStored = loadStoredState();
    const withTxMigration = moveGlobalTransactionsToAccounts(rawStored);
    initialStoredRef.current = migrateStoredState(withTxMigration);
  }
  const stored = initialStoredRef.current;

  // Theme per user (G)
  const [theme, setTheme] = useState(stored?.theme || "dark");

  // Core app state
  const [budget, setBudget] = useState(stored?.budget || createSampleBudget());
  const [goals, setGoals] = useState(stored?.goals || createSampleGoals());
  const [accounts, setAccounts] = useState(
    normalizeAccounts(stored?.accounts || createSampleAccounts())
  );
  const [currentAccountId, setCurrentAccountId] = useState(
    stored?.currentAccountId ||
      (stored?.accounts && stored.accounts[0]?.id) ||
      "main"
  );

  const [navOrder, setNavOrder] = useState(
    normalizeNavOrder(stored?.navOrder)
  );
  const [homePage, setHomePage] = useState(stored?.homePage || "dashboard");
  const [dashboardSectionsOrder, setDashboardSectionsOrder] = useState(
    normalizeDashboardSections(stored?.dashboardSectionsOrder)
  );
  const [customizeMode, setCustomizeMode] = useState(false);
  const [currentPage, setCurrentPage] = useState(
    stored?.homePage || "dashboard"
  );
  const [selectedGoalId, setSelectedGoalId] = useState(
    stored?.selectedGoalId || (stored?.goals?.[0]?.id ?? null)
  );
  const [toast, setToast] = useState(null);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [goalEditorState, setGoalEditorState] = useState({
    open: false,
    mode: "create",
    goalId: null,
  });
  const [contributionModal, setContributionModal] = useState({
    open: false,
    goalId: null,
  });

  // Derived things
  const totals = useMemo(() => computeTotals(budget), [budget]);
  const themeStyles = useMemo(() => getThemeConfig(theme), [theme]);
  const goalBeingEdited = useMemo(() => {
    if (!goalEditorState.goalId) return null;
    return goals.find((goal) => goal.id === goalEditorState.goalId) || null;
  }, [goalEditorState.goalId, goals]);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.body.dataset.theme = theme;
    }
  }, [theme]);

  const accountsById = useMemo(() => {
    const map = {};
    for (const acc of accounts) {
      map[acc.id] = acc;
    }
    return map;
  }, [accounts]);

  const accountRows = useMemo(() => {
    return accounts.map((acc) => {
      const starting =
        typeof acc.startingBalance === "number" ? acc.startingBalance : 0;
      const net = computeNetTransactions(acc);
      const balance = starting + net;
      return { id: acc.id, name: acc.name, balance };
    });
  }, [accounts]);

  const totalBalance = useMemo(
    () => accountRows.reduce((sum, row) => sum + row.balance, 0),
    [accountRows]
  );

  const currentAccountBalance =
    accountRows.find((row) => row.id === currentAccountId)?.balance ?? 0;

  const currentGoal =
    goals.find((g) => g.id === selectedGoalId) || goals[0] || null;

  const activeMonth = budget.month || getCurrentMonthKey();

  let pageTitle = NAV_LABELS[currentPage] || "Dashboard";
  if (currentPage === "goalDetail" && currentGoal) {
    pageTitle = currentGoal.name;
  }

  // --- Apply remote state helper (C) ---
  function applyRemoteState(remote) {
    if (!remote) return;

    applyingRemoteRef.current = true;

    try {
      if (remote.budget) setBudget(remote.budget);
      if (remote.goals) setGoals(remote.goals);
      if (remote.accounts)
        setAccounts(normalizeAccounts(remote.accounts || []));
      if (remote.currentAccountId) setCurrentAccountId(remote.currentAccountId);
      if (remote.selectedGoalId) setSelectedGoalId(remote.selectedGoalId);
      if (remote.navOrder) setNavOrder(normalizeNavOrder(remote.navOrder));
      if (remote.homePage) {
        setHomePage(remote.homePage);
        setCurrentPage(remote.homePage);
      }
      if (remote.dashboardSectionsOrder)
        setDashboardSectionsOrder(
          normalizeDashboardSections(remote.dashboardSectionsOrder)
        );
      if (remote.theme) setTheme(remote.theme);
    } catch (err) {
      console.error("Failed to apply remote user state", err);
    }
  }

  // ---- Realtime subscription: keep state in sync across devices (C) ----
  useEffect(() => {
    if (!user || !user.id) return;

    const channel = supabase
      .channel(`user_state_realtime_${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_state",
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          const remote = payload.new?.state;
          if (!remote) return;
          applyRemoteState(remote);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // ---- Load lightweight profile metadata (username/avatar) ----
  useEffect(() => {
    if (!user || !user.id) {
      setUserProfile(null);
      setProfileLoading(false);
      return;
    }

    let ignore = false;
    setProfileLoading(true);

    loadOrCreateUserProfile(user)
      .then((profileData) => {
        if (!ignore) {
          setUserProfile(profileData);
        }
      })
      .catch((err) => {
        if (!ignore) {
          console.error("Failed to load profile metadata:", err);
        }
      })
      .finally(() => {
        if (!ignore) {
          setProfileLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [user?.id]);

  // ---- Initial load from Supabase user_state ----
  useEffect(() => {
    if (!user || !user.id) return;

    let cancelled = false;

    (async () => {
      try {
        const remote = await loadUserState(user.id);
        if (!remote || cancelled) return;
        applyRemoteState(remote);
      } catch (err) {
        console.error("Failed to load remote user state", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // ---- Persist state with debounce (F + G) ----
  useEffect(() => {
    const state = {
      budget,
      goals,
      accounts,
      currentAccountId,
      selectedGoalId,
      navOrder,
      homePage,
      dashboardSectionsOrder,
      theme,
    };

    // Always keep localStorage up-to-date
    saveStoredState(state);

    if (!user || !user.id) return;

    // If we're just applying a remote update, skip saving back
    if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false;
      return;
    }

    // Debounce Supabase writes
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveUserState(user.id, state)
        .then(() => {
          setLastSavedAt(new Date().toLocaleTimeString());
        })
        .catch((err) =>
          console.error("Failed to save user state to Supabase:", err)
        );
    }, 600); // ~0.6s debounce

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [
    user,
    budget,
    goals,
    accounts,
    currentAccountId,
    selectedGoalId,
    navOrder,
    homePage,
    dashboardSectionsOrder,
    theme,
  ]);

  // ---------- Handlers ----------

  async function handleProfileUpdate(partialUpdates) {
    if (!user || !user.id) return false;
    try {
      const saved = await updateUserProfile(user.id, partialUpdates);
      setUserProfile(saved);
      setToast({
        message: "Profile updated.",
        variant: "success",
      });
      return true;
    } catch (err) {
      console.error("Failed to update profile metadata:", err);
      setToast({
        message: "Couldn't update profile. Try again in a bit.",
        variant: "info",
      });
      return false;
    }
  }

  function openGoalEditor(mode, goalId = null) {
    setGoalEditorState({ open: true, mode, goalId });
  }

  function closeGoalEditor() {
    setGoalEditorState({ open: false, mode: "create", goalId: null });
  }

  function normalizeGoalInput(data, existingId = null) {
    const sanitizedName = data?.name?.trim() || "Untitled Goal";
    const current = Math.max(0, Number(data?.current) || 0);
    const target = Math.max(0, Number(data?.target) || 0);
    const monthlyPlan = Math.max(0, Number(data?.monthlyPlan) || 0);
    return {
      id: existingId || `goal-${Date.now()}`,
      name: sanitizedName,
      target,
      current,
      saved: current,
      monthlyPlan,
      emoji: (data?.emoji && data.emoji.trim()) || "🎯",
      dueDate: data?.dueDate || null,
      theme: data?.theme || "cyber",
      icon: data?.icon || "🎯",
      background: data?.background || "default",
      animation: data?.animation || "pulse",
      description: data?.description?.trim() || "",
    };
  }

  function handleGoalEditorSave(formData) {
    if (goalEditorState.mode === "edit" && goalEditorState.goalId) {
      const updated = normalizeGoalInput(formData, goalEditorState.goalId);
      setGoals((prev) =>
        prev.map((goal) => (goal.id === updated.id ? { ...goal, ...updated } : goal))
      );
      setToast({
        message: `Updated goal "${updated.name}".`,
        variant: "success",
      });
    } else {
      const created = normalizeGoalInput(formData);
      setGoals((prev) => [...prev, created]);
      setSelectedGoalId(created.id);
      setToast({
        message: `Created goal "${created.name}".`,
        variant: "success",
      });
    }

    closeGoalEditor();
  }

  function handleGoalDelete(goalId) {
    if (!goalId) return;
    const filtered = goals.filter((goal) => goal.id !== goalId);
    setGoals(filtered);

    if (selectedGoalId === goalId) {
      setSelectedGoalId(filtered[0]?.id ?? null);
    }

    closeGoalEditor();
    setToast({
      message: "Goal deleted.",
      variant: "success",
    });
  }

  function handleStartCreateGoal() {
    openGoalEditor("create", null);
  }

  function handleStartEditGoal(goalId) {
    if (!goalId) return;
    openGoalEditor("edit", goalId);
  }

  function handleGoalDuplicate(goalId) {
    const goal = goals.find((g) => g.id === goalId);
    if (!goal) return;
    const duplicate = {
      ...goal,
      id: `goal-${Date.now()}`,
      name: `${goal.name || "Goal"} copy`,
    };
    setGoals((prev) => [...prev, duplicate]);
    setSelectedGoalId(duplicate.id);
    setCurrentPage("goalDetail");
    setToast({
      message: `Duplicated goal "${goal.name || "Goal"}".`,
      variant: "success",
    });
  }

  function handleGoalExport(goalId) {
    const goal = goals.find((g) => g.id === goalId);
    if (!goal) {
      setToast({
        message: "Goal not found to export.",
        variant: "info",
      });
      return;
    }

    const exportData = {
      name: goal.name,
      target: goal.target,
      saved: goal.current ?? goal.saved,
      monthlyPlan: goal.monthlyPlan,
      description: goal.description,
      progressPct:
        goal.target > 0
          ? Number((((goal.current ?? goal.saved ?? 0) / goal.target) * 100).toFixed(2))
          : 0,
      lastUpdated: new Date().toISOString(),
    };

    const text = JSON.stringify(exportData, null, 2);

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          setToast({
            message: "Copied goal progress to clipboard.",
            variant: "success",
          });
        })
        .catch(() => {
          downloadExport(text, goal.name || "goal");
        });
    } else {
      downloadExport(text, goal.name || "goal");
    }
  }

  function handleOpenContribution(goalId) {
    if (!goalId) return;
    setContributionModal({ open: true, goalId });
  }

  function handleAddContribution(amount) {
    if (!contributionModal.goalId) return;
    const numeric = Math.max(0, Number(amount) || 0);
    setGoals((prev) =>
      prev.map((goal) =>
        goal.id === contributionModal.goalId
          ? {
              ...goal,
              current: (Number(goal.current ?? goal.saved ?? 0) || 0) + numeric,
              saved: (Number(goal.current ?? goal.saved ?? 0) || 0) + numeric,
            }
          : goal
      )
    );
    setToast({
      message: `Added $${numeric.toFixed(2)} to your goal.`,
      variant: "success",
    });
    setContributionModal({ open: false, goalId: null });
  }

  function downloadExport(text, name) {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(name || "goal").toLowerCase().replace(/\s+/g, "-")}-progress.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setToast({
      message: "Downloaded goal progress .json file.",
      variant: "success",
    });
  }

  function moveItem(list, index, delta) {
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= list.length) return list;
    const copy = [...list];
    const [item] = copy.splice(index, 1);
    copy.splice(nextIndex, 0, item);
    return copy;
  }

  function handleBudgetChange(nextBudget) {
    setBudget(nextBudget);
  }

  function handleSetHomePage(pageKey) {
    setHomePage(pageKey);
    setCurrentPage(pageKey);
    setToast({
      message: `Home page set to ${NAV_LABELS[pageKey] || pageKey}.`,
      variant: "success",
    });
  }

  function handleNavReorder(nextOrder) {
    setNavOrder(normalizeNavOrder(nextOrder));
  }

  function handleNavMove(index, delta) {
    setNavOrder((prev) => moveItem(prev, index, delta));
  }

  function handleDashboardSectionsReorder(nextOrder) {
    setDashboardSectionsOrder(normalizeDashboardSections(nextOrder));
  }

  function handleDashboardSectionMove(index, delta) {
    setDashboardSectionsOrder((prev) => moveItem(prev, index, delta));
  }

  function handleCreateAccountFromCsv({ bankName, accountType, transactions }) {
    const id =
      bankName?.toLowerCase().replace(/\s+/g, "-").slice(0, 20) ||
      `acc-${Date.now()}`;

    const newAccount = {
      id,
      name: bankName || "Imported Account",
      type: accountType || "checking",
      startingBalance: 0,
      transactions,
    };

    setAccounts((prev) => [...prev, newAccount]);
    setCurrentAccountId(id);

    setToast({
      message: `Created account "${newAccount.name}" with ${transactions.length} transactions.`,
      accountId: id,
      variant: "success",
    });
  }

  function handleImportIntoExistingAccount(accountId, transactions) {
    setAccounts((prev) =>
      prev.map((acc) => {
        if (acc.id !== accountId) return acc;
        const merged = mergeTransactions(
          Array.isArray(acc.transactions) ? acc.transactions : [],
          transactions
        );
        return { ...acc, transactions: merged };
      })
    );

    const accName = accountsById[accountId]?.name || "Selected account";

    setToast({
      message: `Imported ${transactions.length} transactions into "${accName}".`,
      accountId,
      variant: "success",
    });
  }

  function handleCsvImported(transactions, rawText) {
    const nonZero = (transactions || []).filter(
      (tx) => typeof tx.amount === "number" && tx.amount !== 0
    );
    if (!nonZero.length) {
      setToast({
        message: "No valid transactions found in this file.",
        variant: "info",
      });
      return;
    }

    const sourceName = guessBankNameFromText(rawText) || "";

    const result = importTransactionsWithDetection(
      accounts,
      currentAccountId,
      nonZero,
      sourceName
    );

    setAccounts(normalizeAccounts(result.accounts));
    setCurrentAccountId(result.targetAccountId);

    if (result.createdNew) {
      setToast({
        message: `Created "${result.targetAccountName}" with ${nonZero.length} transactions.`,
        accountId: result.targetAccountId,
        variant: "success",
      });
    } else {
      setToast({
        message: `Imported ${nonZero.length} transactions into "${result.targetAccountName}".`,
        accountId: result.targetAccountId,
        variant: "success",
      });
    }
  }

  function handleUpdateTransaction(index, updatedFields) {
    setAccounts((prev) =>
      prev.map((acc) => {
        if (acc.id !== currentAccountId) return acc;
        const oldTxs = Array.isArray(acc.transactions) ? acc.transactions : [];
        const newTxs = oldTxs.map((tx, i) =>
          i === index ? { ...tx, ...updatedFields } : tx
        );
        return { ...acc, transactions: newTxs };
      })
    );
  }

  function handleDeleteTransaction(index) {
    setAccounts((prev) =>
      prev.map((acc) => {
        if (acc.id !== currentAccountId) return acc;
        const oldTxs = Array.isArray(acc.transactions) ? acc.transactions : [];
        const newTxs = oldTxs.filter((_, i) => i !== index);
        return { ...acc, transactions: newTxs };
      })
    );
  }

  function handleSetAccountBalance(accountId, newBalance) {
    setAccounts((prev) =>
      prev.map((acc) =>
        acc.id === accountId ? { ...acc, startingBalance: newBalance } : acc
      )
    );
  }

  function handleRenameAccount(accountId, newName) {
    setAccounts((prev) =>
      prev.map((acc) =>
        acc.id === accountId ? { ...acc, name: newName } : acc
      )
    );
  }

  function handleCreateEmptyAccount() {
    const baseIndex = accounts.length + 1;
    const id = `acc-${Date.now()}`;
    const newAccount = {
      id,
      name: `Account ${baseIndex}`,
      type: "checking",
      startingBalance: 0,
      transactions: [],
    };
    setAccounts((prev) => [...prev, newAccount]);
    setCurrentAccountId(id);

    setToast({
      message: `Created account "${newAccount.name}".`,
      accountId: id,
      variant: "success",
    });
  }

  async function handleResetAllData() {
    const confirmed = window.confirm(
      "This will reset your budget, goals, accounts, and transactions back to empty. Continue?"
    );
    if (!confirmed) return;

    let resetError = null;
    try {
      if (user?.id) {
        await supabase.from("user_state").delete().eq("id", user.id);
      }
    } catch (err) {
      resetError = err;
      console.error("Failed to reset remote data:", err);
    }

    window.localStorage.removeItem(STORAGE_KEY);

    setBudget(createBlankBudget());
    setGoals(createBlankGoals());
    setAccounts(createBlankAccounts());
    setCurrentAccountId(BASE_ACCOUNT_ID);
    setSelectedGoalId(null);
    setNavOrder(NAV_ITEMS.map((n) => n.key));
    setHomePage("dashboard");
    setDashboardSectionsOrder(DEFAULT_DASHBOARD_SECTIONS);
    setCurrentPage("dashboard");
    setTheme("dark");
    setToast({
      message: "All data reset successfully.",
      variant: "success",
    });

    if (resetError) {
      window.alert(
        "Remote reset failed, but local data was cleared. Try again later."
      );
    }
  }

  // ---- Auth gate ----
  if (!user) {
    return (
      <AuthScreen
        loading={authLoading}
        onSignIn={signInWithEmail}
        onSignUp={signUpWithEmail}
        onResetPassword={resetPassword}
      />
    );
  }

  // ---- App layout ----
  return (
    <div className={`min-h-screen flex flex-col ${themeStyles.shellClass}`}>
      <header
        className={`flex-none border-b backdrop-blur ${themeStyles.headerClass}`}
      >
        <div className="max-w-5xl mx-auto px-4 py-3 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col">
            <span className="text-xs tracking-[0.2em] text-cyan-300">
              BUDGET CENTER
            </span>
            <span className="text-sm text-slate-400">
              Dark cyber budgeting with themed goals
            </span>
            {lastSavedAt && (
              <span className="text-[10px] text-slate-500 mt-1">
                Last saved at {lastSavedAt}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
            <ThemeSelector value={theme} onChange={setTheme} />

            {navOrder.map((pageKey) => (
              <NavButton
                key={pageKey}
                label={NAV_LABELS[pageKey] || pageKey}
                active={currentPage === pageKey}
                onClick={() => setCurrentPage(pageKey)}
              />
            ))}

            <ProfileMenu
              profile={userProfile}
              email={user?.email}
              loading={profileLoading}
              onUpdateProfile={handleProfileUpdate}
            />

            <ActionsMenu
              customizeMode={customizeMode}
              setCustomizeMode={setCustomizeMode}
              onReset={handleResetAllData}
              onSignOut={signOut}
            />
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-4 space-y-3">
        {customizeMode && (
          <div className="border border-cyan-500/40 rounded-xl bg-cyan-500/5 p-4 space-y-4 shadow-lg">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-cyan-200">
                  Customize layout
                </p>
                <p className="text-xs text-slate-300">
                  Reorder your navigation tabs and dashboard sections. Changes
                  are saved automatically.
                </p>
              </div>
              <div className="flex gap-2 text-xs">
                <span className="px-2 py-1 rounded border border-cyan-400/50 text-cyan-200">
                  Home page: {NAV_LABELS[homePage] || homePage}
                </span>
                <button
                  type="button"
                  className="px-2 py-1 rounded border border-slate-600/70 text-slate-200 hover:border-slate-400 transition"
                  onClick={() => setCustomizeMode(false)}
                >
                  Done
                </button>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4 text-xs">
              <div className="space-y-2">
                <p className="uppercase tracking-[0.2em] text-slate-400">
                  Navigation order
                </p>
                <ul className="space-y-2">
                  {navOrder.map((key, index) => (
                    <li
                      key={key}
                      className="flex items-center justify-between rounded-lg border border-slate-700/70 bg-black/30 px-3 py-2 text-slate-200"
                    >
                      <div className="flex flex-col">
                        <span className="text-sm">{NAV_LABELS[key] || key}</span>
                        {homePage === key && (
                          <span className="text-[10px] text-cyan-300">
                            Home page
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className="px-2 py-1 border border-slate-600/70 rounded disabled:opacity-40"
                          onClick={() => handleNavMove(index, -1)}
                          disabled={index === 0}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="px-2 py-1 border border-slate-600/70 rounded disabled:opacity-40"
                          onClick={() => handleNavMove(index, 1)}
                          disabled={index === navOrder.length - 1}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="px-2 py-1 border border-cyan-500/50 rounded text-cyan-200"
                          onClick={() => handleSetHomePage(key)}
                        >
                          Set home
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-2">
                <p className="uppercase tracking-[0.2em] text-slate-400">
                  Dashboard sections
                </p>
                <ul className="space-y-2">
                  {dashboardSectionsOrder.map((key, index) => (
                    <li
                      key={key}
                      className="flex items-center justify-between rounded-lg border border-slate-700/70 bg-black/30 px-3 py-2 text-slate-200"
                    >
                      <span className="text-sm">
                        {DASHBOARD_SECTION_LABELS[key] || key}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className="px-2 py-1 border border-slate-600/70 rounded disabled:opacity-40"
                          onClick={() => handleDashboardSectionMove(index, -1)}
                          disabled={index === 0}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="px-2 py-1 border border-slate-600/70 rounded disabled:opacity-40"
                          onClick={() => handleDashboardSectionMove(index, 1)}
                          disabled={index === dashboardSectionsOrder.length - 1}
                        >
                          ↓
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Page Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col">
            <h1 className="text-base font-semibold text-slate-50">
              {pageTitle}
            </h1>
            <p className="text-xs text-slate-400">
              {currentPage === "dashboard" &&
                "Overview of your month, accounts, goals, and imports."}
              {currentPage === "balances" &&
                "View and edit your account balances and see net worth."}
              {currentPage === "budget" &&
                "Adjust your monthly budget categories and income."}
              {currentPage === "transactions" &&
                "Review, edit, and clean up imported transactions."}
              {currentPage === "goalDetail" &&
                "Drill into a single financial goal and its progress."}
            </p>
          </div>

          <div className="flex flex-col items-end text-xs text-slate-400">
            <span>
              Month:{" "}
              <span className="font-mono text-slate-100">{activeMonth}</span>
            </span>
            <span>
              Total Balance:{" "}
              <span className="font-mono text-emerald-300">
                ${(Number.isFinite(totalBalance) ? totalBalance : 0).toFixed(2)}
              </span>
            </span>
          </div>
        </div>

        {/* Content */}
        {currentPage === "dashboard" && (
          <Dashboard
            month={activeMonth}
            income={budget.income}
            fixed={totals.fixedTotal}
            variable={totals.variableTotal}
            leftover={totals.leftover}
            goals={goals}
            transactions={
              accountsById[currentAccountId]?.transactions || []
            }
            accounts={accounts}
            currentAccountId={currentAccountId}
            onChangeCurrentAccount={setCurrentAccountId}
            onOpenGoal={(goalId) => {
              setSelectedGoalId(goalId);
              setCurrentPage("goalDetail");
            }}
            onCreateGoal={handleStartCreateGoal}
            currentAccountBalance={currentAccountBalance}
            totalBalance={totalBalance}
            sectionsOrder={dashboardSectionsOrder}
            onSectionsReorder={handleDashboardSectionsReorder}
            customizeMode={customizeMode}
            // BankImportCard calls this with (parsedRows, rawText)
            onCsvImported={handleCsvImported}
          />
        )}

        {currentPage === "balances" && (
          <BalancesDashboard
            accounts={accounts}
            currentAccountId={currentAccountId}
            onChangeCurrentAccount={setCurrentAccountId}
            onCreateAccount={handleCreateEmptyAccount}
            onViewAccount={(accId) => {
              setCurrentAccountId(accId);
              setCurrentPage("transactions");
            }}
            onDeleteAccount={(accountIdToDelete) => {
              const count = accounts.length;
              if (count <= 1) {
                window.alert(
                  "You need at least one account. Create another one before deleting this."
                );
                return;
              }

              const confirmed = window.confirm(
                "Are you sure you want to delete this account? Its transactions will be lost."
              );
              if (!confirmed) return;

              setAccounts((prev) =>
                prev.filter((acc) => acc.id !== accountIdToDelete)
              );

              if (currentAccountId === accountIdToDelete) {
                const remaining = accounts.filter(
                  (acc) => acc.id !== accountIdToDelete
                );
                if (remaining.length) {
                  setCurrentAccountId(remaining[0].id);
                } else {
                  setCurrentAccountId(null);
                }
              }
            }}
            onSetAccountBalance={handleSetAccountBalance}
            onRenameAccount={handleRenameAccount}
          />
        )}

        {currentPage === "budget" && (
          <BudgetPage
            month={activeMonth}
            budget={budget}
            totals={totals}
            onBudgetChange={handleBudgetChange}
          />
        )}

        {currentPage === "transactions" && (
          <TransactionsPage
            transactions={
              accountsById[currentAccountId]?.transactions || []
            }
            accountName={accountsById[currentAccountId]?.name || "None"}
            onUpdateTransaction={handleUpdateTransaction}
            onDeleteTransaction={handleDeleteTransaction}
          />
        )}

        {currentPage === "goalDetail" && (
          <GoalDetailPage
            goal={currentGoal}
            onEditGoal={handleStartEditGoal}
            onDeleteGoal={handleGoalDelete}
            onDuplicateGoal={handleGoalDuplicate}
            onExportGoal={handleGoalExport}
            onAddContributionRequest={handleOpenContribution}
          />
        )}
      </main>

      {toast && (
        <Toast
          message={toast.message}
          variant={toast.variant}
          actionLabel={toast.accountId ? "View account" : undefined}
          onAction={
            toast.accountId
              ? () => {
                  setCurrentAccountId(toast.accountId);
                  setCurrentPage("balances");
                  setToast(null);
                }
              : undefined
          }
          onClose={() => setToast(null)}
        />
      )}

      <GoalEditorModal
        open={goalEditorState.open}
        mode={goalEditorState.mode}
        initialGoal={goalBeingEdited}
        onClose={closeGoalEditor}
        onSave={handleGoalEditorSave}
        onDelete={handleGoalDelete}
      />
      <ContributionModal
        open={contributionModal.open}
        goal={goals.find((g) => g.id === contributionModal.goalId)}
        onAdd={handleAddContribution}
        onClose={() => setContributionModal({ open: false, goalId: null })}
      />
    </div>
  );
}

export default App;
