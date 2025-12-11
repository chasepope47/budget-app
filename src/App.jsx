import React, { useState, useEffect, useRef } from "react";
import "./App.css";

import { useSupabaseAuth } from "./SupabaseAuthProvider.jsx";
import { loadUserState, saveUserState } from "./userStateApi.js";
import { supabase } from "./supabaseClient";

// Components
import NavButton from "./components/NavButton.jsx";
import ActionsMenu from "./components/ActionsMenu.jsx";
import Toast from "./components/Toast.jsx";
import CustomizationPanel from "./components/CustomizationPanel.jsx";

// Lib
import { sumAmounts, computeNetTransactions, normalizeAccounts, importTransactionsWithDetection,} from "./lib/accounts.js";

// Pages
import Dashboard from "./pages/Dashboard.jsx";
import BalancesDashboard from "./pages/BalancesPage.jsx";
import BudgetPage from "./pages/BudgetPage.jsx";
import TransactionsPage from "./pages/TransactionsPage.jsx";
import GoalDetailPage from "./pages/GoalDetailPage.jsx";

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

// ----- Helpers -----
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

// ----- Empty Defaults -----
const EMPTY_BUDGET = {
  month: "January 2026",
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

// ----- Auth Screen -----
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
    setInfo(null);
    setSubmitting(true);

    try {
      if (mode === "signin") {
        await onSignIn(email, password);
      } else {
        // SIGN UP FLOW
        const result = await onSignUp(email, password);
        const user = result?.user || null;
        const session = result?.session || null;

        if (user && !session) {
          setInfo(
            "Account created! Check your email and click the confirmation link. " +
              "After that, this page will automatically log you in."
          );
        } else {
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

  // NEW: profile + theme + realtime flags
  const [profile, setProfile] = useState(null);
  const [theme, setTheme] = useState(() => {
    const rawStored = loadStoredState();
    return rawStored?.theme || "dark";
  });

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

  const [currentPage, setCurrentPage] = useState(
    stored?.homePage || "dashboard"
  );

  const [selectedGoalId, setSelectedGoalId] = useState(
    stored?.selectedGoalId || (stored?.goals?.[0]?.id ?? null)
  );

  const [toast, setToast] = useState(null);

  // Current account + transactions
  const currentAccount =
    accounts.find((acc) => acc.id === currentAccountId) || accounts[0];
  const transactions = currentAccount ? currentAccount.transactions || [] : [];

    function applyRemoteState(remote) {
    if (!remote) return;
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
      if (remote.theme) setTheme(remote.theme);
    } catch (err) {
      console.error("Failed to apply remote user state", err);
    }
  }

  // --- Transaction editing ---
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

  // --- Account management ---
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
    if (accounts.length <= 1) {
      window.alert(
        "You need at least one account. Create another one before deleting this."
      );
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

    const remaining = accounts.filter((a) => a.id !== accountId);
    setAccounts(remaining);

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

      // Reset React state
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

  // --- Balances ---
  const accountStarting =
    currentAccount && typeof currentAccount.startingBalance === "number"
      ? currentAccount.startingBalance
      : 0;

  const accountNet = computeNetTransactions(currentAccount);
  const accountBalance = accountStarting + accountNet;

  const accountRows = (accounts || []).map((acc) => {
    const starting =
      typeof acc.startingBalance === "number" ? acc.startingBalance : 0;
    const net = computeNetTransactions(acc);
    const balance = starting + net;
    return { id: acc.id, name: acc.name, balance };
  });

  const totalBalance = accountRows.reduce((sum, row) => sum + row.balance, 0);

  const currentAccountBalance =
    accountRows.find((row) => row.id === currentAccountId)?.balance ?? 0;

  // --- CSV import with automatic account detection ---
 function handleImportedTransactions(payload) {
  const { rows, sourceName = "" } = payload || {};
  if (!Array.isArray(rows) || rows.length === 0) return;

  const result = importTransactionsWithDetection(
    accounts,
    currentAccountId,
    rows,
    sourceName
  );

  setAccounts(result.accounts);

  if (result.targetAccountId && result.targetAccountId !== currentAccountId) {
    setCurrentAccountId(result.targetAccountId);
  }

  const toastId = Date.now();
  const message = result.createdNew
    ? `New account detected and created: "${result.targetAccountName}".`
    : `Imported transactions into "${result.targetAccountName}".`;

  setToast({
    id: toastId,
    variant: result.createdNew ? "success" : "info",
    message,
    accountId: result.targetAccountId || null,
    createdNew: result.createdNew,
  });

  setTimeout(() => {
    setToast((current) =>
      current && current.id === toastId ? null : current
    );
  }, 4000);
}


  // ---- Realtime subscription: keep state in sync across devices ----
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
          console.log("🔄️ Realtime update received:", payload);
          const remote = payload.new?.state;
          if (!remote) return;

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

  // ---- Initial load: pull saved cloud state once after login ----
  useEffect(() => {
    if (!user || !user.id) return;

    let cancelled = false;

    (async () => {
      const remote = await loadUserState(user.id);
      if (!remote || cancelled) return;

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

    // Local storage cache
    saveStoredState(state);

    if (user && user.id) {
      if (applyingRemoteRef.current) {
        applyingRemoteRef.current = false;
        return;
      }

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
            navLabels={NAV_LABELS}
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
            accounts={accounts}
            currentAccountId={currentAccountId}
            onChangeCurrentAccount={setCurrentAccountId}
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
          <div>
            <p className="text-xs text-slate-400">
              No goals yet. Add a goal from the Dashboard to see details here.
            </p>
          </div>
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

export default App;
