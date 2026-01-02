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

  const [selectedGoalId, setSelectedGoalId] = useState(
    stored?.selectedGoalId || null
  );
  const [goalMode, setGoalMode] = useState(null);

  const [txFilter, setTxFilter] = useState(stored?.txFilter || "");
  const [toast, setToast] = useState(null);
  const [lastSavedAt, setLastSavedAt] = useState(null);

  const [userProfile, setUserProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // ✅ Live refs to prevent stale-state during rapid auto-import
  const accountsRef = useRef(accounts);
  const budgetsByMonthRef = useRef(budgetsByMonth);
  const activeMonthRef = useRef(activeMonth);
  const currentAccountIdRef = useRef(currentAccountId);

  useEffect(() => {
    accountsRef.current = accounts;
  }, [accounts]);

  useEffect(() => {
    budgetsByMonthRef.current = budgetsByMonth;
  }, [budgetsByMonth]);

  useEffect(() => {
    activeMonthRef.current = activeMonth;
  }, [activeMonth]);

  useEffect(() => {
    currentAccountIdRef.current = currentAccountId;
  }, [currentAccountId]);

  // ✅ Toast aggregation for burst imports
  const importToastAggRef = useRef({
    files: 0,
    tx: 0,
    newAccounts: 0,
    touchedAccounts: new Set(),
    sources: new Set(), // ✅ add bank/source names
  });
  const importToastTimerRef = useRef(null);

  function flushImportToastSoon() {
    if (importToastTimerRef.current) clearTimeout(importToastTimerRef.current);

    importToastTimerRef.current = setTimeout(() => {
      const agg = importToastAggRef.current;
      if (!agg || agg.files <= 0) return;

      const accountCount = agg.touchedAccounts?.size || 0;
      const sources = Array.from(agg.sources || []);
      sources.sort((a, b) => a.localeCompare(b));

      // keep toast readable: show up to 4 sources, then "+N more"
      const shown = sources.slice(0, 4);
      const more = Math.max(0, sources.length - shown.length);
      const sourcesText =
        shown.length > 0
          ? ` (${shown.join(", ")}${more ? `, +${more} more` : ""})`
          : "";

      let msg = "";
      if (agg.files === 1) {
        msg = `Imported ${agg.tx} transaction${agg.tx === 1 ? "" : "s"} into ${
          accountCount === 1
            ? `"${Array.from(agg.touchedAccounts)[0]}"`
            : "your accounts"
        }${sourcesText}.`;
      } else {
        msg = `Imported ${agg.tx} transaction${
          agg.tx === 1 ? "" : "s"
        } from ${agg.files} files into ${
          accountCount === 1
            ? `"${Array.from(agg.touchedAccounts)[0]}"`
            : `${accountCount} accounts`
        }${sourcesText}.`;
      }

      if (agg.newAccounts > 0) {
        msg += ` Created ${agg.newAccounts} new account${
          agg.newAccounts === 1 ? "" : "s"
        }.`;
      }

      setToast({ variant: "success", message: msg });

      // reset
      importToastAggRef.current = {
        files: 0,
        tx: 0,
        newAccounts: 0,
        touchedAccounts: new Set(),
        sources: new Set(),
      };
    }, 750);
  }

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

      setGoals((prev) => {
        if (!Array.isArray(remote.goals)) return prev;
        return remote.goals;
      });

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
      selectedGoalId,
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

    // ✅ This is what we will display in the toast sources list
    const sourceLabel =
      meta.bank ||
      meta.detectedBank ||
      meta.filename ||
      meta.fileName ||
      "Imported";

    // live refs
    const prevAccounts = Array.isArray(accountsRef.current)
      ? accountsRef.current
      : [];
    const prevBudgetsByMonth = budgetsByMonthRef.current || {};
    const monthKey = activeMonthRef.current || getCurrentMonthKey();
    const fallbackAccountId = currentAccountIdRef.current || "main";

    const detection = importTransactionsWithDetection(
      prevAccounts,
      fallbackAccountId,
      parsedRows,
      sourceLabel
    );

    const targetAccountId = detection.targetAccountId;
    const targetAccountName =
      detection.targetAccountName || sourceLabel || "Imported Account";

    const rowsWithAccount = parsedRows.map((tx) => ({
      ...tx,
      accountId: targetAccountId,
    }));

    const nextAccounts = (() => {
      const list = Array.isArray(prevAccounts) ? prevAccounts : [];
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
          createdAt: Date.now(),
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
        prevBudgetsByMonth?.[monthKey] || {
          month: monthKey,
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
        ...prevBudgetsByMonth,
        [monthKey]: { ...curr, transactions: nextTransactions },
      };
    })();

    // update refs immediately
    accountsRef.current = nextAccounts;
    budgetsByMonthRef.current = nextBudgetsByMonth;
    currentAccountIdRef.current = targetAccountId;

    // commit state
    setAccounts(nextAccounts);
    setBudgetsByMonth(nextBudgetsByMonth);
    setCurrentAccountId(targetAccountId);

    // ✅ Aggregate one toast (include sources list)
    const agg = importToastAggRef.current;
    agg.files += 1;
    agg.tx += rowsWithAccount.length;
    if (detection.createdNew) agg.newAccounts += 1;

    // show account names + source labels
    agg.touchedAccounts.add(targetAccountName);
    agg.sources.add(sourceLabel);

    flushImportToastSoon();
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

  /* ---------------- GOALS FLOW ---------------- */

  function openGoalForEdit(goalId) {
    if (!goalId) return;
    setSelectedGoalId(goalId);
    setGoalMode("edit");
    setCurrentPage("goalDetail");
  }

  function goToGoalsCreate() {
    setSelectedGoalId(null);
    setGoalMode("create");
    setCurrentPage("goalDetail");
  }

  function requestCreateGoal() {
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
    setGoalMode("edit");
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

  function handleEditGoal(goalId) {
    setGoals((prev) => {
      const list = Array.isArray(prev) ? prev : [];
      const g = list.find((x) => x.id === goalId);
      if (!g) return list;

      const name = window.prompt("Goal name:", g.name || "New Goal");
      if (name === null) return list;

      const targetStr = window.prompt("Target amount:", String(g.target ?? 0));
      if (targetStr === null) return list;

      const nextTarget = Number(targetStr);
      if (!Number.isFinite(nextTarget) || nextTarget < 0) return list;

      return list.map((x) =>
        x.id === goalId
          ? { ...x, name: name.trim() || "New Goal", target: nextTarget }
          : x
      );
    });
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
            onCreateGoal={goToGoalsCreate}
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
            goals={goals}
            goal={selectedGoal}
            mode={goalMode || "edit"}
            onSelectGoal={(id) => {
              setSelectedGoalId(id);
              setGoalMode("edit");
            }}
            onRequestCreateGoal={requestCreateGoal}
            onEditGoal={handleEditGoal}
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
