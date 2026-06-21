import { supabase, type FinancialAccount, type StatementEntry } from '../lib/supabase'

export async function getAccounts(householdId: string): Promise<FinancialAccount[]> {
  const { data } = await supabase
    .from('financial_accounts')
    .select('*')
    .eq('household_id', householdId)
    .order('created_at')
  return data ?? []
}

export async function addAccount(
  account: Omit<FinancialAccount, 'id' | 'created_at'>,
): Promise<FinancialAccount> {
  const { data, error } = await supabase
    .from('financial_accounts')
    .insert(account)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateAccount(
  id: string,
  patch: Partial<Omit<FinancialAccount, 'id' | 'household_id' | 'created_at'>>,
): Promise<void> {
  const { error } = await supabase.from('financial_accounts').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteAccount(id: string): Promise<void> {
  const { error } = await supabase.from('financial_accounts').delete().eq('id', id)
  if (error) throw error
}

export async function applyStatementBalance(
  accountId: string,
  statementKey: string,
  entry: StatementEntry,
): Promise<void> {
  const { data: acc } = await supabase
    .from('financial_accounts')
    .select('statement_balances')
    .eq('id', accountId)
    .single()

  const existing = (acc?.statement_balances ?? {}) as Record<string, StatementEntry>
  const updated = { ...existing, [statementKey]: entry }

  const hasEnding = typeof entry.endingBalance === 'number' && Number.isFinite(entry.endingBalance)

  const { error } = await supabase.from('financial_accounts').update({
    statement_balances: updated,
    last_statement_key: statementKey,
    ...(hasEnding
      ? {
          last_confirmed_ending_balance: entry.endingBalance,
          current_balance: entry.endingBalance,
          current_balance_as_of: entry.endISO,
        }
      : {}),
  }).eq('id', accountId)
  if (error) throw error
}
