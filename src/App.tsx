import { useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import './App.css'

import { useAuth } from './SupabaseAuthProvider'
import { supabase } from './lib/supabase'
import type {
  BudgetMonth,
  BudgetItem,
  FinancialAccount,
  Transaction,
  Goal,
  ScheduledTemplate,
} from './lib/supabase'

import { ensureHousehold } from './api/householdApi'
import { getBudgetMonth, upsertBudgetMonth, getBudgetItems, addBudgetItem, deleteBudgetItem } from './api/budgetApi'
import { getTransactions, getAllTransactions, addTransaction as apiAddTransaction, updateTransaction as apiUpdateTransaction, deleteTransaction as apiDeleteTransaction, deleteTransactionsBulk, addTransactions } from './api/transactionsApi'
import { getGoals, addGoal as apiAddGoal, updateGoal as apiUpdateGoal, deleteGoal as apiDeleteGoal, addContribution, recalculateGoalFromContributions } from './api/goalsApi'
import { getScheduledTemplates, addScheduledTemplate, deleteScheduledTemplate, getScheduleChecks, setScheduleCheck } from './api/scheduledApi'
import { getAccounts, addAccount as apiAddAccount, updateAccount as apiUpdateAccount, deleteAccount as apiDeleteAccount, applyStatementBalance } from './api/accountsApi'

// Components
import NavButton from './components/NavButton'
import ActionsMenu from './components/ActionsMenu'
import Toast from './components/Toast'
import ProfileMenu from './components/ProfileMenu'
import HouseholdManager from './components/HouseholdManager'
import AuthPage from './pages/AuthPage'

// Pages — JSX pages cast to any while being incrementally converted to TSX
import type { ComponentType } from 'react'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPage = ComponentType<any>
import DashboardJsx from './pages/Dashboard.jsx'
import BalancesDashboardJsx from './pages/BalancesDashboard.jsx'
import BudgetPageJsx from './pages/BudgetPage.jsx'
import TransactionsPageJsx from './pages/TransactionsPage.jsx'
import GoalDetailPageJsx from './pages/GoalDetailPage.jsx'
const Dashboard = DashboardJsx as AnyPage
const BalancesDashboard = BalancesDashboardJsx as AnyPage
const BudgetPage = BudgetPageJsx as AnyPage
const TransactionsPage = TransactionsPageJsx as AnyPage
const GoalDetailPage = GoalDetailPageJsx as AnyPage
import ReportsPage from './pages/ReportsPage'

import { monthLabelFromKey } from './lib/storage.js'
import { statementKeyFromRange, getStatementDateRange, sumAmounts, isoDate } from './lib/statementMath.js'

type Page = 'dashboard' | 'balances' | 'budget' | 'transactions' | 'reports' | 'goals'
type ToastState = { kind: 'success' | 'error'; message: string } | null

function safeMonthKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function App() {
  const { user, authLoading, signInWithEmail, signUpWithEmail, signOut, resetPassword } = useAuth()

  // ─── Household & workspace ────────────────────────────────────────────────
  const [householdId, setHouseholdId] = useState<string | null>(null)
  const [householdError, setHouseholdError] = useState<string | null>(null)
  const [showHouseholdManager, setShowHouseholdManager] = useState(false)

  // ─── Navigation ───────────────────────────────────────────────────────────
  const [currentPage, setCurrentPage] = useState<Page>('dashboard')
  const [currentGoalId, setCurrentGoalId] = useState<string | null>(null)
  const [monthKey, setMonthKey] = useState<string>(safeMonthKey())

  // ─── Data slices ──────────────────────────────────────────────────────────
  const [budgetMonth, setBudgetMonth] = useState<BudgetMonth | null>(null)
  const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([])
  const [accounts, setAccounts] = useState<FinancialAccount[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [scheduledTemplates, setScheduledTemplates] = useState<ScheduledTemplate[]>([])
  const [scheduleChecks, setScheduleChecks] = useState<Record<string, boolean>>({})
  const [currentAccountId, setCurrentAccountId] = useState<string | null>(null)

  const [dataLoading, setDataLoading] = useState(false)
  const [toast, setToast] = useState<ToastState>(null)

  const initialLoadDone = useRef(false)

  // ─── Step 1: ensure household on login ───────────────────────────────────
  useEffect(() => {
    if (!user) {
      setHouseholdId(null)
      setHouseholdError(null)
      initialLoadDone.current = false
      return
    }
    if (initialLoadDone.current) return

    setHouseholdError(null)
    ensureHousehold(user.id, user.email ?? '')
      .then((hid) => setHouseholdId(hid))
      .catch((err) => {
        console.error(err)
        setHouseholdError(err?.message ?? 'Failed to load workspace')
      })
  }, [user])

  // ─── Step 2: load all data once household is known ───────────────────────
  useEffect(() => {
    if (!householdId) return

    setDataLoading(true)
    Promise.all([
      getBudgetMonth(householdId, monthKey),
      getBudgetItems(householdId, monthKey),
      getAccounts(householdId),
      getTransactions(householdId, monthKey),
      getAllTransactions(householdId),
      getGoals(householdId),
      getScheduledTemplates(householdId),
      getScheduleChecks(householdId),
    ])
      .then(([bm, items, accs, txs, allTxs, gs, templates, checks]) => {
        setBudgetMonth(bm)
        setBudgetItems(items)
        setAccounts(accs)
        setTransactions(txs)
        setAllTransactions(allTxs)
        setGoals(gs)
        setScheduledTemplates(templates)
        setScheduleChecks(checks)
        if (!currentAccountId && accs.length > 0) setCurrentAccountId(accs[0].id)
        initialLoadDone.current = true
      })
      .catch((err) => {
        console.error('Failed to load data:', err)
        setToast({ kind: 'error', message: 'Failed to load workspace data' })
      })
      .finally(() => setDataLoading(false))
  }, [householdId, monthKey])

  // ─── Step 3: Supabase realtime subscriptions ─────────────────────────────
  useEffect(() => {
    if (!householdId) return

    const channel = supabase
      .channel(`budget:${householdId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `household_id=eq.${householdId}` }, () => {
        getTransactions(householdId, monthKey).then(setTransactions)
        getAllTransactions(householdId).then(setAllTransactions)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'goals', filter: `household_id=eq.${householdId}` }, () => {
        getGoals(householdId).then(setGoals)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'budget_items', filter: `household_id=eq.${householdId}` }, () => {
        getBudgetItems(householdId, monthKey).then(setBudgetItems)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'financial_accounts', filter: `household_id=eq.${householdId}` }, () => {
        getAccounts(householdId).then(setAccounts)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scheduled_templates', filter: `household_id=eq.${householdId}` }, () => {
        getScheduledTemplates(householdId).then(setScheduledTemplates)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [householdId, monthKey])

  // ─── Derived values ───────────────────────────────────────────────────────
  const monthLabel = useMemo(() => monthLabelFromKey(monthKey), [monthKey])

  const estimatedIncome = budgetMonth?.estimated_income ?? 0
  const useActualIncome = budgetMonth?.use_actual_income ?? false

  const fixedItems = budgetItems.filter((i) => i.category === 'fixed')
  const variableItems = budgetItems.filter((i) => i.category === 'variable')

  const fixedTotal = fixedItems.reduce((s, i) => s + (i.amount ?? 0), 0)
  const variableTotal = variableItems.reduce((s, i) => s + (i.amount ?? 0), 0)

  const actualIncome = useMemo(
    () => transactions.reduce((s, tx) => {
      const ft = tx.flow_type
      const amt = tx.amount ?? 0
      if (ft === 'income') return s + Math.max(0, amt)
      if (ft === 'expense' || ft === 'transfer' || ft === 'ignore') return s
      return amt > 0 ? s + amt : s
    }, 0),
    [transactions],
  )

  const incomeForMath = useActualIncome ? actualIncome : estimatedIncome
  const leftover = incomeForMath - fixedTotal - variableTotal

  // ─── Account balance helpers ──────────────────────────────────────────────
  const accountBalances = useMemo(() => {
    const netByAccount: Record<string, number> = {}
    for (const tx of allTransactions) {
      if (!tx.account_id) continue
      netByAccount[tx.account_id] = (netByAccount[tx.account_id] ?? 0) + (Number(tx.amount) || 0)
    }
    return accounts.map((acc) => {
      const net = netByAccount[acc.id] ?? 0
      const confirmed = Number.isFinite(Number(acc.current_balance)) ? Number(acc.current_balance) : null
      const computed = (Number(acc.starting_balance) || 0) + net
      return { id: acc.id, balance: confirmed ?? computed }
    })
  }, [accounts, allTransactions])

  const currentAccountBalance = accountBalances.find((a) => a.id === currentAccountId)?.balance ?? 0
  const totalBalance = accountBalances.reduce((s, a) => s + a.balance, 0)

  // ─── Budget month actions ─────────────────────────────────────────────────
  async function handleSetEstimatedIncome(amount: number) {
    if (!householdId) return
    const updated = await upsertBudgetMonth(householdId, monthKey, { estimated_income: amount })
    setBudgetMonth(updated)
  }

  async function handleToggleUseActualIncome() {
    if (!householdId) return
    const updated = await upsertBudgetMonth(householdId, monthKey, {
      use_actual_income: !useActualIncome,
    })
    setBudgetMonth(updated)
  }

  // ─── Budget item actions ──────────────────────────────────────────────────
  async function handleAddBudgetItem(category: 'fixed' | 'variable', label: string, amount: number, templateId?: string) {
    if (!householdId) return
    const item = await addBudgetItem(householdId, monthKey, {
      category,
      label,
      amount,
      template_id: templateId ?? null,
    })
    setBudgetItems((prev) => [...prev, item])
  }

  async function handleDeleteBudgetItem(id: string) {
    await deleteBudgetItem(id)
    setBudgetItems((prev) => prev.filter((i) => i.id !== id))
  }

  // ─── Transaction actions ──────────────────────────────────────────────────
  async function handleAddTransaction(tx: {
    description: string
    amount: number
    date: string
    category?: string
    accountId?: string
    flowType?: string
  }) {
    if (!householdId) return
    const txMonthKey = tx.date?.slice(0, 7) ?? monthKey
    const newTx = await apiAddTransaction({
      household_id: householdId,
      account_id: tx.accountId ?? currentAccountId ?? null,
      month_key: txMonthKey,
      date: tx.date,
      description: tx.description,
      amount: tx.amount,
      category: tx.category ?? null,
      flow_type: (tx.flowType as Transaction['flow_type']) ?? null,
      source: 'manual',
      pantry_history_id: null,
    })
    if (txMonthKey === monthKey) setTransactions((prev) => [newTx, ...prev])
    setAllTransactions((prev) => [newTx, ...prev])
    setToast({ kind: 'success', message: 'Transaction added.' })
  }

  async function handleUpdateTransaction(id: string, patch: Partial<Pick<Transaction, 'description' | 'category' | 'flow_type' | 'amount' | 'date'>>) {
    await apiUpdateTransaction(id, patch)
    setTransactions((prev) => prev.map((t) => t.id === id ? { ...t, ...patch } : t))
    setAllTransactions((prev) => prev.map((t) => t.id === id ? { ...t, ...patch } : t))
  }

  async function handleDeleteTransaction(id: string) {
    await apiDeleteTransaction(id)
    setTransactions((prev) => prev.filter((t) => t.id !== id))
    setAllTransactions((prev) => prev.filter((t) => t.id !== id))
  }

  async function handleClearTransactions(ids: string[]) {
    await deleteTransactionsBulk(ids)
    const idSet = new Set(ids)
    setTransactions((prev) => prev.filter((t) => !idSet.has(t.id)))
    setAllTransactions((prev) => prev.filter((t) => !idSet.has(t.id)))
    setToast({ kind: 'success', message: `Cleared ${ids.length} transaction${ids.length === 1 ? '' : 's'}.` })
  }

  async function handleImportTransactions(
    rows: Array<{ date: string; description: string; amount: number; category?: string; balance?: number }>,
    meta: {
      accountId?: string
      bank?: string
      filename?: string
      statement?: { statementKey: string; startISO: string; endISO: string; endingBalance: number; startingBalance: number; transactionSum: number; balanceSource: 'user' | 'csv' }
    },
  ) {
    if (!householdId) return

    // 1. If bank name detected, try to find a matching existing account first
    let targetAccountId: string | null = null
    if (meta.bank) {
      const bankLower = meta.bank.toLowerCase()
      const matched = accounts.find(
        (a) => a.name.toLowerCase().includes(bankLower) || bankLower.includes(a.name.toLowerCase()),
      )
      if (matched) targetAccountId = matched.id
    }

    // 2. Fall back to explicitly-selected account
    if (!targetAccountId) targetAccountId = meta.accountId ?? currentAccountId ?? null

    // 3. Nothing matched — auto-create an account named after the bank/file
    if (!targetAccountId) {
      const accountName = meta.bank
        || meta.filename?.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ')
        || 'Imported Account'
      const newAcc = await apiAddAccount({
        household_id: householdId,
        name: accountName,
        type: 'checking',
        starting_balance: 0,
        current_balance: null,
        current_balance_as_of: null,
        last_statement_key: null,
        last_confirmed_ending_balance: null,
        statement_balances: {},
      })
      setAccounts((prev) => [...prev, newAcc])
      setCurrentAccountId(newAcc.id)
      targetAccountId = newAcc.id
    }

    const toInsert = rows.map((row) => ({
      household_id: householdId,
      account_id: targetAccountId,
      month_key: /^\d{4}-\d{2}$/.test(row.date?.slice(0, 7) ?? '') ? row.date!.slice(0, 7) : monthKey,
      date: row.date,
      description: row.description,
      amount: row.amount,
      category: row.category ?? null,
      flow_type: null as Transaction['flow_type'],
      source: 'csv' as const,
      pantry_history_id: null,
    }))

    const inserted = await addTransactions(toInsert)
    const thisMonth = inserted.filter((t) => t.month_key === monthKey)
    setTransactions((prev) => [...thisMonth, ...prev])
    setAllTransactions((prev) => [...inserted, ...prev])

    if (meta.statement && targetAccountId) {
      await applyStatementBalance(targetAccountId, meta.statement.statementKey, {
        statementKey: meta.statement.statementKey,
        startISO: meta.statement.startISO,
        endISO: meta.statement.endISO,
        endingBalance: meta.statement.endingBalance,
        startingBalance: meta.statement.startingBalance,
        transactionSum: meta.statement.transactionSum,
        balanceSource: meta.statement.balanceSource,
        confirmedAt: new Date().toISOString(),
      })
      setAccounts(await getAccounts(householdId))
    }

    const acctMsg = meta.bank ? ` into ${meta.bank}` : ''
    setToast({ kind: 'success', message: `Imported ${inserted.length} transactions${acctMsg}.` })
  }

  // ─── Account actions ──────────────────────────────────────────────────────
  async function handleCreateAccount() {
    if (!householdId) return
    const name = window.prompt('Account name:')
    if (!name) return
    const acc = await apiAddAccount({
      household_id: householdId,
      name,
      type: 'checking',
      starting_balance: 0,
      current_balance: null,
      current_balance_as_of: null,
      last_statement_key: null,
      last_confirmed_ending_balance: null,
      statement_balances: {},
    })
    setAccounts((prev) => [...prev, acc])
    setCurrentAccountId(acc.id)
  }

  async function handleDeleteAccount(id: string) {
    await apiDeleteAccount(id)
    setAccounts((prev) => prev.filter((a) => a.id !== id))
    if (currentAccountId === id) setCurrentAccountId(accounts.find((a) => a.id !== id)?.id ?? null)
  }

  async function handleRenameAccount(id: string, name: string) {
    await apiUpdateAccount(id, { name })
    setAccounts((prev) => prev.map((a) => a.id === id ? { ...a, name } : a))
  }

  async function handleSetAccountBalance(id: string, balance: number) {
    await apiUpdateAccount(id, { starting_balance: balance })
    setAccounts((prev) => prev.map((a) => a.id === id ? { ...a, starting_balance: balance } : a))
  }

  // ─── Goal actions ─────────────────────────────────────────────────────────
  async function handleCreateGoal() {
    if (!householdId) return
    const name = window.prompt('Goal name:')
    if (!name) return
    const targetStr = window.prompt('Target amount:')
    const target = Number(targetStr)
    if (!Number.isFinite(target)) return
    const goal = await apiAddGoal({
      household_id: householdId,
      name,
      target_amount: target,
      current_amount: 0,
      target_date: null,
      icon: '🎯',
      color: null,
      monthly_plan: 0,
    })
    setGoals((prev) => [...prev, goal])
    setCurrentGoalId(goal.id)
    setCurrentPage('goals')
  }

  async function handleUpdateGoal(id: string, patch: Parameters<typeof apiUpdateGoal>[1]) {
    await apiUpdateGoal(id, patch)
    setGoals((prev) => prev.map((g) => g.id === id ? { ...g, ...patch } : g))
  }

  async function handleDeleteGoal(id: string) {
    await apiDeleteGoal(id)
    setGoals((prev) => prev.filter((g) => g.id !== id))
    if (currentGoalId === id) setCurrentGoalId(null)
  }

  async function handleResetGoal(id: string) {
    const newAmount = await recalculateGoalFromContributions(id)
    setGoals((prev) => prev.map((g) => g.id === id ? { ...g, current_amount: newAmount } : g))
    setToast({ kind: 'success', message: `Progress reset to $${newAmount.toFixed(2)} from saved contributions.` })
  }

  async function handleAddContribution(goalId: string, amount: number, note?: string) {
    if (!householdId) return
    await addContribution({
      goal_id: goalId,
      household_id: householdId,
      amount,
      note: note ?? null,
      date: new Date().toISOString().slice(0, 10),
    })
    setGoals((prev) =>
      prev.map((g) => g.id === goalId ? { ...g, current_amount: g.current_amount + amount } : g),
    )
    setToast({ kind: 'success', message: 'Contribution added.' })
  }

  // ─── Scheduled template actions ───────────────────────────────────────────
  async function handleAddScheduledTemplate(template: Omit<ScheduledTemplate, 'id' | 'created_at'>) {
    const t = await addScheduledTemplate(template)
    setScheduledTemplates((prev) => [...prev, t])
    return t.id
  }

  async function handleDeleteScheduledTemplate(id: string) {
    await deleteScheduledTemplate(id)
    setScheduledTemplates((prev) => prev.filter((t) => t.id !== id))
    // Remove checks for this template
    setScheduleChecks((prev) => {
      const next = { ...prev }
      for (const key of Object.keys(next)) {
        if (key.startsWith(`${id}|`)) delete next[key]
      }
      return next
    })
  }

  async function handleToggleScheduleCheck(templateId: string, dueDate: string) {
    if (!householdId) return
    const key = `${templateId}|${dueDate}`
    const current = !!scheduleChecks[key]
    await setScheduleCheck(householdId, templateId, dueDate, !current)
    setScheduleChecks((prev) => ({ ...prev, [key]: !current }))
  }

  // ─── Loading / error states ───────────────────────────────────────────────
  if (authLoading || (user && !householdId && !householdError)) {
    return (
      <div className="min-h-dvh flex items-center justify-center text-slate-400 bg-[#05060F]">
        Loading…
      </div>
    )
  }

  if (householdError) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-6 text-center gap-4 bg-[#05060F]">
        <div className="text-4xl">⚠️</div>
        <p className="font-semibold text-slate-100">Setup incomplete</p>
        <p className="text-sm text-slate-400 max-w-xs">
          The database tables aren't set up yet. Run the SQL schema in your Supabase SQL Editor, then reload.
        </p>
        <p className="text-xs text-red-400 bg-red-500/10 px-4 py-2 rounded-xl max-w-xs break-all">
          {householdError}
        </p>
        <button onClick={() => window.location.reload()}
          className="mt-2 px-6 py-3 bg-cyan-500 text-slate-900 rounded-xl font-semibold">
          Reload
        </button>
        <button onClick={signOut} className="text-sm text-slate-400 underline">Sign out</button>
      </div>
    )
  }

  if (!user) {
    return (
      <AuthPage
        onSignIn={signInWithEmail}
        onSignUp={signUpWithEmail}
        onResetPassword={resetPassword}
      />
    )
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="content headerRow">
          {/* Brand + desktop nav */}
          <div className="brandAndNav">
            <div className="appTitle">FlowMetrics</div>
            <nav className="navRow" aria-label="Primary navigation">
              <NavButton active={currentPage === 'dashboard'} onClick={() => setCurrentPage('dashboard')}>Dashboard</NavButton>
              <NavButton active={currentPage === 'balances'} onClick={() => setCurrentPage('balances')}>Balances</NavButton>
              <NavButton active={currentPage === 'budget'} onClick={() => setCurrentPage('budget')}>Budget</NavButton>
              <NavButton active={currentPage === 'transactions'} onClick={() => setCurrentPage('transactions')}>Transactions</NavButton>
              <NavButton active={currentPage === 'reports'} onClick={() => setCurrentPage('reports')}>Reports</NavButton>
              <NavButton active={currentPage === 'goals'} onClick={() => setCurrentPage('goals')}>Goals</NavButton>
            </nav>
          </div>

          <div className="headerRight">
            <ActionsMenu
              monthKey={monthKey}
              onSetMonthKey={setMonthKey}
              onOpenWorkspaceManager={() => setShowHouseholdManager(true)}
            />
            <ProfileMenu
              user={user}
              onSignOut={signOut}
              onUpdateProfile={() => {}}
            />
          </div>
        </div>
      </header>

      <main className="app-main">
        <div className="content">
          {/* eslint-disable @typescript-eslint/ban-ts-comment */}
          {currentPage === 'dashboard' && (
            // @ts-ignore – JSX component, props checked at runtime
            <Dashboard
              month={monthLabel}
              income={incomeForMath}
              fixed={fixedTotal}
              variable={variableTotal}
              leftover={leftover}
              goals={goals}
              transactions={transactions}
              accounts={accounts}
              currentAccountId={currentAccountId}
              onChangeCurrentAccount={setCurrentAccountId}
              currentAccountBalance={currentAccountBalance}
              totalBalance={totalBalance}
              onOpenGoal={(id: string) => { setCurrentGoalId(id); setCurrentPage('goals') }}
              onCreateGoal={handleCreateGoal}
              onCsvImported={handleImportTransactions}
              sectionsOrder={undefined}
            />
          )}

          {currentPage === 'balances' && (
            // @ts-ignore – JSX component, props checked at runtime
            <BalancesDashboard
              accounts={accounts}
              allTransactions={allTransactions}
              currentAccountId={currentAccountId}
              onChangeCurrentAccount={setCurrentAccountId}
              onCreateAccount={handleCreateAccount}
              onDeleteAccount={handleDeleteAccount}
              onSetAccountBalance={handleSetAccountBalance}
              onRenameAccount={handleRenameAccount}
            />
          )}

          {currentPage === 'budget' && (
            // @ts-ignore – JSX component, props checked at runtime
            <BudgetPage
              month={monthLabel}
              monthKey={monthKey}
              estimatedIncome={estimatedIncome}
              useActualIncome={useActualIncome}
              actualIncome={actualIncome}
              fixedItems={fixedItems}
              variableItems={variableItems}
              fixedTotal={fixedTotal}
              variableTotal={variableTotal}
              leftover={leftover}
              scheduledTemplates={scheduledTemplates}
              scheduleChecks={scheduleChecks}
              accounts={accounts}
              currentAccountId={currentAccountId}
              householdId={householdId}
              onSetEstimatedIncome={handleSetEstimatedIncome}
              onToggleUseActualIncome={handleToggleUseActualIncome}
              onAddBudgetItem={handleAddBudgetItem}
              onDeleteBudgetItem={handleDeleteBudgetItem}
              onAddTransaction={handleAddTransaction}
              onAddScheduledTemplate={handleAddScheduledTemplate}
              onDeleteScheduledTemplate={handleDeleteScheduledTemplate}
              onToggleScheduleCheck={handleToggleScheduleCheck}
            />
          )}

          {currentPage === 'transactions' && (
            // @ts-ignore – JSX component, props checked at runtime
            <TransactionsPage
              month={monthLabel}
              transactions={transactions}
              accounts={accounts}
              currentAccountId={currentAccountId}
              onChangeCurrentAccount={setCurrentAccountId}
              onAddTransaction={handleAddTransaction}
              onUpdateTransaction={handleUpdateTransaction}
              onDeleteTransaction={handleDeleteTransaction}
              onClearTransactions={handleClearTransactions}
              scheduledTemplates={scheduledTemplates}
              onScheduledTemplatesChange={() => {}}
            />
          )}

          {currentPage === 'reports' && (
            <ReportsPage
              householdId={householdId!}
              monthKey={monthKey}
              month={monthLabel}
              transactions={transactions}
            />
          )}

          {currentPage === 'goals' && (
            // @ts-ignore – JSX component, props checked at runtime
            <GoalDetailPage
              goals={goals}
              goal={goals.find((g) => g.id === currentGoalId) ?? null}
              onSelectGoal={(id: string) => setCurrentGoalId(id)}
              onRequestCreateGoal={handleCreateGoal}
              onEditGoal={(id: string) => {
                const g = goals.find((g) => g.id === id)
                if (!g) return
                const name = window.prompt('Goal name:', g.name)
                if (name) handleUpdateGoal(id, { name })
              }}
              onDeleteGoal={handleDeleteGoal}
              onDuplicateGoal={(id: string) => {
                const g = goals.find((g) => g.id === id)
                if (!g || !householdId) return
                apiAddGoal({ ...g, household_id: householdId, name: `${g.name} (copy)` }).then((ng) => {
                  setGoals((prev) => [...prev, ng])
                })
              }}
              onExportGoal={() => {}}
              onResetGoal={handleResetGoal}
              onAddContributionRequest={(id: string) => {
                const amtStr = window.prompt('Contribution amount:')
                const amt = Number(amtStr)
                if (Number.isFinite(amt) && amt > 0) handleAddContribution(id, amt)
              }}
            />
          )}
          {/* eslint-enable @typescript-eslint/ban-ts-comment */}
        </div>
      </main>

      {showHouseholdManager && householdId && (
        <HouseholdManager
          householdId={householdId}
          currentUserId={user.id}
          onClose={() => setShowHouseholdManager(false)}
          onHouseholdChanged={(newId) => {
            setHouseholdId(newId)
            initialLoadDone.current = false
          }}
        />
      )}

      {/* Mobile bottom nav */}
      <nav className="bottom-nav" aria-label="Primary navigation">
        {([
          { page: 'dashboard',    label: 'Home',    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M3 12L12 4l9 8"/><path d="M5 10v9h5v-5h4v5h5V10"/></svg> },
          { page: 'balances',     label: 'Balances',icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="6" y1="15" x2="9" y2="15"/></svg> },
          { page: 'budget',       label: 'Budget',  icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="12" width="4" height="8"/><rect x="10" y="7" width="4" height="13"/><rect x="17" y="3" width="4" height="17"/></svg> },
          { page: 'transactions', label: 'Txns',    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M7 16V4m0 0L4 7m3-3 3 3M17 8v12m0 0 3-3m-3 3-3-3"/></svg> },
          { page: 'reports',      label: 'Reports', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="m7 16 4-4 3 3 5-6"/></svg> },
          { page: 'goals',        label: 'Goals',   icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M4 15V5h14l-3 5 3 5H4"/><line x1="4" y1="15" x2="4" y2="21"/></svg> },
        ] as { page: typeof currentPage; label: string; icon: React.ReactNode }[]).map(({ page, label, icon }) => (
          <button key={page} type="button"
            className={`bottom-nav-item${currentPage === page ? ' active' : ''}`}
            onClick={() => setCurrentPage(page)}
          >
            <span className="bottom-nav-icon">{icon}</span>
            <span className="bottom-nav-label">{label}</span>
          </button>
        ))}
      </nav>

      {toast && (
        <Toast kind={toast.kind} message={toast.message} onClose={() => setToast(null)} />
      )}
    </div>
  )
}
