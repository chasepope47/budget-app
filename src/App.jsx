// src/App.jsx
import React, { useState, useEffect, useMemo, useRef } from "react";
import "./App.css";

import { useFirebaseAuth } from "./FirebaseAuthProvider.jsx";
import { saveWorkspaceState } from "./workspaceStateApi.js";
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
  migrateStoredState,
} from "./lib/storage.js";
import {
  sumAmounts,
  normalizeAccounts,
  importTransactionsWithDetection,
  mergeTransactions,
  computeAccountBalance,
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

  function makeId(prefix = "id") {
    if (typeof crypto !== "undefined" && crypto.randomUUID)
      return crypto.randomUUID();
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function mergeDedupTx(prevTx = [], nextTx = []) {
    const seen = new Set(
      prevTx.map((t) => `${t.date}|${t.amount}|${t.description}|${t.accountId}`)
    );
    const merged = [...prevTx];

    for (const t of nextTx) {
      const sig = `${t.date}|${t.amount}|${t.description}|${t.accountId}`;
      if (!seen.has(sig)) {
        seen.add(sig);
        merged.push(t);
      }
    }
    return merged;
  }

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
  const [homePage, setHomePage] = useState(stored?.homePage || "dashboard");
  const [dashboardSectionsOrder, setDashboardSectionsOrder] = useState(
    stored?.dashboardSectionsOrder || DEFAULT_DASHBOARD_SECTIONS
  );
  const [currentPage, setCurrentPage] = useState(
    stored?.homePage || "dashboard"
  );

  // ✅ goal selection + mode
  const [selectedGoalId, setSelectedGoalId] = useState(
    stored?.selectedGoalId || null
  );
  const [goalMode, setGoalMode] = useState(null); // null | "create" | "edit"

  const [txFilter, setTxFilter] = useState(stored?.txFilter || "");
  const [toast, setToast] = useState(null);
  const [lastSavedAt, setLastSavedAt] = useState(null);

  const [userProfile, setUserProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // Ensure navOrder always has default tabs
  useEffect(() => {
    if (!Array.isArray(navOrder) || navOrder.length === 0) {
      setNavOrder(NAV_ITEMS.map((n) => n.key));
    }
  }, [navOrder]);

  /* -------- Derived -------- */
  const activeBudget = budgetsByMonth[activeMonth] || {
    month: activeMonth,
    income: 0,
  };

  const totals = useMemo(() => {
    const fixed = sumAmounts(activeBudget.fixed || []);
    const variable = sumAmounts(activeBudget.variable || []);
    return { fixed, variable, leftover: activeBudget.income - fixed - variable };
  }, [activeBudget]);

  const themeStyles = useMemo(() => getThemeConfig(theme), [theme]);

  const { currentAccountBalance, totalBalance } = useMemo(() => {
    const list = Array.isArray(accounts) ? accounts : [];
    const current = list.find((a) => a.id === currentAccountId);

    const currentBalance = computeAccountBalance(current);
    const total = list.reduce((sum, acc) => sum + computeAccountBalance(acc), 0);

    return { currentAccountBalance: currentBalance, totalBalance: total };
  }, [accounts, currentAccountId]);

  // Keep current account id valid after syncs or deletions
  useEffect(() => {
    const list = Array.isArray(accounts) ? accounts : [];
    if (list.length === 0) return;
    const hasCurrent = list.some((a) => a.id === currentAccountId);
    if (!hasCurrent) setCurrentAccountId(list[0].id);
  }, [accounts, currentAccountId]);

  /* -------- Profile -------- */
  useEffect(() => {
    if (!user?.uid) return;
    setProfileLoading(true);
    loadOrCreateUserProfile(user)
      .then(setUserProfile)
      .finally(() => setProfileLoading(false));
  }, [user?.uid]);

  /* -------- Remote sync (firebase) -------- */
  useEffect(() => {
    if (!activeWorkspaceId) return;

    const ref = doc(db, "workspaces", activeWorkspaceId);
    const unsub = onSnapshot(ref, (snap) => {
      const remote = snap.data()?.state;
      if (!remote) return;

      applyingRemoteRef.current = true;

      setBudgetsByMonth(remote.budgetsByMonth || {});
      setActiveMonth(remote.activeMonth || getCurrentMonthKey());
      setGoals(remote.goals || []);
      setAccounts(normalizeAccounts(remote.accounts || []));
      setCurrentAccountId(remote.currentAccountId || "main");
      setNavOrder(remote.navOrder || NAV_ITEMS.map((n) => n.key));
      setDashboardSectionsOrder(
        remote.dashboardSectionsOrder || DEFAULT_DASHBOARD_SECTIONS
      );
      setTheme(remote.theme || "dark");
      setTxFilter(remote.txFilter || "");
      setHomePage(remote.homePage || "dashboard");
      setSelectedGoalId(remote.selectedGoalId || null);
      // goalMode intentionally NOT synced (UI-only)
    });

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId]);

  /* -------- Persist (debounced) -------- */
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
      selectedGoalId, // ✅ persist selection
    };

    saveStoredState(state);

    if (!activeWorkspaceId) return;

    if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false;
      return;
    }

    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveWorkspaceState(activeWorkspaceId, state)
        .then(() => setLastSavedAt(new Date().toLocaleTimeString()))
        .catch((err) => {
          console.error("Sync save failed", err);
          setToast({
            message: "Sync to cloud failed. Check your connection/Firebase rules.",
            variant: "info",
          });
        });
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
    selectedGoalId,
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

  /* -------- Transactions import -------- */
  function makeTxId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID)
      return crypto.randomUUID();
    return `tx-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function safeArray(v) {
    return Array.isArray(v) ? v : [];
  }

  function handleImportedTransactions(rows = [], meta = {}) {
    const parsedRows = safeArray(rows)
      .map((r) => {
        const amount =
          typeof r.amount === "number" ? r.amount : Number(r.amount);
        return {
          id: r.id || makeTxId(),
          date: r.date || "",
          description: r.description || "",
          category: r.category || "",
          amount: Number.isFinite(amount) ? amount : NaN,
        };
      })
      .filter((r) => Number.isFinite(r.amount));

    if (!parsedRows.length) {
      setToast({
        message: "No valid transactions were found in that file.",
        variant: "info",
      });
      return;
    }

    const sourceName =
      meta.bank ||
      meta.detectedBank ||
      meta.filename ||
      meta.fileName ||
      "Imported";

    const detection = importTransactionsWithDetection(
      accounts,
      currentAccountId,
      parsedRows,
      sourceName
    );

    const targetAccountId = detection.targetAccountId;
    const targetAccountName =
      detection.targetAccountName || sourceName || "Imported Account";

    const rowsWithAccount = parsedRows.map((tx) => ({
      ...tx,
      accountId: targetAccountId,
    }));

    const nextAccounts = (() => {
      const list = Array.isArray(accounts) ? accounts : [];
      const exists = list.some((a) => a.id === targetAccountId);

      if (detection.createdNew || !exists) {
        const newAccount = {
          id: targetAccountId,
          name: targetAccountName,
          type:
            detection.accounts?.find((a) => a.id === targetAccountId)?.type ||
            "checking",
          startingBalance: 0,
          transactions: rowsWithAccount,
        };
        return normalizeAccounts([...list, newAccount]);
      }

      return normalizeAccounts(
        list.map((acc) =>
          acc.id === targetAccountId
            ? {
                ...acc,
                transactions: mergeTransactions(
                  acc.transactions || [],
                  rowsWithAccount
                ),
              }
            : acc
        )
      );
    })();

    const nextBudgetsByMonth = (() => {
      const curr =
        budgetsByMonth?.[activeMonth] || {
          month: activeMonth,
          income: 0,
          fixed: [],
          variable: [],
          transactions: [],
        };

      const existing = Array.isArray(curr.transactions)
        ? curr.transactions
        : [];
      const nextTransactions = mergeDedupTx(existing, rowsWithAccount);

      return {
        ...budgetsByMonth,
        [activeMonth]: { ...curr, transactions: nextTransactions },
      };
    })();

    setAccounts(nextAccounts);
    setBudgetsByMonth(nextBudgetsByMonth);
    setCurrentAccountId(targetAccountId);

    setToast({
      variant: "success",
      message: detection.createdNew
        ? `Created "${targetAccountName}" and imported ${rowsWithAccount.length} transactions.`
        : `Imported ${rowsWithAccount.length} transactions into "${targetAccountName}".`,
    });
  }

  /* -------- Accounts UI actions -------- */
  function handleCreateAccount() {
    const nextName = `Account ${accounts.length + 1}`;
    const newId = makeId("acct");
    const newAcc = {
      id: newId,
      name: nextName,
      type: "checking",
      startingBalance: 0,
      transactions: [],
      createdAt: Date.now(),
    };
    setAccounts((prev) =>
      normalizeAccounts([...(Array.isArray(prev) ? prev : []), newAcc])
    );
    setCurrentAccountId(newId);
    setToast({ variant: "success", message: `Created ${nextName}` });
  }

  function handleDeleteAccount(id) {
    if (!id) return;
    if (
      !window.confirm(
        "Delete this account? Transactions tied to it will remain in budgets but the account will be removed."
      )
    )
      return;

    setAccounts((prev) => {
      const list = Array.isArray(prev) ? prev : [];
      const remaining = list.filter((a) => a.id !== id);
      if (currentAccountId === id)
        setCurrentAccountId(remaining[0]?.id || "main");
      return remaining;
    });
  }

  function handleSetAccountBalance(id, value) {
    const nextValue = Number(value);
    setAccounts((prev) =>
      normalizeAccounts(
        (Array.isArray(prev) ? prev : []).map((a) =>
          a.id === id
            ? {
                ...a,
                startingBalance: Number.isFinite(nextValue) ? nextValue : 0,
              }
            : a
        )
      )
    );
  }

  function handleRenameAccount(id, name) {
    const cleaned = (name || "").trim() || "Account";
    setAccounts((prev) =>
      normalizeAccounts(
        (Array.isArray(prev) ? prev : []).map((a) =>
          a.id === id ? { ...a, name: cleaned } : a
        )
      )
    );
  }

  /* ---------------- GOALS FLOW (NEW) ---------------- */

  function openGoalForEdit(goalId) {
    if (!goalId) return;
    setSelectedGoalId(goalId);
    setGoalMode("edit");
    setCurrentPage("goalDetail");
  }

  function goToGoalsCreate() {
    // NOTE: Do not create the goal here
    setSelectedGoalId(null);
    setGoalMode("create");
    setCurrentPage("goalDetail");
  }

  function requestCreateGoal() {
    // This is called by GoalDetailPage when mode === "create"
    const newGoal = {
      id: makeId("goal"),
      name: "New Goal",
      target: 1000,
      saved: 0,
      monthlyPlan: 0,
      emoji: "🎯",
      createdAt: Date.now(),
    };

    setGoals((prev) => [newGoal, ...(Array.isArray(prev) ? prev : [])]);
    setSelectedGoalId(newGoal.id);
    setGoalMode("edit"); // after creation, you're editing it
  }

  function handleDeleteGoal(goalId) {
    if (!goalId) return;
    if (!window.confirm("Delete this goal?")) return;

    setGoals((prev) =>
      (Array.isArray(prev) ? prev : []).filter((g) => g.id !== goalId)
    );
    setSelectedGoalId((prevId) => (prevId === goalId ? null : prevId));
  }

  function handleDuplicateGoal(goalId) {
    const g = (Array.isArray(goals) ? goals : []).find((x) => x.id === goalId);
    if (!g) return;

    const copy = {
      ...g,
      id: makeId("goal"),
      name: `${g.name || "Goal"} (Copy)`,
      createdAt: Date.now(),
    };

    setGoals((prev) => [copy, ...(Array.isArray(prev) ? prev : [])]);
    setSelectedGoalId(copy.id);
    setGoalMode("edit");
  }

  function handleAddContribution(goalId) {
    if (!goalId) return;
    const amtStr = window.prompt("Contribution amount?");
    const amt = Number(amtStr);
    if (!Number.isFinite(amt) || amt <= 0) return;

    setGoals((prev) =>
      (Array.isArray(prev) ? prev : []).map((g) =>
        g.id === goalId ? { ...g, saved: Number(g.saved || 0) + amt } : g
      )
    );
  }

  const selectedGoal =
    (Array.isArray(goals) ? goals : []).find((g) => g.id === selectedGoalId) ||
    null;

  /* -------- UI -------- */
  return (
    <div className={`app-shell ${themeStyles.shellClass}`}>
      <header className={themeStyles.headerClass}>
        <div className="content headerRow">
          <div className="brandAndNav">
            <span className="appTitle">BUDGET CENTER</span>

            <div className="navRow" aria-label="Primary navigation">
              {navOrder.map((pageKey) => (
                <NavButton
                  key={pageKey}
                  label={NAV_LABELS[pageKey]}
                  active={currentPage === pageKey}
                  onClick={() => setCurrentPage(pageKey)}
                />
              ))}
            </div>
          </div>

          <div className="headerRight">
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
        </div>
      </header>

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
            transactions={activeBudget.transactions || []}
            currentAccountBalance={currentAccountBalance}
            totalBalance={totalBalance}
            onCsvImported={handleImportedTransactions}
            onTransactionsParsed={handleImportedTransactions}
            sectionsOrder={dashboardSectionsOrder}
            // ✅ dashboard goals behavior:
            // + Add Goal goes to Goals page and creates THERE
            onCreateGoal={goToGoalsCreate}
            // pencil/edit takes you to goals page for that goal
            onOpenGoal={openGoalForEdit}
          />
        )}

        {currentPage === "balances" && (
          <BalancesDashboard
            accounts={accounts}
            currentAccountId={currentAccountId}
            onChangeCurrentAccount={setCurrentAccountId}
            onAccountsChange={setAccounts}
            onCreateAccount={handleCreateAccount}
            onDeleteAccount={handleDeleteAccount}
            onSetAccountBalance={handleSetAccountBalance}
            onRenameAccount={handleRenameAccount}
          />
        )}

        {currentPage === "budget" && (
          <BudgetPage
            month={activeMonth}
            budget={activeBudget}
            totals={totals}
            budgetsByMonth={budgetsByMonth}
            onBudgetChange={(nextBudget) =>
              setBudgetsByMonth((prev) => ({
                ...prev,
                [activeMonth]: nextBudget,
              }))
            }
          />
        )}

        {currentPage === "transactions" && (
          <TransactionsPage
            accounts={accounts}
            currentAccountId={currentAccountId}
            transactions={activeBudget.transactions || []}
            filter={txFilter}
            onFilterChange={setTxFilter}
            onUpdateBudget={(nextBudget) =>
              setBudgetsByMonth((prev) => ({
                ...prev,
                [activeMonth]: nextBudget,
              }))
            }
          />
        )}

        {currentPage === "goalDetail" && (
          <GoalDetailPage
            goal={selectedGoal}
            mode={goalMode || "edit"}
            onRequestCreateGoal={requestCreateGoal}
            onEditGoal={(id) => console.log("edit goal (wire modal later)", id)}
            onDeleteGoal={handleDeleteGoal}
            onDuplicateGoal={handleDuplicateGoal}
            onExportGoal={(id) => console.log("export goal (wire later)", id)}
            onAddContributionRequest={handleAddContribution}
          />
        )}

        {currentPage === "reports" && (
          <ReportsPage
            accounts={accounts}
            monthKey={activeMonth}
            onMerchantPick={(merchant) => {
              setTxFilter(merchant);
              setCurrentPage("transactions");
            }}
          />
        )}
      </main>

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  );
}

export default App;
