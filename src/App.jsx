// src/App.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

import { useFirebaseAuth } from "./FirebaseAuthProvider.jsx";
import { saveWorkspaceState, loadWorkspaceState } from "./workspaceStateApi.js";
import { db } from "./firebaseClient.js";
import { doc, onSnapshot } from "firebase/firestore";
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

// Libs (matches your updated src/lib/storage.js)
import {
  loadStoredState,
  saveStoredState,
  migrateStoredState,
  monthLabelFromKey,
} from "./lib/storage.js";

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

  // Budgets keyed by "YYYY-MM"
  budgetsByMonth: {},

  // Accounts
  accounts: [{ id: "main", name: "Main Account", type: "checking" }],
  currentAccountId: "main",

  // Schedule
  scheduledTemplates: [],
  scheduleChecks: {},

  // Goals
  goals: [],
  currentGoalId: null,

  // Nav
  currentPage: "dashboard", // dashboard | balances | budget | transactions | goal | reports
};

export default function App() {
  const { user, workspaceId, signOut } = useFirebaseAuth();

  const [toast, setToast] = useState(null);

  // ---- Load initial state from localStorage (fast boot) ----
  const [appState, setAppState] = useState(() => {
    const stored = migrateStoredState(loadStoredState());
    return stored ? { ...DEFAULT_STATE, ...stored } : DEFAULT_STATE;
  });

  // Prevent saving loops
  const savingRef = useRef(false);

  // ---- Keep localStorage updated ----
  useEffect(() => {
    saveStoredState(appState);
  }, [appState]);

  // ---- Firestore workspace sync (when signed in) ----
  useEffect(() => {
    if (!user || !workspaceId) return;

    const ref = doc(db, "workspaces", workspaceId);

    const unsub = onSnapshot(
      ref,
      (snap) => {
        const remote = snap.exists() ? snap.data()?.state : null;
        if (!remote) return;

        setAppState((prev) => ({
          ...DEFAULT_STATE,
          ...prev,
          ...migrateStoredState(remote),
        }));
      },
      (err) => {
        console.error("onSnapshot(workspace) failed", err);
        setToast({ kind: "error", message: "Failed to sync workspace." });
      }
    );

    return () => unsub();
  }, [user, workspaceId]);

  // ---- Persist to Firestore (debounced) ----
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

  // ---- Ensure user profile exists ----
  useEffect(() => {
    if (!user) return;
    loadOrCreateUserProfile(user.uid).catch((e) => {
      console.error("loadOrCreateUserProfile failed", e);
    });
  }, [user]);

  // ---- Derived ----
  const monthKey = appState.monthKey || safeMonthKey();
  const monthLabel = useMemo(() => monthLabelFromKey(monthKey), [monthKey]);

  const budget = useMemo(() => {
    const b = appState.budgetsByMonth?.[monthKey];
    return (
      b || {
        estimatedIncome: 0,
        useActualIncome: false,
        fixed: [],
        variable: [],
        goals: [],
        transactions: [],
      }
    );
  }, [appState.budgetsByMonth, monthKey]);

  const transactions = Array.isArray(budget?.transactions) ? budget.transactions : [];
  const accounts = Array.isArray(appState.accounts) ? appState.accounts : [];
  const currentAccountId = appState.currentAccountId || "main";

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

  // ---- Mutators ----
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

    updateBudget({
      ...budget,
      transactions: [...transactions, nextTx],
    });

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
    setAppState((prev) => ({
      ...prev,
      currentGoalId: goalId,
      currentPage: "goal",
    }));
  }

  // ---- Auth gate ----
  if (!user) return <AuthScreen />;

  // ---- Render ----
  const page = appState.currentPage || "dashboard";

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="left">
          <div className="brand">
            <div className="title">FlowMetrics Budget</div>
            <div className="subtitle">{monthLabel}</div>
          </div>
        </div>

        <div className="right">
          <ActionsMenu monthKey={monthKey} onSetMonthKey={setMonthKey} onToast={setToast} />
          <ProfileMenu
            user={user}
            onSignOut={signOut}
            onUpdateProfile={(patch) => updateUserProfile(user.uid, patch)}
          />
        </div>
      </header>

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

      <main className="app-main">
        {page === "dashboard" && (
          <Dashboard
            month={monthLabel}
            income={clampNumber(budget?.estimatedIncome ?? budget?.income)}
            fixed={totals.fixedTotal}
            variable={totals.variableTotal}
            leftover={
              clampNumber(budget?.estimatedIncome ?? budget?.income) -
              totals.fixedTotal -
              totals.variableTotal
            }
            goals={Array.isArray(appState.goals) ? appState.goals : []}
            transactions={transactions}
            accounts={accounts}
            currentAccountId={currentAccountId}
            onChangeCurrentAccount={(id) =>
              setAppState((prev) => ({ ...prev, currentAccountId: id }))
            }
            onOpenGoal={openGoal}
            onTransactionsUpdate={(nextTx) => updateBudget({ ...budget, transactions: nextTx })}
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
            onUpdateGoals={(nextGoals) =>
              setAppState((prev) => ({
                ...prev,
                goals: nextGoals,
              }))
            }
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

      {toast && <Toast kind={toast.kind} message={toast.message} onClose={() => setToast(null)} />}
    </div>
  );
}
