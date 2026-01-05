// src/App.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

import { useFirebaseAuth } from "./FirebaseAuthProvider.jsx";
import { saveWorkspaceState, loadWorkspaceState } from "./workspaceStateApi.js";
import { db } from "./firebaseClient.js";
import { doc, onSnapshot, deleteDoc } from "firebase/firestore";
import {
  loadOrCreateUserProfile,
  updateUserProfile,
} from "./userProfileApi.firebase.js";

// Components
import NavButton from "./components/NavButton.jsx";
import ActionsMenu from "./components/ActionsMenu.jsx";
import AuthScreen from "./components/AuthScreen.jsx";
import Toast from "./components/Toast.jsx";
import ProfileMenu from "./components/ProfileMenu.jsx";

// Pages
import Dashboard from "./pages/Dashboard.jsx";
import BalancesDashboard from "./pages/BalancesDashboard.jsx";
import BudgetPage from "./pages/BudgetPage.jsx";
import TransactionsPage from "./pages/TransactionsPage.jsx";
import GoalDetailPage from "./pages/GoalDetailPage.jsx";
import ReportsPage from "./pages/ReportsPage.jsx";

// Libs
import {
  STORAGE_KEY,
  loadStoredState,
  saveStoredState,
  monthKeyFromISO,
  monthLabelFromKey,
} from "./lib/storage.js"; // <— adjust path if your helpers live elsewhere

function safeMonthKey() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function clampNumber(n, fallback = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? x : fallback;
}

const DEFAULT_STATE = {
  monthKey: safeMonthKey(),

  // budgets keyed by "YYYY-MM"
  budgetsByMonth: {
    // "2026-01": { estimatedIncome: 0, fixed: [], variable: [], goals: [], transactions: [], ... }
  },

  // global (optional)
  accounts: [{ id: "main", name: "Main", balance: 0 }],
  currentAccountId: "main",

  // recurring schedule
  scheduledTemplates: [],
  scheduleChecks: {},

  // goals etc
  goals: [],
  currentGoalId: null,

  // nav
  currentPage: "dashboard", // dashboard | balances | budget | transactions | goal | reports
};

export default function App() {
  const { user, workspaceId, signOut } = useFirebaseAuth();

  const [toast, setToast] = useState(null);

  // ---------
  // Local state (persists to Firestore + localStorage)
  // ---------
  const [appState, setAppState] = useState(() => {
    // Prefer localStorage immediately for fast boot
    const stored = loadStoredState(STORAGE_KEY);
    return stored ? { ...DEFAULT_STATE, ...stored } : DEFAULT_STATE;
  });

  const savingRef = useRef(false);

  // ---------
  // Sync workspace state from Firestore (source of truth when signed in)
  // ---------
  useEffect(() => {
    if (!user || !workspaceId) return;

    const ref = doc(db, "workspaces", workspaceId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const remote = snap.exists() ? snap.data()?.state : null;
        if (!remote) return;

        // Merge remote into current defaults to avoid missing keys
        setAppState((prev) => ({ ...DEFAULT_STATE, ...prev, ...remote }));
      },
      (err) => {
        console.error("onSnapshot(workspace) failed", err);
        setToast({ kind: "error", message: "Failed to sync workspace." });
      }
    );

    return () => unsub();
  }, [user, workspaceId]);

  // ---------
  // Persist state to localStorage always
  // ---------
  useEffect(() => {
    saveStoredState(STORAGE_KEY, appState);
  }, [appState]);

  // ---------
  // Persist state to Firestore (debounced-ish)
  // ---------
  useEffect(() => {
    if (!user || !workspaceId) return;
    if (savingRef.current) return;

    savingRef.current = true;
    const t = setTimeout(async () => {
      try {
        await saveWorkspaceState(workspaceId, appState);
      } catch (e) {
        console.error("saveWorkspaceState failed", e);
      } finally {
        savingRef.current = false;
      }
    }, 450);

    return () => clearTimeout(t);
  }, [appState, user, workspaceId]);

  // ---------
  // User profile (optional)
  // ---------
  useEffect(() => {
    if (!user) return;
    loadOrCreateUserProfile(user.uid).catch((e) => {
      console.error("loadOrCreateUserProfile failed", e);
    });
  }, [user]);

  // ---------
  // Derived state helpers
  // ---------
  const monthKey = appState.monthKey || safeMonthKey();
  const monthLabel = useMemo(() => {
    try {
      return monthLabelFromKey ? monthLabelFromKey(monthKey) : monthKey;
    } catch {
      return monthKey;
    }
  }, [monthKey]);

  const budget = useMemo(() => {
    const b = appState.budgetsByMonth?.[monthKey];
    return b
      ? b
      : {
          estimatedIncome: 0,
          useActualIncome: false,
          fixed: [],
          variable: [],
          goals: [],
          transactions: [],
        };
  }, [appState.budgetsByMonth, monthKey]);

  const transactions = Array.isArray(budget?.transactions) ? budget.transactions : [];
  const accounts = Array.isArray(appState.accounts) ? appState.accounts : [];
  const currentAccountId = appState.currentAccountId || "main";

  // Totals for BudgetPage
  const totals = useMemo(() => {
    const fixed = (Array.isArray(budget.fixed) ? budget.fixed : []).reduce(
      (sum, i) => sum + clampNumber(i?.amount),
      0
    );
    const variable = (Array.isArray(budget.variable) ? budget.variable : []).reduce(
      (sum, i) => sum + clampNumber(i?.amount),
      0
    );
    return { fixedTotal: fixed, variableTotal: variable, fixed, variable };
  }, [budget.fixed, budget.variable]);

  // ---------
  // Mutators
  // ---------
  function setMonthKey(nextKey) {
    setAppState((prev) => ({ ...prev, monthKey: nextKey }));
  }

  function updateBudget(nextBudget) {
    setAppState((prev) => ({
      ...prev,
      budgetsByMonth: {
        ...(prev.budgetsByMonth || {}),
        [monthKey]: nextBudget,
      },
    }));
  }

  function addTransaction(tx) {
    const nextTx = {
      id: `tx-${Date.now()}`,
      description: String(tx?.description || "").trim() || "Transaction",
      amount: clampNumber(tx?.amount),
      date: String(tx?.date || "").slice(0, 10),
      category: String(tx?.category || ""),
      accountId: tx?.accountId || currentAccountId || "main",
      flowType: tx?.flowType || undefined,
    };

    const nextBudget = {
      ...budget,
      transactions: [...transactions, nextTx],
    };
    updateBudget(nextBudget);
    setToast({ kind: "success", message: "Transaction added." });
  }

  function updateScheduledTemplates(nextTemplates) {
    setAppState((prev) => ({ ...prev, scheduledTemplates: nextTemplates }));
  }

  function updateScheduleChecks(nextChecks) {
    setAppState((prev) => ({ ...prev, scheduleChecks: nextChecks }));
  }

  function setCurrentPage(page) {
    setAppState((prev) => ({ ...prev, currentPage: page }));
  }

  function openGoal(goalId) {
    setAppState((prev) => ({ ...prev, currentGoalId: goalId, currentPage: "goal" }));
  }

  // ---------
  // Auth gate
  // ---------
  if (!user) {
    return <AuthScreen />;
  }

  // ---------
  // Page switch
  // ---------
  const page = appState.currentPage || "dashboard";

  return (
    <div className="app-shell">
      {/* Top bar */}
      <header className="app-header">
        <div className="left">
          <div className="brand">
            <div className="title">FlowMetrics Budget</div>
            <div className="subtitle">{monthLabel}</div>
          </div>
        </div>

        <div className="right">
          <ActionsMenu
            monthKey={monthKey}
            onSetMonthKey={setMonthKey}
            onToast={setToast}
          />
          <ProfileMenu
            user={user}
            onSignOut={signOut}
            onUpdateProfile={(patch) => updateUserProfile(user.uid, patch)}
          />
        </div>
      </header>

      {/* Nav */}
      <nav className="app-nav">
        <NavButton active={page === "dashboard"} onClick={() => setCurrentPage("dashboard")}>
          Dashboard
        </NavButton>
        <NavButton active={page === "balances"} onClick={() => setCurrentPage("balances")}>
          Balances
        </NavButton>
        <NavButton active={page === "budget"} onClick={() => setCurrentPage("budget")}>
          Budget
        </NavButton>
        <NavButton active={page === "transactions"} onClick={() => setCurrentPage("transactions")}>
          Transactions
        </NavButton>
        <NavButton active={page === "reports"} onClick={() => setCurrentPage("reports")}>
          Reports
        </NavButton>
      </nav>

      {/* Main */}
      <main className="app-main">
        {page === "dashboard" && (
          <Dashboard
            month={monthLabel}
            income={clampNumber(budget?.estimatedIncome ?? budget?.income)}
            fixed={totals.fixedTotal}
            variable={totals.variableTotal}
            leftover={clampNumber(budget?.estimatedIncome ?? budget?.income) - totals.fixedTotal - totals.variableTotal}
            goals={Array.isArray(appState.goals) ? appState.goals : []}
            transactions={transactions}
            accounts={accounts}
            currentAccountId={currentAccountId}
            onChangeCurrentAccount={(id) =>
              setAppState((prev) => ({ ...prev, currentAccountId: id }))
            }
            onOpenGoal={openGoal}
            onTransactionsUpdate={(nextTx) =>
              updateBudget({ ...budget, transactions: nextTx })
            }
            currentAccountBalance={0}
            totalBalance={0}
            sectionsOrder={budget?.sectionsOrder}
          />
        )}

        {page === "balances" && (
          <BalancesDashboard
            accounts={accounts}
            currentAccountId={currentAccountId}
            onChangeCurrentAccount={(id) =>
              setAppState((prev) => ({ ...prev, currentAccountId: id }))
            }
            transactions={transactions}
          />
        )}

        {page === "budget" && (
          <BudgetPage
            month={monthLabel}
            budget={budget}
            totals={totals}
            onBudgetChange={updateBudget}
            scheduledTemplates={appState.scheduledTemplates || []}
            scheduleChecks={appState.scheduleChecks || {}}
            onScheduledTemplatesChange={updateScheduledTemplates}
            onScheduleChecksChange={updateScheduleChecks}
            accounts={accounts}
            currentAccountId={currentAccountId}
            onAddTransaction={addTransaction}
          />
        )}

        {page === "transactions" && (
          <TransactionsPage
            month={monthLabel}
            transactions={transactions}
            accounts={accounts}
            currentAccountId={currentAccountId}
            onChangeCurrentAccount={(id) =>
              setAppState((prev) => ({ ...prev, currentAccountId: id }))
            }
            onTransactionsChange={(nextTx) => updateBudget({ ...budget, transactions: nextTx })}
            onAddTransaction={addTransaction}
          />
        )}

        {page === "goal" && (
          <GoalDetailPage
            goalId={appState.currentGoalId}
            goals={Array.isArray(appState.goals) ? appState.goals : []}
            onBack={() => setCurrentPage("dashboard")}
            onUpdateGoals={(nextGoals) => setAppState((prev) => ({ ...prev, goals: nextGoals }))}
          />
        )}

        {page === "reports" && (
          <ReportsPage
            monthKey={monthKey}
            month={monthLabel}
            budget={budget}
            transactions={transactions}
            accounts={accounts}
          />
        )}
      </main>

      {/* Toast */}
      {toast && (
        <Toast kind={toast.kind} message={toast.message} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
