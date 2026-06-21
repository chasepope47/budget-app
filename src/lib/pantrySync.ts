/**
 * Pantry → Budget integration.
 *
 * Both apps share the same Supabase project, so we can query the pantry's
 * item_history table directly. These records are read-only from the budget
 * side; we never write to pantry tables from here.
 */
import { supabase, type PantryItemHistory, type Transaction } from './supabase'

export type PantrySpendRow = {
  id: string
  date: string          // "YYYY-MM-DD" (from deleted_at)
  name: string
  category: string | null
  store: string | null
  quantity: number
  price: number         // total cost = price * quantity
  reason: 'used_up' | 'removed'
}

/** Pull grocery spending from pantry item_history for the given household + month. */
export async function getPantrySpendingForMonth(
  householdId: string,
  monthKey: string,
): Promise<PantrySpendRow[]> {
  const startOfMonth = `${monthKey}-01`
  // Last day: use the first day of the next month
  const [year, month] = monthKey.split('-').map(Number)
  const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`

  const { data } = await supabase
    .from('item_history')
    .select('*')
    .eq('household_id', householdId)
    .gte('deleted_at', startOfMonth)
    .lt('deleted_at', nextMonth)
    .not('price', 'is', null)
    .order('deleted_at', { ascending: false })

  return (data ?? []).map((row: PantryItemHistory) => ({
    id: row.id,
    date: row.deleted_at.slice(0, 10),
    name: row.name,
    category: row.category,
    store: row.store,
    quantity: row.quantity ?? 1,
    price: (row.price ?? 0) * (row.quantity ?? 1),
    reason: row.reason,
  }))
}

/** Pull all pantry spending (for all-time reports / Sankey). */
export async function getAllPantrySpending(householdId: string): Promise<PantrySpendRow[]> {
  const { data } = await supabase
    .from('item_history')
    .select('*')
    .eq('household_id', householdId)
    .not('price', 'is', null)
    .order('deleted_at', { ascending: false })

  return (data ?? []).map((row: PantryItemHistory) => ({
    id: row.id,
    date: row.deleted_at.slice(0, 10),
    name: row.name,
    category: row.category,
    store: row.store,
    quantity: row.quantity ?? 1,
    price: (row.price ?? 0) * (row.quantity ?? 1),
    reason: row.reason,
  }))
}

/**
 * Convert pantry spend rows into transaction-shaped objects so they can be
 * included in the Reports Sankey alongside regular transactions.
 */
export function pantryRowsToTransactions(
  rows: PantrySpendRow[],
  householdId: string,
): Omit<Transaction, 'id' | 'created_at'>[] {
  return rows.map((row) => ({
    household_id: householdId,
    account_id: null,
    month_key: row.date.slice(0, 7),
    date: row.date,
    description: row.store ? `${row.name} (${row.store})` : row.name,
    amount: -Math.abs(row.price),   // expenses are negative
    category: row.category ?? 'Groceries',
    flow_type: 'expense' as const,
    source: 'pantry' as const,
    pantry_history_id: row.id,
  }))
}
