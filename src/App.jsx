// src/App.jsx
import React, { useState, useEffect, useMemo, useRef } from "react";
import "./App.css";

import { useFirebaseAuth } from "./FirebaseAuthProvider.jsx";
import { loadWorkspaceState, saveWorkspaceState } from "./workspaceStateApi.js";
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
import GoalEditorModal from "./components/GoalEditorModal.jsx";
import ContributionModal from "./components/ContributionModal.jsx";
import InstallPWAButton from "./components/InstallPWAButton.jsx";

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
  migrateStoredState,
} from "./lib/storage.js";
import {
  sumAmounts,
  normalizeAccounts,
} from "./lib/accounts.js";
import { getThemeConfig } from "./themeConfig.js";

/* ---------------- Navigation ---------------- */

const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "balances", label: "Accounts" },
  { key: "budget", label: "Budget" },
  { key: "transactions", label: "Transactions" },
  { key: "goalDetail", label: "Goals" },
  { key: "reports", label: "Reports" },
];

const NAV_LABELS = Object.fromEntries(NAV_ITEMS.map((n) => [n.key, n.label]));

const DEFAULT_DASHBOARD_SECTIONS = [
  "monthOverview",
  "accountSnapshot",
  "goals",
  "csvImport",
];

function getCurrentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function App() {
  const {
    user,
    authLoading,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    resetPassword,
  } = useFirebaseAuth();

  const activeWorkspaceId = user?.uid || null;
  const applyingRemoteRef = useRef(false);
  const saveTimeoutRef = useRef(null);
  const initialStoredRef = useRef(null);

  if (initialStoredRef.current === null) {
    initialStoredRef.current = migrateStoredState(loadStoredState());
  }
  const stored = initialStoredRef.current;

  /* -------- State -------- */
  const [theme, setTheme] = useState(stored?.theme || "dark");
  const [budgetsByMonth, setBudgetsByMonth] = useState(
    stored?.budgetsByMonth || {}
  );
  const [activeMonth, setActiveMonth] = useState(
    stored?.activeMonth || getCurrentMonthKey()
  );
  const [goals, setGoals] = useState(stored?.goals || []);
  const [accounts, setAccounts] = useState(
    normalizeAccounts(stored?.accounts || [])
  );
  const [currentAccountId, setCurrentAccountId] = useState(
    stored?.currentAccountId || "main"
  );
  const [navOrder, setNavOrder] = useState(
    stored?.navOrder || NAV_ITEMS.map((n) => n.key)
  );
  // Ensure navOrder always has default tabs
  useEffect(() => {
    if (!Array.isArray(navOrder) || navOrder.length === 0) {
      setNavOrder(NAV_ITEMS.map((n) => n.key));
    }
  }, [navOrder]);

  const [homePage, setHomePage] = useState(stored?.homePage || "dashboard");
  const [dashboardSectionsOrder, setDashboardSectionsOrder] = useState(
    stored?.dashboardSectionsOrder || DEFAULT_DASHBOARD_SECTIONS
  );
  const [currentPage, setCurrentPage] = useState(homePage);
  const [selectedGoalId, setSelectedGoalId] = useState(
    stored?.selectedGoalId || null
  );
  const [txFilter, setTxFilter] = useState(stored?.txFilter || "");
  const [toast, setToast] = useState(null);
  const [lastSavedAt, setLastSavedAt] = useState(null);

  const [userProfile, setUserProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);

  /* -------- Derived -------- */
  const activeBudget =
    budgetsByMonth[activeMonth] || { month: activeMonth, income: 0 };
  const totals = useMemo(() => {
    const fixed = sumAmounts(activeBudget.fixed || []);
    const variable = sumAmounts(activeBudget.variable || []);
    return { fixed, variable, leftover: activeBudget.income - fixed - variable };
  }, [activeBudget]);

  const themeStyles = useMemo(() => getThemeConfig(theme), [theme]);

  /* -------- Profile -------- */
  useEffect(() => {
    if (!user?.uid) return;
    setProfileLoading(true);
    loadOrCreateUserProfile(user)
      .then(setUserProfile)
      .finally(() => setProfileLoading(false));
  }, [user?.uid]);

  /* -------- Realtime Firestore sync -------- */
  useEffect(() => {
    if (!activeWorkspaceId) return;
    const ref = doc(db, "workspaces", activeWorkspaceId);
    const unsub = onSnapshot(ref, (snap) => {
      const remote = snap.data()?.state;
      if (!remote) return;
      applyingRemoteRef.current = true;
      setBudgetsByMonth(remote.budgetsByMonth || {});
      setActiveMonth(remote.activeMonth || activeMonth);
      setGoals(remote.goals || []);
      setAccounts(normalizeAccounts(remote.accounts || []));
      setCurrentAccountId(remote.currentAccountId || "main");
      setNavOrder(remote.navOrder || navOrder);
      setDashboardSectionsOrder(
        remote.dashboardSectionsOrder || DEFAULT_DASHBOARD_SECTIONS
      );
      setTheme(remote.theme || "dark");
    });
    return () => unsub();
  }, [activeWorkspaceId]);

  /* -------- Initial Firestore load -------- */
  useEffect(() => {
    if (!activeWorkspaceId) return;
    loadWorkspaceState(activeWorkspaceId).then((remote) => {
      if (remote) {
        applyingRemoteRef.current = true;
        setBudgetsByMonth(remote.budgetsByMonth || {});
        setActiveMonth(remote.activeMonth || activeMonth);
        setGoals(remote.goals || []);
        setAccounts(normalizeAccounts(remote.accounts || []));
      }
    });
  }, [activeWorkspaceId]);

  /* -------- Persist -------- */
  useEffect(() => {
    const state = {
      budgetsByMonth,
      activeMonth,
      goals,
      accounts,
      currentAccountId,
      navOrder,
      homePage,
      dashboardSectionsOrder,
      theme,
      txFilter,
    };
    saveStoredState(state);
    if (!activeWorkspaceId) return;
    if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false;
      return;
    }
    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveWorkspaceState(activeWorkspaceId, state).then(() =>
        setLastSavedAt(new Date().toLocaleTimeString())
      );
    }, 600);
  }, [
    activeWorkspaceId,
    budgetsByMonth,
    activeMonth,
    goals,
    accounts,
    currentAccountId,
    navOrder,
    homePage,
    dashboardSectionsOrder,
    theme,
    txFilter,
  ]);

  /* -------- Reset -------- */
  async function handleResetAllData() {
    if (!window.confirm("Reset all data?")) return;
    if (activeWorkspaceId) {
      await deleteDoc(doc(db, "workspaces", activeWorkspaceId));
    }
    localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  }

  /* -------- Auth gate -------- */
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

  /* -------- UI -------- */
  return (
    <div className={`app-shell ${themeStyles.shellClass}`}>
      {/* HEADER */}
      <header className={themeStyles.headerClass}>
        <div className="content flex justify-between items-center">
          <div className="flex items-center gap-4">
            <span>BUDGET CENTER</span>
            {navOrder.map((pageKey) => (
              <NavButton
                key={pageKey}
                label={NAV_LABELS[pageKey]}
                active={currentPage === pageKey}
                onClick={() => setCurrentPage(pageKey)}
              />
            ))}
          </div>
          <ProfileMenu
            profile={userProfile}
            email={user.email}
            loading={profileLoading}
            onUpdateProfile={(p) =>
              updateUserProfile(user.uid, p).then(setUserProfile)
            }
          />
          <ActionsMenu
            onReset={handleResetAllData}
            onSignOut={signOut}
            themeValue={theme}
            onChangeTheme={setTheme}
          />
        </div>
      </header>

      {/* MAIN */}
      <main className="content">
        {currentPage === "dashboard" && (
          <Dashboard
            month={activeMonth}
            income={activeBudget.income}
            fixed={totals.fixed}
            variable={totals.variable}
            leftover={totals.leftover}
            goals={goals}
            accounts={accounts}
            currentAccountId={currentAccountId}
            onChangeCurrentAccount={setCurrentAccountId}
          />
        )}
      {currentPage === "balances" && (
    <BalancesDashboard
      accounts={accounts}
      currentAccountId={currentAccountId}
      onChangeCurrentAccount={setCurrentAccountId}
      onAccountsChange={setAccounts}   // use whatever prop your page expects
    />
  )}

  {currentPage === "budget" && (
    <BudgetPage
      month={activeMonth}
      budget={activeBudget}
      totals={totals}
      budgetsByMonth={budgetsByMonth}
      onBudgetChange={(nextBudget) =>
       setBudgetsByMonth((prev) => ({ ...prev, 
  [activeMonth]: nextBudget }))
      } 
    />
  )}

  {currentPage === "transactions" && (
    <TransactionsPage
      accounts={accounts}
      currentAccountId={currentAccountId}
      transactions={activeBudget.transactions || []} // adjust if your tx live elsewhere
      filter={txFilter}
      onFilterChange={setTxFilter}
      onUpdateBudget={(nextBudget) =>
        setBudgetsByMonth((prev) => ({ ...prev, [activeMonth]: nextBudget }))
      }
    />
  )}

  {currentPage === "goalDetail" && (
    <GoalDetailPage
      goals={goals}
      selectedGoalId={selectedGoalId}
      onSelectGoal={setSelectedGoalId}
      onGoalsChange={setGoals}
    />
  )}

  {currentPage === "reports" && (
    <ReportsPage
      budgetsByMonth={budgetsByMonth}
      accounts={accounts}
      goals={goals}
      theme={theme}
    />
  )}
</main>

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  );
}

export default App;
