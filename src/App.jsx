// src/App.jsx - Enhanced with workspace sharing & version history
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

import { useFirebaseAuth } from "./FirebaseAuthProvider.jsx";
import { 
  saveWorkspaceState, 
  loadWorkspaceState, 
  initializeWorkspace,
  getWorkspaceHistory,
  restoreWorkspaceVersion 
} from "./workspaceStateApi.js";
import { 
  getUserWorkspaces,
  getUserRole,
  updateMemberActivity 
} from "./workspaceSharingApi.js";
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
import WorkspaceManager from "./components/WorkspaceManager.jsx";

// Pages
import Dashboard from "./pages/Dashboard.jsx";
import BalancesDashboard from "./pages/BalancesDashboard.jsx";
import BudgetPage from "./pages/BudgetPage.jsx";
import TransactionsPage from "./pages/TransactionsPage.jsx";
import GoalDetailPage from "./pages/GoalDetailPage.jsx";
import ReportsPage from "./pages/ReportsPage.jsx";

// Libs
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
  budgetsByMonth: {},
  accounts: [{ id: "main", name: "Main Account", type: "checking" }],
  currentAccountId: "main",
  scheduledTemplates: [],
  scheduleChecks: {},
  goals: [],
  currentGoalId: null,
  currentPage: "dashboard",
};

export default function App() {
  const { user, authLoading, signInWithEmail, signUpWithEmail, signOut, resetPassword } = useFirebaseAuth();
  const [toast, setToast] = useState(null);
  const [showWorkspaceManager, setShowWorkspaceManager] = useState(false);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState(null);
  const [userWorkspaces, setUserWorkspaces] = useState([]);
  const [userRole, setUserRole] = useState(null);

  const [appState, setAppState] = useState(() => {
    const stored = migrateStoredState(loadStoredState());
    return stored ? { ...DEFAULT_STATE, ...stored } : DEFAULT_STATE;
  });

  const savingRef = useRef(false);
  const initialSyncDone = useRef(false);

  // Save to localStorage
  useEffect(() => {
    saveStoredState(appState);
  }, [appState]);

  // Initialize workspace on first login
  useEffect(() => {
    if (!user || initialSyncDone.current) return;

    async function init() {
      try {
        // Load user's workspaces
        const workspaces = await getUserWorkspaces(user.uid);
        setUserWorkspaces(workspaces);

        // Use first workspace or create new one
        const workspaceId = workspaces.length > 0 ? workspaces[0].id : user.uid;
        setCurrentWorkspaceId(workspaceId);

        // Get user role
        const role = await getUserRole(workspaceId, user.uid);
        setUserRole(role);

        // Initialize workspace with smart merging
        const merged = await initializeWorkspace(workspaceId, appState);
        if (merged) {
          setAppState(merged);
        }

        initialSyncDone.current = true;
      } catch (error) {
        console.error("Failed to initialize workspace:", error);
        setToast({ kind: "error", message: "Failed to load workspace" });
      }
    }

    init();
  }, [user]);

  // Real-time sync from Firestore
  useEffect(() => {
    if (!user || !currentWorkspaceId) return;

    const ref = doc(db, "workspaces", currentWorkspaceId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const remote = snap.exists() ? snap.data()?.state : null;
        if (!remote) return;

        setAppState((prev) => {
          // Merge remote changes with local state
          return {
            ...DEFAULT_STATE,
            ...prev,
            ...migrateStoredState(remote),
          };
        });
      },
      (err) => {
        console.error("onSnapshot(workspace) failed", err);
        setToast({ kind: "error", message: "Failed to sync workspace." });
      }
    );

    return () => unsub();
  }, [user, currentWorkspaceId]);

  // Persist to Firestore (debounced)
  useEffect(() => {
    if (!user || !currentWorkspaceId) return;
    if (savingRef.current) return;

    savingRef.current = true;
    const t = setTimeout(async () => {
      try {
        await saveWorkspaceState(currentWorkspaceId, appState);
        // Update user activity
        await updateMemberActivity(currentWorkspaceId, user.uid);
      } catch (e) {
        console.error("saveWorkspaceState failed", e);
      } finally {
        savingRef.current = false;
      }
    }, 450);

    return () => clearTimeout(t);
  }, [appState, user, currentWorkspaceId]);

  // Ensure user profile exists
  useEffect(() => {
    if (!user) return;
    loadOrCreateUserProfile(user.uid).catch((e) => {
      console.error("loadOrCreateUserProfile failed", e);
    });
  }, [user]);

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

  // Show auth screen if not logged in
  if (!user) {
    return (
      <AuthScreen
        onSignIn={signInWithEmail}
        onSignUp={signUpWithEmail}
        onResetPassword={resetPassword}
        loading={authLoading}
      />
    );
  }

  const page = appState.currentPage || "dashboard";

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="content headerRow">
          <div className="brandAndNav">
            <div className="appTitle">
              FlowMetrics Budget <span style={{ opacity: 0.6 }}>·</span>{" "}
              <span style={{ opacity: 0.85 }}>{monthLabel}</span>
            </div>

            <nav className="navRow" aria-label="Primary navigation">
              <NavButton active={page === "dashboard"} onClick={() => setCurrentPage("dashboard")}>
                Dashboard
              </NavButton>
              <NavButton active={page === "balances"} onClick={() => setCurrentPage("balances")}>
                Balances
              </NavButton>
              <NavButton active={page === "budget"} onClick={() => setCurrentPage("budget")}>
                Budget
              </NavButton>
              <NavButton
                active={page === "transactions"}
                onClick={() => setCurrentPage("transactions")}
              >
                Transactions
              </NavButton>
              <NavButton active={page === "reports"} onClick={() => setCurrentPage("reports")}>
                Reports
              </NavButton>
            </nav>
          </div>

          <div className="headerRight">
            <ActionsMenu 
              monthKey={monthKey} 
              onSetMonthKey={setMonthKey} 
              onToast={setToast}
              onOpenWorkspaceManager={() => setShowWorkspaceManager(true)}
            />
            <ProfileMenu
              user={user}
              onSignOut={signOut}
              onUpdateProfile={(patch) => updateUserProfile(user.uid, patch)}
            />
          </div>
        </div>
      </header>

      <main className="app-main">
        <div className="content">
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
        </div>
      </main>

      {showWorkspaceManager && (
        <WorkspaceManager
          workspaceId={currentWorkspaceId}
          currentUserId={user.uid}
          onClose={() => setShowWorkspaceManager(false)}
        />
      )}

      {toast && <Toast kind={toast.kind} message={toast.message} onClose={() => setToast(null)} />}
    </div>
  );
}