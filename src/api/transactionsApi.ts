import { supabase, type Transaction } from '../lib/supabase'

export async function getTransactions(
  householdId: string,
  monthKey: string,
): Promise<Transaction[]> {
  const { data } = await supabase
    .from('transactions')
    .select('*')
    .eq('household_id', householdId)
    .eq('month_key', monthKey)
    .order('date', { ascending: false })
  return data ?? []
}

export async function getAllTransactions(householdId: string): Promise<Transaction[]> {
  const { data } = await supabase
    .from('transactions')
    .select('*')
    .eq('household_id', householdId)
    .order('date', { ascending: false })
  return data ?? []
}

export async function addTransaction(
  tx: Omit<Transaction, 'id' | 'created_at'>,
): Promise<Transaction> {
  const { data, error } = await supabase
    .from('transactions')
    .insert(tx)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function addTransactions(
  txs: Omit<Transaction, 'id' | 'created_at'>[],
): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .insert(txs)
    .select()
  if (error) throw error
  return data ?? []
}

export async function updateTransaction(
  id: string,
  patch: Partial<Pick<Transaction, 'description' | 'category' | 'flow_type' | 'amount' | 'date'>>,
): Promise<void> {
  await supabase.from('transactions').update(patch).eq('id', id)
}

export async function deleteTransaction(id: string): Promise<void> {
  await supabase.from('transactions').delete().eq('id', id)
}
