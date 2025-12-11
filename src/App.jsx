import React, { useState, useEffect, useMemo, useRef } from "react";
import "./App.css";
import { useSupabaseAuth } from "./SupabaseAuthProvider.jsx";
import { loadUserState, saveUserState } from "./userStateApi.js";
import { supabase } from "./supabaseClient";

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

// ----- Local Storage -----
const STORAGE_KEY = "budgetAppState_v1";

function loadStoredState() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error("Failed to load stored state", err);
    return null;
  }
}

function saveStoredState(state) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error("Failed to save state", err);
  }
}

function migrateStoredState(stored) {
  if (!stored) return null;

  // If accounts already exist, just return as-is
  if (stored.accounts && Array.isArray(stored.accounts)) {
    return stored;
  }

  // If only old "transactions" exist, wrap them in a default account
  const defaultAccount = {
    id: "main",
    name: "Main Account",
    type: "checking",
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

function mergeTransactions(existing, incoming) {
  // create a simple key like: "2025-01-01|starbucks|-5.75"
  const makeKey = (tx) =>
    `${(tx.date || "").trim()}|${(tx.description || "")
      .trim()
      .toLowerCase()}|${isNaN(tx.amount) ? "NaN" : tx.amount}`;

  const seen = new Set(existing.map((tx) => makeKey(tx)));
  const merged = [...existing];

  for (const tx of incoming) {
    const key = makeKey(tx);
    if (!seen.has(key)) {
      merged.push(tx);
      seen.add(key);
    }
  }

  return merged;
}

// ----- Sample Data -----
const sampleBudget = {
  month: "January 2026",
  incomeItems: [
    { name: "Paycheck", amount: 3800 },
    { name: "Side Work", amount: 700 },
  ],
  fixedExpenses: [
    { name: "Rent", amount: 1400 },
    { name: "Utilities", amount: 250 },
    { name: "Car (Azera)", amount: 300 },
    { name: "Car (Rogue)", amount: 220 },
    { name: "Phone", amount: 90 },
    { name: "Subscriptions", amount: 70 },
  ],
  variableExpenses: [
    { name: "Groceries", amount: 400 },
    { name: "Gas", amount: 200 },
    { name: "Eating Out", amount: 150 },
    { name: "Fun Money", amount: 100 },
  ],
};

const sampleGoals = [
  {
    id: "japan",
    name: "Japan Trip",
    emoji: "🇯🇵",
    saved: 500,
    target: 5000,
    monthlyPlan: 270,
    theme: "japan",
  },
  {
    id: "azera",
    name: "Azera Loan",
    emoji: "🚗",
    saved: 0,
    target: 7692.46,
    monthlyPlan: 380,
    theme: "car",
  },
];

// Empty starting data for real users
const EMPTY_BUDGET = {
  month: "January 2026", // or later: dynamically compute current month
  incomeItems: [],
  fixedExpenses: [],
  variableExpenses: [],
};

const EMPTY_GOALS = [];

const EMPTY_ACCOUNTS = [
  {
    id: "main",
    name: "Main Account",
    type: "checking",
    startingBalance: 0,
    transactions: [],
  },
];

function sumAmounts(items) {
  return items.reduce((sum, item) => sum + item.amount, 0);
}


function computeNetTransactions(account) {
  const txs = Array.isArray(account?.transactions)
    ? account.transactions
    : [];
  return txs.reduce(
    (sum, tx) => sum + (typeof tx.amount === "number" ? tx.amount : 0),
    0
  );
}

function normalizeAccounts(accs) {
  return (accs || []).map((acc) => ({
    ...acc,
    startingBalance:
      typeof acc.startingBalance === "number" ? acc.startingBalance : 0,
  }));
}

function buildDescriptionSet(transactions = []) {
  const set = new Set();
  (transactions || []).forEach((tx) => {
    const desc = (tx.description || "").trim().toLowerCase();
    if (!desc) return;
    // keep full description for now
    set.add(desc);
  });
  return set;
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
  // if it's mostly charges with occasional payments, call it a credit account
  return ratio >= 0.7 ? "credit" : "checking";
}

const KNOWN_BANK_KEYWORDS = [
  { match: "chase", label: "Chase" },
  { match: "capitalone", label: "Capital One" },
  { match: "wellsfargo", label: "Wells Fargo" },
  { match: "americanexpress", label: "Amex" },
  { match: "discover", label: "Discover" },
  { match: "navyfederal", label: "Navy Federal" },
  { match: "mountainamerica", label: "Mountain America" },
  { match: "bankofamerica", label: "Bank of America" },
  { match: "usbank", label: "US Bank" },
  { match: "pnc", label: "PNC" }
];

function normalizeKey(str = "") {
  return str.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function guessAccountNameFromRows(rows = [], sourceName = "") {
  // --- 1. Detect bank from file name ---
  const sourceKey = normalizeKey(sourceName);
  if (sourceKey) {
    for (const bank of KNOWN_BANK_KEYWORDS) {
      if (sourceKey.includes(bank.match)) {
        return `${bank.label} Account`;
      }
    }
  }

  // --- 2. Detect bank from first 20 descriptions ---
  const joinedDescriptions = rows
    .slice(0, 20)
    .map((r) => r.description || "")
    .join(" ");

  const descKey = normalizeKey(joinedDescriptions);

  for (const bank of KNOWN_BANK_KEYWORDS) {
    if (descKey.includes(bank.match)) {
      return `${bank.label} Account`;
    }
  }

  // --- 3. Fallback to original behavior ---
  if (!rows.length) return "Imported Account";

  const sample = (rows[0].description || "").trim();
  if (!sample) return "Imported Account";

  const words = sample.split(/\s+/).filter((w) => w.length > 3);
  if (!words.length) return "Imported Account";

  const label = words[0].replace(/[^a-z0-9]/gi, " ");
  const cleaned = label.trim();

  if (!cleaned) return "Imported Account";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1) + " Account";
}

function detectTargetAccountForImport(
  accounts = [],
  currentAccountId,
  importedRows = []
) {
  
const withTransactions = (accounts || []).filter(
    (acc) => Array.isArray(acc.transactions) && acc.transactions.length > 0
  );

  // If no account has existing transactions yet, treat this as a *new* account.
  // That way your very first CSV import becomes its own account instead of
  // always dumping into "Main Account".
  if (!withTransactions.length) {
    return null;
  }

  const importedDescriptions = buildDescriptionSet(importedRows);
  if (!importedDescriptions.size) {
    return currentAccountId;
  }

  let bestAccountId = null;
  let bestOverlap = 0;

  for (const acc of withTransactions) {
    const existingDescriptions = buildDescriptionSet(acc.transactions);
    if (!existingDescriptions.size) continue;

    let overlap = 0;
    for (const desc of importedDescriptions) {
      if (existingDescriptions.has(desc)) overlap++;
    }

    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestAccountId = acc.id;
    }
  }

  // Heuristic thresholds:
  // - If we have at least 3 overlapping exact descriptions OR
  //   at least 20% of imported descriptions overlap with this account,
  //   we treat it as the same account.
  const overlapRatio =
    importedDescriptions.size > 0 ? bestOverlap / importedDescriptions.size : 0;

  if (bestAccountId && (bestOverlap >= 3 || overlapRatio >= 0.2)) {
    return bestAccountId;
  }

  // Otherwise, this looks like a new account
  return null;
}

function importTransactionsWithDetection(
  accounts = [],
  currentAccountId,
  importedRows = [],
  sourceName = ""
) {
  const targetId = detectTargetAccountForImport(
    accounts,
    currentAccountId,
    importedRows
  );

  // Case 1: We matched an existing account
  if (targetId) {
    const nextAccounts = (accounts || []).map((acc) =>
      acc.id === targetId
        ? {
            ...acc,
            transactions: mergeTransactions(acc.transactions || [], importedRows),
          }
        : acc
    );

    const matched = (accounts || []).find((a) => a.id === targetId);

    return {
      targetAccountId: targetId,
      targetAccountName: matched?.name || "Account",
      accounts: nextAccounts,
      createdNew: false,
    };
  }

  // Case 2: No good match → create a new account
  const type = guessAccountTypeFromRows(importedRows);
  const name = guessAccountNameFromRows(importedRows, sourceName);
  const newId =
    name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") +
    "-" +
    Date.now();

  const newAccount = {
    id: newId,
    name,
    type,
    startingBalance: 0,
    transactions: importedRows,
  };

  return {
    targetAccountId: newId,
    targetAccountName: name,
    accounts: [...(accounts || []), newAccount],
    createdNew: true,
  };
}

function AuthScreen({ onSignIn, onSignUp, onResetPassword, loading }) {
  const [mode, setMode] = React.useState("signin"); // or "signup"
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState(null);
  const [info, setInfo] = React.useState(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [resetSubmitting, setResetSubmitting] = React.useState(false);

  async function handleForgotPasswordClick() {
  setError(null);
  setInfo(null);

  if (!email) {
    setError("Please enter your email first, then click 'Forgot password?'.");
    return;
  }

  if (!onResetPassword) return;

  setResetSubmitting(true);
  try {
    await onResetPassword(email);
    setInfo(
      "If an account exists with that email, a reset link has been sent. " +
      "Check your inbox and follow the instructions there."
    );
  } catch (err) {
    setError(err.message || "Failed to start password reset.");
  } finally {
    setResetSubmitting(false);
  }
}

    async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setInfo(null);   // <-- Clear info message
    setSubmitting(true);

    try {
      if (mode === "signin") {
        await onSignIn(email, password);

      } else {
        // SIGN UP FLOW
        const result = await onSignUp(email, password);
        const user = result?.user || null;
        const session = result?.session || null;

        // If Supabase requires email confirmation, user exists but session === null
        if (user && !session) {
          setInfo(
            "Account created! Check your email and click the confirmation link. " +
            "After that, this page will automatically log you in."
          );
          } else {
          // In case email confirmation is off: they’ll usually be logged in immediately
          setInfo("Account created!");
        }
      }
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#05060A] text-slate-100">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#05060A] text-slate-100 px-4">
      <div className="w-full max-w-sm border border-slate-800 rounded-xl p-6 bg-[#05060F]">
        <h1 className="text-xl font-semibold mb-4 text-center">
          Budget App Login
        </h1>

        <div className="flex justify-center gap-2 mb-4 text-xs">
          <button
            type="button"
            className={`px-3 py-1 rounded-full border ${
              mode === "signin"
                ? "border-emerald-400 text-emerald-300"
                : "border-slate-700 text-slate-400"
            }`}
            onClick={() => setMode("signin")}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`px-3 py-1 rounded-full border ${
              mode === "signup"
                ? "border-emerald-400 text-emerald-300"
                : "border-slate-700 text-slate-400"
            }`}
            onClick={() => setMode("signup")}
          >
            Sign Up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="text-left text-xs space-y-1">
            <label className="block text-slate-300">Email</label>
            <input
              type="email"
              required
              className="w-full rounded-md bg-slate-900 border border-slate-700 px-2 py-1 text-sm text-slate-100"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="text-left text-xs space-y-1">
            <label className="block text-slate-300">Password</label>
            <input
              type="password"
              required
              className="w-full rounded-md bg-slate-900 border border-slate-700 px-2 py-1 text-sm text-slate-100"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {mode === "signin" && (
            <div className="flex justify-end -mt-1">
              <button
                type="button"
                onClick={handleForgotPasswordClick}
                disabled={resetSubmitting}
                className="text-[0.7rem] text-cyan-300 hover:text-cyan-200 disabled:opacity-60"
              >
                {resetSubmitting ? "Sending reset link..." : "Forgot password?"}
              </button>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-400 whitespace-pre-wrap">{error}</p>
          )}

          {info && (
            <p className="text-xs text-emerald-300 whitespace-pre-wrap mt-1">
              {info}
            </p>
          )}


          <button
            type="submit"
            disabled={submitting}
            className="w-full mt-2 rounded-md bg-emerald-500 hover:bg-emerald-400 text-slate-900 text-sm font-medium py-1.5 disabled:opacity-60"
          >
            {submitting
              ? "Working..."
              : mode === "signin"
              ? "Sign In"
              : "Create Account"}
          </button>
        </form>
      </div>
    </div>
  );
}

function App() {
   const {
    user,
    authLoading,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    resetPassword,
  } = useSupabaseAuth();

  const applyingRemoteRef = useRef(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);

  const rawStored = loadStoredState();
  const stored = migrateStoredState(rawStored);

  // Start with empty data if nothing stored yet
  const [budget, setBudget] = useState(stored?.budget || EMPTY_BUDGET);
  const [goals, setGoals] = useState(stored?.goals || EMPTY_GOALS);
  const [accounts, setAccounts] = useState(
    normalizeAccounts(stored?.accounts || EMPTY_ACCOUNTS)
  );

  const [currentAccountId, setCurrentAccountId] = useState(
    stored?.currentAccountId ||
      (stored?.accounts && stored.accounts[0]?.id) ||
      "main"
  );

  // NEW: nav & layout customization
  const [navOrder, setNavOrder] = useState(
    stored?.navOrder && stored.navOrder.length
      ? stored.navOrder
      : NAV_ITEMS.map((n) => n.key)
  );

  const [homePage, setHomePage] = useState(stored?.homePage || "dashboard");

  const [dashboardSectionsOrder, setDashboardSectionsOrder] = useState(
  stored?.dashboardSectionsOrder && stored.dashboardSectionsOrder.length
    ? stored.dashboardSectionsOrder
    : DEFAULT_DASHBOARD_SECTIONS
);

const [customizeMode, setCustomizeMode] = useState(false);

  const [currentPage, setCurrentPage] = useState(homePage);
   const [selectedGoalId, setSelectedGoalId] = useState(
    stored?.selectedGoalId || (stored?.goals?.[0]?.id ?? null)
  );


  const [toast, setToast] = useState(null);
  // toast shape: { id, message, variant}

  // ---- current account + balance ----
  const currentAccount =
    accounts.find((acc) => acc.id === currentAccountId) || accounts[0];
  const transactions = currentAccount ? currentAccount.transactions || [] : [];

    // EDIT a single transaction in the current account
  function handleEditTransaction(index, updatedFields) {
    setAccounts((prev) =>
      prev.map((acc) => {
        if (acc.id !== currentAccountId) return acc;

        const oldTxs = Array.isArray(acc.transactions)
          ? acc.transactions
          : [];

        const newTxs = oldTxs.map((tx, i) =>
          i === index ? { ...tx, ...updatedFields } : tx
        );

        return { ...acc, transactions: newTxs };
      })
    );
  }

  // DELETE a single transaction in the current account
  function handleDeleteTransaction(index) {
    setAccounts((prev) =>
      prev.map((acc) => {
        if (acc.id !== currentAccountId) return acc;

        const oldTxs = Array.isArray(acc.transactions)
          ? acc.transactions
          : [];

        const newTxs = oldTxs.filter((_, i) => i !== index);

        return { ...acc, transactions: newTxs };
      })
    );
  }

  function handleCreateAccount() {
    const name = window.prompt("New account name:");
    if (!name) return;

    const id =
      name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") +
      "-" +
      Date.now();

    setAccounts((prev) => [
      ...prev,
      {
        id,
        name,
        type: "checking",
        startingBalance: 0,
        transactions: [],
      },
    ]);

    setCurrentAccountId(id);
  }

    function handleDeleteAccount(accountId) {
    // Don't allow deleting if it's the only account
    if (accounts.length <= 1) {
      window.alert("You need at least one account. Create another one before deleting this.");
      return;
    }

    const target = accounts.find((a) => a.id === accountId);
    if (!target) return;

    if (
      !window.confirm(
        `Delete account "${target.name}" and all its transactions? This cannot be undone.`
      )
    ) {
      return;
    }

    // Filter it out
    const remaining = accounts.filter((a) => a.id !== accountId);
    setAccounts(remaining);

    // If we deleted the current account, switch to the first remaining one
    if (currentAccountId === accountId && remaining.length > 0) {
      setCurrentAccountId(remaining[0].id);
    }
  }

    async function handleResetAllData() {
    if (!user || !user.id) return;

    const confirmed = window.confirm(
      "This will reset your budget, goals, accounts, and transactions back to empty. Continue?"
    );
    if (!confirmed) return;

    try {
      // Delete this user's cloud state
      await supabase.from("user_state").delete().eq("id", user.id);

      // Clear local cache
      window.localStorage.removeItem(STORAGE_KEY);

      // Reset React state to your empty defaults
      setBudget(EMPTY_BUDGET);
      setGoals(EMPTY_GOALS);
      setAccounts(EMPTY_ACCOUNTS);
      setCurrentAccountId(EMPTY_ACCOUNTS[0].id);
      setSelectedGoalId(null);
      setNavOrder(NAV_ITEMS.map((n) => n.key));
      setHomePage("dashboard");
      setDashboardSectionsOrder(DEFAULT_DASHBOARD_SECTIONS);
      setCurrentPage("dashboard");
    } catch (err) {
      console.error("Failed to reset data:", err);
      window.alert("Something went wrong resetting your data. Try again.");
    }
  }

  const accountStarting =
    currentAccount && typeof currentAccount.startingBalance === "number"
      ? currentAccount.startingBalance
      : 0;

  const accountNet = computeNetTransactions(currentAccount);
  const accountBalance = accountStarting + accountNet;

  // --- compute balances for all accounts ---
const accountRows = (accounts || []).map((acc) => {
  const starting =
    typeof acc.startingBalance === "number" ? acc.startingBalance : 0;
  const net = computeNetTransactions(acc);
  const balance = starting + net;
  return { id: acc.id, name: acc.name, balance };
});

const totalBalance = accountRows.reduce(
  (sum, row) => sum + row.balance,
  0
);

const currentAccountBalance =
  accountRows.find((row) => row.id === currentAccountId)?.balance ?? 0;

// ---- CSV import with automatic account detection ----
function handleImportedTransactions(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return;
  function handleImportedTransactions(payload) {
    const { rows, sourceName = "" } = payload;
      importTransactionsWithDetection(accounts, currentAccountId, rows, sourceName);
}

    if (!Array.isArray(rows) || rows.length === 0) return;

  const result = importTransactionsWithDetection(
    accounts,
    currentAccountId,
    rows,
    sourceName
  );

  setAccounts(result.accounts);

  if (
    result.targetAccountId &&
    result.targetAccountId !== currentAccountId
  ) {
    setCurrentAccountId(result.targetAccountId);
  }

  const toastId = Date.now();

  // Build a slightly nicer message
  let message;
  if (result.createdNew) {
    message = `New account detected and created: "${result.targetAccountName}".`;
  } else {
    message = `Imported transactions into "${result.targetAccountName}".`;
  }

  setToast({
    id: toastId,
    variant: result.createdNew ? "success" : "info",
    message,
    accountId: result.targetAccountId || null,
    createdNew: result.createdNew,
  });

  // Auto-hide after 4 seconds
  setTimeout(() => {
    setToast((current) =>
      current && current.id === toastId ? null : current
    );
  }, 4000);
}

    // Realtime subscription: keep state in sync across devices
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
          console.log("🔄️ Realtime update received:", payload)
          const remote = payload.new?.state;
          if (!remote) return;

          // Mark that this change came from Supabase,
          // so the saving effect doesn't immediately write it back.
          applyingRemoteRef.current = true;

          try {
            if (remote.budget) setBudget(remote.budget);
            if (remote.goals) setGoals(remote.goals);
            if (remote.accounts)
              setAccounts(normalizeAccounts(remote.accounts));
            if (remote.currentAccountId)
              setCurrentAccountId(remote.currentAccountId);
            if (remote.selectedGoalId)
              setSelectedGoalId(remote.selectedGoalId);
            if (remote.navOrder) setNavOrder(remote.navOrder);
            if (remote.homePage) {
              setHomePage(remote.homePage);
              setCurrentPage((current) =>
                current === "dashboard" || current === remote.homePage
                  ? remote.homePage
                  : current
              );
            }
            if (remote.dashboardSectionsOrder)
              setDashboardSectionsOrder(remote.dashboardSectionsOrder);
          } catch (err) {
            console.error("Failed to apply realtime user state:", err);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // Initial load: pull the saved cloud state once after login
  useEffect(() => {
    if (!user || !user.id) return;

    let cancelled = false;

    (async () => {
      const remote = await loadUserState(user.id);
      if (!remote || cancelled) return;

      // Also mark this as "remote-driven" so we don't immediately save it back
      applyingRemoteRef.current = true;

      try {
        if (remote.budget) setBudget(remote.budget);
        if (remote.goals) setGoals(remote.goals);
        if (remote.accounts)
          setAccounts(normalizeAccounts(remote.accounts));
        if (remote.currentAccountId)
          setCurrentAccountId(remote.currentAccountId);
        if (remote.selectedGoalId)
          setSelectedGoalId(remote.selectedGoalId);
        if (remote.navOrder) setNavOrder(remote.navOrder);
        if (remote.homePage) {
          setHomePage(remote.homePage);
          setCurrentPage(remote.homePage);
        }
        if (remote.dashboardSectionsOrder)
          setDashboardSectionsOrder(remote.dashboardSectionsOrder);
      } catch (err) {
        console.error("Failed to apply remote user state", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

   // ---- Persist state to localStorage + Supabase on changes ----
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
    };

    // Still keep localStorage for offline cache
    saveStoredState(state);

    // Also push to Supabase if logged in
    if (user && user.id) {
      // If this change just came FROM Supabase, don't write it back
      if (applyingRemoteRef.current) {
        applyingRemoteRef.current = false;
        return;
      }

      saveUserState(user.id, state).catch((err) =>
        console.error("Failed to save user state to Supabase:", err)
      );

      saveUserState(user.id, state)
  .then(() => {
    setLastSavedAt(new Date().toLocaleTimeString());
  })
  .catch((err) =>
    console.error("Failed to save user state to Supabase:", err)
  );
    }
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
  ]);

  const totalIncome = sumAmounts(budget.incomeItems);
  const totalFixed = sumAmounts(budget.fixedExpenses);
  const totalVariable = sumAmounts(budget.variableExpenses);
  const leftoverForGoals = totalIncome - totalFixed - totalVariable;

  const selectedGoal =
    goals.find((g) => g.id === selectedGoalId) || null;

     // If not logged in, show the auth screen instead of the app
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

    return (
    <div className="min-h-screen bg-[#05060A] text-slate-100 flex flex-col">
      <header className="border-b border-[#1f2937] bg-[#05060F]">
        <div className="max-w-5xl mx-auto px-4 py-3 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col">
            <span className="text-xs tracking-[0.2em] text-cyan-300">
              BUDGET CENTER
            </span>
            <span className="text-sm text-slate-400">
              Dark cyber budgeting with themed goals
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
            {navOrder.map((pageKey) => (
              <NavButton
                key={pageKey}
                label={NAV_LABELS[pageKey] || pageKey}
                active={currentPage === pageKey}
                onClick={() => setCurrentPage(pageKey)}
              />
            ))}

            <ActionsMenu
              customizeMode={customizeMode}
              setCustomizeMode={setCustomizeMode}
              onReset={handleResetAllData}
              onSignOut={signOut}
            />
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-6">
        {customizeMode && (
          <CustomizationPanel
            navOrder={navOrder}
            setNavOrder={setNavOrder}
            homePage={homePage}
            setHomePage={(pageKey) => {
              setHomePage(pageKey);
              setCurrentPage(pageKey);
            }}
            dashboardSectionsOrder={dashboardSectionsOrder}
            setDashboardSectionsOrder={setDashboardSectionsOrder}
          />
        )}

        {currentPage === "dashboard" && (
          <Dashboard
            month={budget.month}
            income={totalIncome}
            fixed={totalFixed}
            variable={totalVariable}
            leftover={leftoverForGoals}
            goals={goals}
            transactions={transactions}
            currentAccountBalance={currentAccountBalance}
            totalBalance={totalBalance}
            sectionsOrder={dashboardSectionsOrder}
            onOpenGoal={(id) => {
              setSelectedGoalId(id);
              setCurrentPage("goalDetail");
            }}
            onTransactionsUpdate={handleImportedTransactions}
          />
        )}

        {currentPage === "balances" && (
          <BalancesDashboard
            accounts={accounts}
            currentAccountId={currentAccountId}
            onChangeCurrentAccount={setCurrentAccountId}
            onCreateAccount={handleCreateAccount}
            onDeleteAccount={handleDeleteAccount}
            onSetAccountBalance={(accountId, newBalance) => {
              setAccounts((prev) =>
                prev.map((acc) => {
                  if (acc.id !== accountId) return acc;
                  const net = computeNetTransactions(acc);
                  const startingBalance = newBalance - net;
                  return { ...acc, startingBalance };
                })
              );
            }}
            onRenameAccount={(accountId, newName) => {
              setAccounts((prev) =>
                prev.map((acc) =>
                  acc.id === accountId ? { ...acc, name: newName } : acc
                )
              );
            }}
          />
        )}

        {currentPage === "budget" && (
          <BudgetPage
            month={budget.month}
            budget={budget}
            totals={{
              income: totalIncome,
              fixed: totalFixed,
              variable: totalVariable,
              leftover: leftoverForGoals,
            }}
            onBudgetChange={(newBudget) => setBudget(newBudget)}
          />
        )}

        {currentPage === "transactions" && (
          <TransactionsPage
            transactions={transactions}
            onUpdateTransaction={handleEditTransaction}
            onDeleteTransaction={handleDeleteTransaction}
          />
        )}

        {currentPage === "goalDetail" && selectedGoal && (
          <GoalDetailPage goal={selectedGoal} />
        )}

        {currentPage === "goalDetail" && !selectedGoal && (
          <Card title="GOAL DETAILS">
            <p className="text-xs text-slate-400">
              No goals yet. Add a goal from the Dashboard to see details here.
            </p>
          </Card>
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
     {lastSavedAt && (
      <div className="text-[0.6rem] text-slate-500 text-right px-3 pb-2">
      Last cloud save: {lastSavedAt}
    </div>
  )}
    </div>
  );
}

    
// ----- Reusable UI Components -----
function NavButton({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full border text-xs transition
      ${
        active
          ? "border-cyan-400 bg-cyan-500/10 text-cyan-200"
          : "border-slate-600/60 text-slate-300 hover:border-cyan-400/60 hover:text-cyan-200"
      }`}
    >
      {label}
    </button>
  );
}

function ActionsMenu({ customizeMode, setCustomizeMode, onReset, onSignOut }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      {/* Toggle button with animated 3-bar icon */}
      <button
        type="button"
        className="flex items-center justify-center w-9 h-9 rounded-full border border-slate-600/70 text-slate-300 hover:border-cyan-400/60 hover:text-cyan-200 transition"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="relative flex flex-col justify-between w-4 h-3">
          {/* Top bar */}
          <span
            className={`h-[2px] rounded-full bg-current transition-transform duration-200 ${
              open ? "translate-y-[5px] rotate-45" : ""
            }`}
          />
          {/* Middle bar */}
          <span
            className={`h-[2px] rounded-full bg-current transition-opacity duration-200 ${
              open ? "opacity-0" : "opacity-100"
            }`}
          />
          {/* Bottom bar */}
          <span
            className={`h-[2px] rounded-full bg-current transition-transform duration-200 ${
              open ? "-translate-y-[5px] -rotate-45" : ""
            }`}
          />
        </span>
      </button>

      {/* Dropdown menu */}
      <div
        className={`absolute right-0 mt-2 w-44 bg-[#0B0C14] border border-slate-700/70 rounded-lg shadow-lg z-50 text-xs origin-top-right transform transition-all duration-150 ${
          open
            ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
            : "opacity-0 scale-95 -translate-y-1 pointer-events-none"
        }`}
      >
        {/* Customize Layout */}
        <button
          type="button"
          className="w-full text-left px-3 py-2 hover:bg-slate-800/80 text-slate-200"
          onClick={() => {
            setCustomizeMode((v) => !v);
            setOpen(false);
          }}
        >
          {customizeMode ? "Finish Customizing" : "Customize Layout"}
        </button>

        {/* Reset Data */}
        <button
          type="button"
          className="w-full text-left px-3 py-2 hover:bg-slate-800/80 text-rose-300"
          onClick={() => {
            setOpen(false);
            onReset();
          }}
        >
          Reset Data
        </button>

        {/* Sign Out */}
      <button
         type="button"
         className="w-full text-left px-3 py-2 hover:bg-slate-800/80 text-slate-200"
         onClick={async () => {
           setOpen(false);
           try {
             await onSignOut();   // ✅ wait for Supabase to finish
           } catch (err) {
             console.error("Sign out failed:", err);
             // optional: alert("Sign out failed. Try again.");
           }
         }}
       >
         Sign Out
       </button>
      </div>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <section className="bg-[#0B0C14] border border-slate-800/80 rounded-xl p-4 shadow-[0_0_20px_rgba(0,255,224,0.08)]">
      {title && (
        <h2 className="text-xs font-semibold tracking-[0.25em] text-slate-400 mb-3 uppercase">
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

function NeonProgressBar({ value }) {
  const clamped = Math.max(0, Math.min(100, value ?? 0));

  return (
    <div className="progress-bar">
      <div
        className="progress-bar-filled"
        style={{ width: `${clamped}%` }}
      >
        {clamped > 2 && (
          <div className="progress-shine shine" />
        )}
      </div>
    </div>
  );
}

function Toast({ message, variant = "info", actionLabel, onAction, onClose }) {
  const isSuccess = variant === "success";

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-xs sm:max-w-sm">
      <div
        className={`toast-enter flex items-start gap-3 rounded-xl border px-4 py-3 text-xs shadow-xl bg-[#05060F]/95 backdrop-blur
        ${
          isSuccess
            ? "border-emerald-400/80 text-emerald-100"
            : "border-cyan-400/80 text-cyan-100"
        }`}
      >
        {/* Icon */}
        <div className="mt-[2px] text-lg">
          {isSuccess ? "✅" : "ℹ️"}
        </div>

        {/* Content */}
        <div className="flex-1 space-y-1">
          <p className="leading-snug">{message}</p>

          {actionLabel && onAction && (
            <button
              onClick={onAction}
              className="inline-flex items-center gap-1 text-[0.7rem] mt-1 px-2 py-1 rounded-full border border-cyan-400/70 text-cyan-100 hover:bg-cyan-500/10 hover:border-cyan-300 transition"
            >
              <span>{actionLabel}</span>
              <span className="text-[0.75rem]">↗</span>
            </button>
          )}
        </div>

        {/* Close button */}
        {onClose && (
          <button
            className="ml-1 text-[0.7rem] text-slate-500 hover:text-slate-200"
            onClick={onClose}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

// ----- Dashboard -----
// ----- Dashboard -----
function Dashboard({
  month,
  income,
  fixed,
  variable,
  leftover,
  goals,
  transactions = [],
  onOpenGoal,
  onTransactionsUpdate = () => {},
  currentAccountBalance = 0,
  totalBalance = 0,
  sectionsOrder = DEFAULT_DASHBOARD_SECTIONS,
}) {
  const allocatedPercent =
    income > 0 ? ((income - leftover) / income) * 100 : 0;

  const order =
    sectionsOrder && sectionsOrder.length
      ? sectionsOrder
      : DEFAULT_DASHBOARD_SECTIONS;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-100">{month}</h1>
        <span className="text-xs text-slate-400">
          Overview of this month's money flow
        </span>
      </div>

      {/* Render sections in customizable order */}
      {order.map((sectionKey) => {
        switch (sectionKey) {
          case "monthOverview":
            return (
              <Card key="monthOverview" title="MONTH OVERVIEW">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <Stat label="Income" value={income} accent="text-emerald-300" />
                  <Stat label="Fixed" value={fixed} accent="text-rose-300" />
                  <Stat label="Variable" value={variable} accent="text-amber-300" />
                  <Stat label="Leftover" value={leftover} accent="text-cyan-300" />
                </div>

                <div className="mt-4">
                  <p className="text-xs text-slate-400 mb-1">
                    Allocation this month
                  </p>
                  <NeonProgressBar value={allocatedPercent} />
                </div>
              </Card>
            );

          case "accountSnapshot":
            return (
              <Card key="accountSnapshot" title="ACCOUNT SNAPSHOT">
                <div className="space-y-4 text-sm">
                  <div>
                    <div className="text-[0.65rem] uppercase tracking-[0.2em] text-slate-500">
                      Current account
                    </div>
                    <div className="mt-1 text-2xl font-semibold text-cyan-300">
                      ${currentAccountBalance.toFixed(2)}
                    </div>
                    <p className="mt-1 text-[0.7rem] text-slate-500">
                      Based on starting balance plus imported transactions.
                    </p>
                  </div>

                  <hr className="border-slate-800" />

                  <div>
                    <div className="text-[0.65rem] uppercase tracking-[0.2em] text-slate-500">
                      All accounts
                    </div>
                    <div className="mt-1 text-xl font-semibold text-emerald-300">
                      ${totalBalance.toFixed(2)}
                    </div>
                    <p className="mt-1 text-[0.7rem] text-slate-500">
                      Total estimated cash across all linked accounts.
                    </p>
                  </div>
                </div>
              </Card>
            );

          case "goals":
            return (
              <div key="goals" className="space-y-3">
                <h2 className="text-xs tracking-[0.25em] text-slate-400 uppercase">
                  Goals
                </h2>
                <div className="grid md:grid-cols-2 gap-3">
                  {goals.map((goal) => (
                    <GoalCard
                      key={goal.id}
                      goal={goal}
                      onClick={() => onOpenGoal(goal.id)}
                    />
                  ))}
                </div>
                <button className="mt-1 px-4 py-2 rounded-lg border border-cyan-400/70 text-xs text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 transition">
                  + Add Goal
                </button>
              </div>
            );

          case "csvImport":
            return (
              <Card key="csvImport" title="BANK STATEMENT IMPORT (CSV)">
                <BankImportCard
                  onTransactionsParsed={(rows) => onTransactionsUpdate(rows)}
                />
                <BankImportCard
                onTransactionsParsed={(payload) => onTransactionsUpdate(payload)}
                />

                {Array.isArray(transactions) && transactions.length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-xs uppercase tracking-[0.18em] text-slate-400 mb-2">
                      Parsed Transactions
                    </h3>
                    <div className="max-h-64 overflow-auto border border-slate-800 rounded-lg">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-900 text-slate-300">
                          <tr>
                            <th className="px-2 py-1">Date</th>
                            <th className="px-2 py-1">Description</th>
                            <th className="px-2 py-1">Category</th>
                            <th className="px-2 py-1 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                          {transactions.map((tx, idx) => (
                            <tr key={idx} className="hover:bg-slate-900/70">
                              <td className="px-2 py-1 text-slate-300">
                                {tx.date || "-"}
                              </td>
                              <td className="px-2 py-1 text-slate-200">
                                {tx.description || "-"}
                              </td>
                              <td className="px-2 py-1 text-slate-300">
                                {tx.category || "Other"}
                              </td>
                             <td
                            className={`px-2 py-1 text-right ${
                              typeof tx.amount === "number" && tx.amount < 0
                                ? "text-rose-300"
                                : "text-emerald-300"
                              }`}
                            >
                             {typeof tx.amount !== "number" || Number.isNaN(tx.amount)
                              ? "-"
                              : `$${tx.amount.toFixed(2)}`}
                            </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </Card>
            );

          default:
            return null;
        }
      })}
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className="flex flex-col">
      <span className="text-[0.65rem] uppercase tracking-[0.22em] text-slate-500">
        {label}
      </span>
      <span className={`text-base font-semibold ${accent}`}>
        ${value.toFixed(2)}
      </span>
    </div>
  );
}

function GoalCard({ goal, onClick }) {
  const progress = (goal.saved / goal.target) * 100;
  return (
    <button
      onClick={onClick}
      className="text-left bg-[#090a11] border border-slate-800 rounded-xl p-3 hover:border-cyan-400/70 hover:shadow-[0_0_18px_rgba(34,211,238,0.35)] transition"
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="text-lg">{goal.emoji}</span>
          <span className="text-sm font-medium text-slate-100">
            {goal.name}
          </span>
        </div>
        <span className="text-[0.7rem] text-slate-400">
          Plan: ${goal.monthlyPlan.toFixed(0)}/mo
        </span>
      </div>

      <div className="text-xs text-slate-400 mb-1">
        ${goal.saved.toFixed(0)} / ${goal.target.toFixed(0)}
      </div>
      <NeonProgressBar value={progress} />
    </button>
  );
}

function moveItem(array, index, direction) {
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= array.length) return array;
  const copy = [...array];
  const [item] = copy.splice(index, 1);
  copy.splice(newIndex, 0, item);
  return copy;
}

function CustomizationPanel({
  navOrder,
  setNavOrder,
  homePage,
  setHomePage,
  dashboardSectionsOrder,
  setDashboardSectionsOrder,
}) {
  const dashboardLabels = {
    monthOverview: "Month overview",
    accountSnapshot: "Account snapshot",
    goals: "Goals",
    csvImport: "Bank import + parsed transactions",
  };

  return (
    <Card title="LAYOUT & NAVIGATION">
      <div className="grid md:grid-cols-2 gap-4 text-xs">
        {/* Nav order */}
        <div>
          <h3 className="text-[0.7rem] uppercase tracking-[0.18em] text-slate-400 mb-2">
            Navigation buttons
          </h3>
          <p className="mb-2 text-slate-500">
            Reorder the top buttons and pick which page opens first.
          </p>
          <div className="space-y-1">
            {navOrder.map((key, index) => (
              <div
                key={key}
                className="flex items-center justify-between bg-[#05060F] border border-slate-700/70 rounded-lg px-2 py-1"
              >
                <div className="flex items-center gap-2">
                  <button
                    className="px-1 text-slate-500 hover:text-cyan-200"
                    onClick={() =>
                      setNavOrder((prev) =>
                        moveItem(prev, index, -1)
                      )
                    }
                  >
                    ↑
                  </button>
                  <button
                    className="px-1 text-slate-500 hover:text-cyan-200"
                    onClick={() =>
                      setNavOrder((prev) =>
                        moveItem(prev, index, 1)
                      )
                    }
                  >
                    ↓
                  </button>
                  <span className="text-slate-200">
                    {NAV_LABELS[key] || key}
                  </span>
                </div>
                <label className="flex items-center gap-1 text-[0.7rem] text-slate-400">
                  <input
                    type="radio"
                    className="accent-cyan-400"
                    checked={homePage === key}
                    onChange={() => setHomePage(key)}
                  />
                  Home
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* Dashboard sections */}
        <div>
          <h3 className="text-[0.7rem] uppercase tracking-[0.18em] text-slate-400 mb-2">
            Dashboard sections
          </h3>
          <p className="mb-2 text-slate-500">
            Drag-style reorder with arrows to decide what you see first on
            the Dashboard.
          </p>
          <div className="space-y-1">
            {dashboardSectionsOrder.map((key, index) => (
              <div
                key={key}
                className="flex items-center justify-between bg-[#05060F] border border-slate-700/70 rounded-lg px-2 py-1"
              >
                <div className="flex items-center gap-2">
                  <button
                    className="px-1 text-slate-500 hover:text-cyan-200"
                    onClick={() =>
                      setDashboardSectionsOrder((prev) =>
                        moveItem(prev, index, -1)
                      )
                    }
                  >
                    ↑
                  </button>
                  <button
                    className="px-1 text-slate-500 hover:text-cyan-200"
                    onClick={() =>
                      setDashboardSectionsOrder((prev) =>
                        moveItem(prev, index, 1)
                      )
                    }
                  >
                    ↓
                  </button>
                  <span className="text-slate-200">
                    {dashboardLabels[key] || key}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function BalancesDashboard({
  accounts = [],
  currentAccountId,
  onChangeCurrentAccount = () => {},
  onCreateAccount = () => {},
  onDeleteAccount = () => {},
  onSetAccountBalance,
  onRenameAccount = () => {},
}) {
  const rows = (accounts || []).map((acc) => {
    const starting =
      typeof acc.startingBalance === "number" ? acc.startingBalance : 0;
    const net = computeNetTransactions(acc);
    const balance = starting + net;
    return { ...acc, starting, net, balance };
  });

  const totalBalance = rows.reduce((sum, r) => sum + r.balance, 0);

  const currentRow =
    rows.find((r) => r.id === currentAccountId) || rows[0] || null;

  return (
    <div className="space-y-6">
      {/* Header + account controls */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">
            Accounts
          </h1>
          <span className="text-xs text-slate-400">
            Manage your accounts, balances, and estimated totals
          </span>
        </div>

        {/* Account selector + actions */}
        {accounts.length > 0 && (
          <div className="flex flex-col items-end gap-1">
            <span className="text-[0.6rem] uppercase tracking-[0.18em] text-slate-500">
              Current account
            </span>

            <div className="flex items-center gap-2">
              <select
                className="bg-[#05060F] border border-slate-700 text-xs rounded-md px-2 py-1 text-slate-100"
                value={currentAccountId}
                onChange={(e) => onChangeCurrentAccount(e.target.value)}
              >
                {accounts.map((acct) => (
                  <option key={acct.id} value={acct.id}>
                    {acct.name}
                  </option>
                ))}
              </select>

              {/* CREATE ACCOUNT BUTTON */}
              <button
                className="text-xs px-2 py-1 rounded-md border border-cyan-500/70 text-cyan-200 hover:bg-cyan-500/10 transition"
                onClick={onCreateAccount}
              >
                + New
              </button>

              {/* DELETE ACCOUNT BUTTON */}
              <button
                className="text-xs px-2 py-1 rounded-md border border-rose-500/70 text-rose-300 hover:bg-rose-500/10 transition"
                onClick={() => onDeleteAccount(currentAccountId)}
              >
                Delete
              </button>
            </div>

            {currentRow && (
              <div className="flex items-center gap-2 text-[0.7rem] text-slate-400">
                <span>
                  Balance:{" "}
                  <span className="text-cyan-300 font-semibold">
                    ${currentRow.balance.toFixed(2)}
                  </span>
                </span>
                <button
                  className="underline decoration-dotted hover:text-cyan-300"
                  onClick={() => {
                    const input = window.prompt(
                      `Set starting balance for "${currentRow.name}" (e.g. 1234.56):`,
                      currentRow.starting.toFixed(2)
                    );
                    if (input == null) return;
                    const value = Number(input);
                    if (Number.isNaN(value)) {
                      alert("That didn’t look like a number.");
                      return;
                    }
                    onSetAccountBalance(currentRow.id, value + currentRow.net);
                  }}
                >
                  Set starting balance
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Total card */}
      <Card title="TOTAL ESTIMATED CASH">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[0.7rem] uppercase tracking-[0.2em] text-slate-500">
              Across all accounts
            </div>
            <div className="mt-1 text-3xl font-semibold text-cyan-300">
              ${totalBalance.toFixed(2)}
            </div>
          </div>
        </div>
        {rows.length > 0 && (
          <div className="mt-4">
            <NeonProgressBar value={100} />
            <p className="mt-1 text-[0.7rem] text-slate-500">
              Based on starting balances + imported transactions.
            </p>
          </div>
        )}
        {rows.length === 0 && (
          <p className="mt-2 text-xs text-slate-400">
            No accounts yet. Add one to start tracking.
          </p>
        )}
      </Card>

      {/* Account cards */}
      {rows.length > 0 && (
        <>
          <h2 className="text-xs tracking-[0.25em] text-slate-400 uppercase">
            Accounts
          </h2>

          <div className="grid md:grid-cols-2 gap-4">
            {rows.map((row) => {
              const share =
                totalBalance > 0
                  ? Math.max(0, Math.min(100, (row.balance / totalBalance) * 100))
                  : 0;

              const isCurrent = row.id === currentAccountId;

              return (
                <section
                  key={row.id}
                  className={`bg-[#090a11] border rounded-xl p-4 transition cursor-pointer ${
                    isCurrent
                      ? "border-cyan-400/80 shadow-[0_0_18px_rgba(34,211,238,0.45)]"
                      : "border-slate-800 hover:border-cyan-400/70 hover:shadow-[0_0_18px_rgba(34,211,238,0.35)]"
                  }`}
                  onClick={() => onChangeCurrentAccount(row.id)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="text-[0.65rem] uppercase tracking-[0.2em] text-slate-500">
                        {row.type || "checking"}
                      </div>
                      <input
                        className="mt-0.5 bg-transparent border-b border-slate-700 text-sm font-medium text-slate-100 focus:outline-none focus:border-cyan-400"
                        value={row.name}
                        onChange={(e) =>
                          onRenameAccount(row.id, e.target.value)
                        }
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>

                    <div className="text-right">
                      <div className="text-[0.65rem] uppercase tracking-[0.2em] text-slate-500">
                        Balance
                      </div>
                      <div className="text-lg font-semibold text-cyan-300">
                        ${row.balance.toFixed(2)}
                      </div>
                    </div>
                  </div>

                  <div className="text-[0.7rem] text-slate-400 mb-2">
                    <span className="mr-3">
                      Start:{" "}
                      <span className="text-slate-200">
                        ${row.starting.toFixed(2)}
                      </span>
                    </span>
                    <span>
                      Net tx:{" "}
                      <span
                        className={
                          row.net < 0 ? "text-rose-300" : "text-emerald-300"
                        }
                      >
                        {row.net < 0 ? "-" : ""}
                        ${Math.abs(row.net).toFixed(2)}
                      </span>
                    </span>
                  </div>

                  <NeonProgressBar value={share} />
                  <div className="mt-1 flex justify-between items-center text-[0.7rem] text-slate-500">
                    <span>{share.toFixed(1)}% of total cash</span>
                    <button
                      className="text-cyan-300 underline decoration-dotted hover:text-cyan-200"
                      onClick={(e) => {
                        e.stopPropagation();
                        const input = window.prompt(
                          `Set current balance for "${row.name}" (e.g. 1234.56):`,
                          row.balance.toFixed(2)
                        );
                        if (input == null) return;
                        const value = Number(input);
                        if (Number.isNaN(value)) {
                          alert("That didn't look like a number.");
                          return;
                        }
                        onSetAccountBalance(row.id, value);
                      }}
                    >
                      Set estimated balance
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      </>
    )}
  </div>
);
}


// ----- Budget Page -----
function BudgetPage({ month, budget, totals, onBudgetChange }) {
  function handleAddItem(sectionKey) {
    const name = window.prompt(`New ${sectionKey} item name:`);
    if (!name) return;

    const amountInput = window.prompt(
      `Amount for "${name}" (numbers only):`
    );
    const amount = Number(amountInput);
    if (isNaN(amount)) {
      alert("That didn't look like a valid number.");
      return;
    }

    const updatedSection = [...budget[sectionKey], { name, amount }];
    const updatedBudget = { ...budget, [sectionKey]: updatedSection };
    onBudgetChange(updatedBudget);
  }

  function handleDeleteItem(sectionKey, index) {
    if (!window.confirm("Delete this item?")) return;

    const updatedSection = budget[sectionKey].filter((_, i) => i !== index);
    const updatedBudget = { ...budget, [sectionKey]: updatedSection };
    onBudgetChange(updatedBudget);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-100">
          {month} Budget
        </h1>
        <span className="text-xs text-slate-400">
          Income → Expenses → Goals
        </span>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card title="INCOME">
          <ListWithTotal
            items={budget.incomeItems}
            total={totals.income}
            onDelete={(index) =>
              handleDeleteItem("incomeItems", index)
            }
          />
          <button
            className="mt-3 px-3 py-1.5 text-xs rounded-md border border-emerald-400/70 text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/20 transition"
            onClick={() => handleAddItem("incomeItems")}
          >
            + Add Income Item
          </button>
        </Card>

        <Card title="FIXED EXPENSES">
          <ListWithTotal
            items={budget.fixedExpenses}
            total={totals.fixed}
            onDelete={(index) =>
              handleDeleteItem("fixedExpenses", index)
            }
          />
          <button
            className="mt-3 px-3 py-1.5 text-xs rounded-md border border-rose-400/70 text-rose-200 bg-rose-500/10 hover:bg-rose-500/20 transition"
            onClick={() => handleAddItem("fixedExpenses")}
          >
            + Add Fixed Expense
          </button>
        </Card>

        <Card title="VARIABLE SPENDING">
          <ListWithTotal
            items={budget.variableExpenses}
            total={totals.variable}
            onDelete={(index) =>
              handleDeleteItem("variableExpenses", index)
            }
          />
          <button
            className="mt-3 px-3 py-1.5 text-xs rounded-md border border-amber-400/70 text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 transition"
            onClick={() => handleAddItem("variableExpenses")}
          >
            + Add Variable Expense
          </button>
        </Card>

        <Card title="REMAINING FOR GOALS">
          <div className="text-2xl font-semibold text-cyan-300">
            ${totals.leftover.toFixed(2)}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            This is what's left after income minus all listed expenses.
          </p>

          <button className="mt-3 px-3 py-1.5 text-xs rounded-md border border-cyan-400/70 text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 transition">
            Edit Budget (coming soon)
          </button>
        </Card>
      </div>
    </div>
  );
}

function ListWithTotal({ items, total, onDelete }) {
  return (
    <div className="space-y-2 text-sm">
      {items.map((item, index) => (
        <div
          key={item.name + index}
          className="flex items-center justify-between text-slate-200 gap-2"
        >
          <div className="flex-1 flex justify-between">
            <span>{item.name}</span>
            <span className="text-slate-300">
              ${item.amount.toFixed(2)}
            </span>
          </div>
          {onDelete && (
            <button
              className="text-[0.65rem] text-slate-500 hover:text-rose-400"
              onClick={() => onDelete(index)}
            >
              ✕
            </button>
          )}
        </div>
      ))}
      <div className="mt-2 pt-2 border-t border-slate-700 flex items-center justify-between text-xs">
        <span className="uppercase tracking-[0.18em] text-slate-500">
          Total
        </span>
        <span className="text-slate-100">${total.toFixed(2)}</span>
      </div>
    </div>
  );
}
// ----- Transactions Page -----
function TransactionsPage({
  transactions = [],
  onUpdateTransaction = () => {},
  onDeleteTransaction = () => {},
}) {
  const hasData = Array.isArray(transactions) && transactions.length > 0;

  // --- FILTER STATE ---
  const [filters, setFilters] = useState({
    query: "",
    minAmount: "",
    maxAmount: "",
  });

  // --- SORT STATE ---
  const [sortBy, setSortBy] = useState("date");       // "date" | "amount" | "description" | "category"
  const [sortDirection, setSortDirection] = useState("desc"); // "asc" | "desc"

  const handleFilterChange = (field) => (event) => {
    setFilters((prev) => ({
      ...prev,
      [field]: event.target.value,
    }));
  };

  const handleClearFilters = () => {
    setFilters({
      query: "",
      minAmount: "",
      maxAmount: "",
    });
  };

  const hasActiveFilter =
    filters.query || filters.minAmount || filters.maxAmount;

  const toggleSortDirection = () => {
    setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
  };

  // --- APPLY FILTERS + SORT ---
  const rowsToRender = useMemo(() => {
    if (!hasData) return [];

    // First: attach original index so edits/deletes still map correctly
    const withIndex = transactions.map((tx, index) => ({ tx, index }));

    // Filter
    const filtered = withIndex.filter(({ tx }) => {
      const q = filters.query.trim().toLowerCase();
      const amountNum = Number(tx.amount);

      // Text search (description + category)
      if (q) {
        const haystack = [
          tx.description || "",
          tx.category || "",
        ]
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(q)) return false;
      }

      // Min amount
      if (filters.minAmount !== "") {
        const min = Number(filters.minAmount);
        if (!Number.isNaN(min) && !Number.isNaN(amountNum)) {
          if (amountNum < min) return false;
        }
      }

      // Max amount
      if (filters.maxAmount !== "") {
        const max = Number(filters.maxAmount);
        if (!Number.isNaN(max) && !Number.isNaN(amountNum)) {
          if (amountNum > max) return false;
        }
      }

      return true;
    });

    // Sort
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

      // Default: date
      const aDate = Date.parse(A.date) || 0;
      const bDate = Date.parse(B.date) || 0;
      return (aDate - bDate) * dir;
    });

    return sorted;
  }, [transactions, filters, sortBy, sortDirection, hasData]);

  return (
    <div className="space-y-4 w-full">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">
            Transactions
          </h1>
          <span className="text-xs text-slate-400">
            Imported from your bank CSV files
          </span>
        </div>

        {hasData && (
          <span className="text-[0.65rem] text-slate-500">
            Showing {rowsToRender.length} of {transactions.length}
          </span>
        )}
      </header>

      <Card title="ALL TRANSACTIONS">
        {/* Empty state */}
        {!hasData && (
          <p className="text-xs text-slate-400">
            No transactions yet. Import a CSV on the Dashboard to see them
            here.
          </p>
        )}

        {/* FILTER BAR */}
        {hasData && (
          <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            {/* Left side: search */}
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

            {/* Right side: amount + clear */}
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-end">
              <div className="flex gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[0.65rem] uppercase tracking-[0.18em] text-slate-500">
                    Min Amount
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
                    Max Amount
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
        )}

        {/* SORT BAR */}
        {hasData && (
          <div className="mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2 text-[0.7rem]">
            <div className="flex items-center gap-2">
              <span className="uppercase tracking-[0.18em] text-slate-500">
                Sort by
              </span>
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
        )}

        {/* No matches state */}
        {hasData && rowsToRender.length === 0 && (
          <p className="text-xs text-slate-400">
            No transactions match your current filters.
          </p>
        )}

        {/* TABLE */}
        {hasData && rowsToRender.length > 0 && (
          // horizontal scroll on very small screens
          <div className="w-full overflow-x-auto">
            {/* vertical scroll inside, with max height based on viewport */}
            <div className="min-w-[640px] max-h-[65vh] overflow-y-auto border border-slate-800 rounded-lg">
              <table className="w-full text-[0.7rem] sm:text-xs text-left">
                <thead className="bg-slate-900 text-slate-300 sticky top-0">
                  <tr>
                    <th className="px-2 py-1">Date</th>
                    <th className="px-2 py-1">Description</th>
                    <th className="px-2 py-1">Category</th>
                    <th className="px-2 py-1 text-right">Amount</th>
                    <th className="px-2 py-1 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {rowsToRender.map(({ tx, index }) => (
                    <tr key={index} className="hover:bg-slate-900/70">
                      {/* Date (read-only for now) */}
                      <td className="px-2 py-1 text-slate-300 whitespace-nowrap">
                        {tx.date || "-"}
                      </td>

                      {/* Editable description */}
                      <td className="px-2 py-1 text-slate-200">
                        <input
                          className="w-full bg-transparent border-b border-slate-700 focus:outline-none focus:border-cyan-400 text-[0.7rem] sm:text-xs"
                          value={tx.description || ""}
                          onChange={(e) =>
                            onUpdateTransaction(index, {
                              description: e.target.value,
                            })
                          }
                        />
                      </td>

                      {/* Editable category */}
                      <td className="px-2 py-1 text-slate-300">
                        <input
                          className="w-full bg-transparent border-b border-slate-700 focus:outline-none focus:border-cyan-400 text-[0.7rem] sm:text-xs"
                          value={tx.category || ""}
                          onChange={(e) =>
                            onUpdateTransaction(index, {
                              category: e.target.value,
                            })
                          }
                        />
                      </td>

                      {/* Amount (read-only for now) */}
                      <td
                        className={`px-2 py-1 text-right whitespace-nowrap ${
                          tx.amount < 0 ? "text-rose-300" : "text-emerald-300"
                        }`}
                      >
                        {isNaN(tx.amount)
                          ? "-"
                          : `$${tx.amount.toFixed(2)}`}
                      </td>

                      {/* Delete button */}
                      <td className="px-2 py-1 text-right">
                        <button
                          className="text-[0.7rem] px-2 py-1 rounded-md border border-rose-500/60 text-rose-300 hover:bg-rose-400/10"
                          onClick={() => {
                            if (
                              window.confirm(
                                "Delete this transaction from this account?"
                              )
                            ) {
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
    </div>
  );
}

// ----- Goal Detail Page -----
function GoalDetailPage({ goal }) {
  const progress = (goal.saved / goal.target) * 100;

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{goal.emoji}</span>
          <h1 className="text-xl font-semibold text-slate-100">
            {goal.name}
          </h1>
        </div>
        <p className="text-xs text-slate-400">
          Personalized goal view – future: themed backgrounds & animations.
        </p>
      </header>

      <Card title="PROGRESS">
        <div className="flex flex-col gap-2 text-sm">
          <span className="text-slate-200">
            ${goal.saved.toFixed(2)} / ${goal.target.toFixed(2)}
          </span>
          <NeonProgressBar value={progress} />
          <span className="text-xs text-slate-400">
            {progress.toFixed(1)}% complete
          </span>
        </div>
      </Card>

      <Card title="PLAN">
        <p className="text-sm text-slate-200">
          Recommended monthly contribution:
          <span className="ml-1 text-cyan-300 font-semibold">
            ${goal.monthlyPlan.toFixed(2)}
          </span>
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Later we'll calculate this based on your income, expenses and due
          date.
        </p>

        <div className="mt-3 flex gap-2">
          <button className="px-3 py-1.5 text-xs rounded-md border border-pink-400/70 text-pink-200 bg-pink-500/10 hover:bg-pink-500/20 transition">
            Add Contribution
          </button>
          <button className="px-3 py-1.5 text-xs rounded-md border border-slate-600 text-slate-200 hover:border-slate-400 transition">
            Edit Goal
          </button>
        </div>
      </Card>
    </div>
  );
}

function BankImportCard({ onTransactionsParsed = () => {} }) {
  const [status, setStatus] = React.useState(null);
  const [error, setError] = React.useState(null);

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus("Reading file...");
    setError(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target?.result || "";
        const rows = parseCsvToTransactions(text);
        if (!rows.length) {
          setError("No valid rows with amounts were found in this file.");
          setStatus(null);
          return;
        }

        onTransactionsParsed(rows);
        setStatus(`Imported ${rows.length} transactions.`);
      } catch (err) {
        console.error("CSV parse error:", err);
        setError("We couldn't understand this CSV. Try a different export format.");
        setStatus(null);
      }
    };
    reader.onerror = () => {
      setError("Could not read the file.");
      setStatus(null);
    };

    reader.readAsText(file);
  }

  return (
    <div className="space-y-3 text-xs">
      <p className="text-slate-400">
        Upload a <span className="font-mono text-slate-200">.csv</span> bank
        statement. We'll try to detect date, description, and amount.
      </p>

      <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-cyan-500/70 text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 cursor-pointer transition">
        <span>Choose CSV file</span>
        <input
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleFileChange}
        />
      </label>

      {status && <p className="text-emerald-300">{status}</p>}
      {error && <p className="text-rose-300">{error}</p>}

      <p className="text-[0.7rem] text-slate-500">
        Tip: Most banks let you export recent transactions as CSV from their
        website.
      </p>
    </div>
  );
}

/**
 * Very generic CSV → { date, description, amount }[]
 * Tries multiple common header names and skips rows without a numeric amount.
 */
function parseCsvToTransactions(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (!lines.length) return [];

  const headerLine = lines[0];
  const headerCells = splitCsvLine(headerLine).map((h) =>
    h.trim().toLowerCase()
  );

  const findIndex = (candidates) =>
    headerCells.findIndex((h) =>
      candidates.some((c) => h.includes(c.toLowerCase()))
    );

  const dateIdx = findIndex(["date", "posted", "transaction date"]);
  const descIdx = findIndex(["description", "memo", "details", "payee"]);
  const amountIdx = findIndex(["amount", "amt"]);
  const debitIdx = findIndex(["debit", "withdrawal", "charge"]);
  const creditIdx = findIndex(["credit", "deposit", "payment"]);

  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    if (cells.every((c) => !c || !c.trim())) continue;

    const date =
      dateIdx >= 0 && cells[dateIdx] ? cells[dateIdx].trim() : "";

    const description =
      descIdx >= 0 && cells[descIdx]
        ? cells[descIdx].trim()
        : "Transaction";

    let amount = null;

    // 1) Single "Amount" column
    if (amountIdx >= 0 && cells[amountIdx]) {
      amount = parseAmountCell(cells[amountIdx]);
    } else {
      // 2) Separate debit / credit columns
      const debitVal =
        debitIdx >= 0 && cells[debitIdx]
          ? parseAmountCell(cells[debitIdx])
          : null;
      const creditVal =
        creditIdx >= 0 && cells[creditIdx]
          ? parseAmountCell(cells[creditIdx])
          : null;

      if (debitVal !== null && !Number.isNaN(debitVal)) {
        amount = -Math.abs(debitVal); // money going out
      } else if (creditVal !== null && !Number.isNaN(creditVal)) {
        amount = Math.abs(creditVal); // money coming in
      }
    }

    // If we still don't have a real number, skip this row
    if (typeof amount !== "number" || Number.isNaN(amount)) {
      continue;
    }

    rows.push({
      date,
      description,
      category: "Other",
      amount,
    });
  }

  return rows;
}

function splitCsvLine(line) {
  // super-simple CSV splitter that respects quotes
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseAmountCell(cell) {
  if (cell === null || cell === undefined) return NaN;
  let cleaned = String(cell).trim();

  // remove quotes
  cleaned = cleaned.replace(/"/g, "");

  // handle parentheses for negatives: (123.45) => -123.45
  let negative = false;
  if (cleaned.startsWith("(") && cleaned.endsWith(")")) {
    negative = true;
    cleaned = cleaned.slice(1, -1);
  }

  // strip $ and commas
  cleaned = cleaned.replace(/[$,]/g, "");

  if (cleaned === "") return NaN;

  const num = Number(cleaned);
  if (Number.isNaN(num)) return NaN;
  return negative ? -num : num;
}

function categorizeTransaction(description, amount) {
  const text = (description || "").toLowerCase();

  if (amount > 0) {
    // Money coming in
    if (text.includes("payroll") || text.includes("direct deposit")) {
      return "Income – Paycheck";
    }
    if (text.includes("refund") || text.includes("rebate")) {
      return "Income – Refund";
    }
    return "Income – Other";
  }

  // Money going out (expenses)
  if (text.includes("uber") || text.includes("lyft") || text.includes("taxi")) {
    return "Transport – Rideshare";
  }
  if (
    text.includes("shell") ||
    text.includes("chevron") ||
    text.includes("exxon") ||
    text.includes("gas") ||
    text.includes("fuel")
  ) {
    return "Transport – Gas";
  }
  if (
    text.includes("walmart") ||
    text.includes("costco") ||
    text.includes("grocery") ||
    text.includes("smith") ||
    text.includes("kroger")
  ) {
    return "Groceries";
  }
  if (
    text.includes("starbucks") ||
    text.includes("coffee") ||
    text.includes("mcdonald") ||
    text.includes("taco bell") ||
    text.includes("restaurant") ||
    text.includes("cafe")
  ) {
    return "Food & Dining";
  }
  if (
    text.includes("netflix") ||
    text.includes("spotify") ||
    text.includes("hulu") ||
    text.includes("disney") ||
    text.includes("subscription") ||
    text.includes("prime")
  ) {
    return "Subscriptions";
  }
  if (
    text.includes("rent") ||
    text.includes("landlord") ||
    text.includes("mortgage")
  ) {
    return "Housing – Rent/Mortgage";
  }
  if (
    text.includes("power") ||
    text.includes("electric") ||
    text.includes("water") ||
    text.includes("utility") ||
    text.includes("utilities")
  ) {
    return "Utilities";
  }
  if (text.includes("gym") || text.includes("fitness")) {
    return "Health & Fitness";
  }
  if (
    text.includes("insurance") ||
    text.includes("geico") ||
    text.includes("allstate")
  ) {
    return "Insurance";
  }
  if (
    text.includes("amazon") ||
    text.includes("target") ||
    text.includes("best buy") ||
    text.includes("shop")
  ) {
    return "Shopping";
  }

  return "Other";
}

const HEADER_ALIASES = {
  date: [
    "date",
    "transaction date",
    "posted date",
    "posting date",
    "trans date",
  ],
  description: [
    "description",
    "details",
    "memo",
    "payee",
    "transaction description",
    "narrative",
  ],
  debit: ["debit", "withdrawal", "outflow", "money out", "charge"],
  credit: [
    "credit",
    "deposit",
    "inflow",
    "money in",
    "payment",
    "credit amount",
  ],
  amount: ["amount", "amt", "transaction amount", "value"],
};

function normalizeHeaderRow(line) {
  const parts = splitCsvLine(line).map((h) => h.trim());
  return parts.map((cell) => {
    let h = cell.toLowerCase().replace(/"/g, "");
    h = h.replace(/\s+/g, " ").trim();
    return h;
  });
}

function findHeaderIndex(header, aliases) {
  return header.findIndex((h) => aliases.includes(h));
}

function parseCsvTransactions(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return [];

  // First non-empty line is the header
  const header = normalizeHeaderRow(lines[0]);

  const dateIndex = findHeaderIndex(header, HEADER_ALIASES.date);
  const descIndex = findHeaderIndex(header, HEADER_ALIASES.description);
  const amountIndex = findHeaderIndex(header, HEADER_ALIASES.amount);
  const debitIndex = findHeaderIndex(header, HEADER_ALIASES.debit);
  const creditIndex = findHeaderIndex(header, HEADER_ALIASES.credit);

  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    const cols = splitCsvLine(raw).map((c) => c.trim());

    if (cols.length === 0 || cols.every((c) => c === "")) continue;

    const date = dateIndex >= 0 ? cols[dateIndex] : "";
    const description = descIndex >= 0 ? cols[descIndex] : "";

    let amount = NaN;

    if (amountIndex >= 0) {
      // Single Amount column (your file does this)
      amount = parseAmountCell(cols[amountIndex]);
    } else if (debitIndex >= 0 || creditIndex >= 0) {
      // Separate Debit/Credit columns
      const debit =
        debitIndex >= 0 ? parseAmountCell(cols[debitIndex]) : 0;
      const credit =
        creditIndex >= 0 ? parseAmountCell(cols[creditIndex]) : 0;
      // Convention: money in = +, money out = -
      amount = credit - debit;
    }

    // Skip totally empty rows
    if (!date && !description && isNaN(amount)) continue;

    const category = categorizeTransaction(description, amount);

    rows.push({
      date,
      description,
      amount,
      category,
    });
  }

    return rows;
  }

export default App;