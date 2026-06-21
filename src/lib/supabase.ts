import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ─── Shared types (also present in pantry app) ────────────────────────────────

export type Household = {
  id: string
  name: string
  created_by: string
  created_at: string
}

export type HouseholdMember = {
  id: string
  household_id: string
  user_id: string
  email: string | null
  role: 'owner' | 'member'
  joined_at: string
}

export type HouseholdInvite = {
  id: string
  household_id: string
  invited_by: string
  code: string
  used_by: string | null
  expires_at: string
  created_at: string
}

// ─── Pantry types (read-only from budget app) ─────────────────────────────────

export type PantryItemHistory = {
  id: string
  household_id: string
  user_id: string
  name: string
  category: string | null
  store: string | null
  quantity: number | null
  price: number | null
  barcode: string | null
  expiration_date: string | null
  reason: 'used_up' | 'removed'
  deleted_at: string
}

// ─── Budget types ─────────────────────────────────────────────────────────────

export type BudgetMonth = {
  id: string
  household_id: string
  month_key: string
  estimated_income: number
  use_actual_income: boolean
  created_at: string
  updated_at: string
}

export type BudgetItem = {
  id: string
  household_id: string
  month_key: string
  category: 'fixed' | 'variable'
  label: string
  amount: number
  template_id: string | null
  created_at: string
}

export type FinancialAccount = {
  id: string
  household_id: string
  name: string
  type: 'checking' | 'savings' | 'credit'
  starting_balance: number
  current_balance: number | null
  current_balance_as_of: string | null
  last_statement_key: string | null
  last_confirmed_ending_balance: number | null
  statement_balances: Record<string, StatementEntry>
  created_at: string
}

export type StatementEntry = {
  statementKey: string
  startISO: string
  endISO: string
  endingBalance: number | null
  startingBalance: number | null
  transactionSum: number | null
  balanceSource: 'user' | 'csv'
  confirmedAt: string
}

export type Transaction = {
  id: string
  household_id: string
  account_id: string | null
  month_key: string
  date: string
  description: string
  amount: number
  category: string | null
  flow_type: 'income' | 'expense' | 'transfer' | 'ignore' | null
  source: 'manual' | 'csv' | 'pdf' | 'pantry'
  pantry_history_id: string | null
  created_at: string
}

export type Goal = {
  id: string
  household_id: string
  name: string
  target_amount: number
  current_amount: number
  target_date: string | null
  icon: string | null
  color: string | null
  monthly_plan: number
  created_at: string
  updated_at: string
}

export type GoalContribution = {
  id: string
  goal_id: string
  household_id: string
  amount: number
  note: string | null
  date: string
  created_at: string
}

export type ScheduledTemplate = {
  id: string
  household_id: string
  label: string
  amount: number
  kind: 'expense' | 'income'
  source: string | null
  start_date: string
  cadence: 'once' | 'weekly' | 'biweekly' | 'monthly' | 'yearly'
  day_of_month: number | null
  account_id: string | null
  created_at: string
}

export type ScheduleCheck = {
  id: string
  template_id: string
  household_id: string
  due_date: string
  paid: boolean
  paid_at: string | null
}

export type StatementImport = {
  id: string
  household_id: string
  account_id: string | null
  statement_key: string | null
  starting_balance: number | null
  ending_balance: number | null
  transaction_sum: number | null
  balance_source: 'user' | 'csv'
  start_iso: string | null
  end_iso: string | null
  created_at: string
}

// ─── Convenience re-exports ───────────────────────────────────────────────────

export type { Session, User } from '@supabase/supabase-js'
