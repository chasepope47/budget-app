import { supabase, type BudgetMonth, type BudgetItem } from '../lib/supabase'

// ─── Budget months ────────────────────────────────────────────────────────────

export async function getBudgetMonth(
  householdId: string,
  monthKey: string,
): Promise<BudgetMonth | null> {
  const { data } = await supabase
    .from('budget_months')
    .select('*')
    .eq('household_id', householdId)
    .eq('month_key', monthKey)
    .single()
  return data
}

export async function upsertBudgetMonth(
  householdId: string,
  monthKey: string,
  patch: Partial<Pick<BudgetMonth, 'estimated_income' | 'use_actual_income'>>,
): Promise<BudgetMonth> {
  const { data, error } = await supabase
    .from('budget_months')
    .upsert(
      { household_id: householdId, month_key: monthKey, ...patch, updated_at: new Date().toISOString() },
      { onConflict: 'household_id,month_key' },
    )
    .select()
    .single()
  if (error) throw error
  return data
}

// ─── Budget items ─────────────────────────────────────────────────────────────

export async function getBudgetItems(
  householdId: string,
  monthKey: string,
): Promise<BudgetItem[]> {
  const { data } = await supabase
    .from('budget_items')
    .select('*')
    .eq('household_id', householdId)
    .eq('month_key', monthKey)
    .order('created_at')
  return data ?? []
}

export async function addBudgetItem(
  householdId: string,
  monthKey: string,
  item: Pick<BudgetItem, 'category' | 'label' | 'amount' | 'template_id'>,
): Promise<BudgetItem> {
  const { data, error } = await supabase
    .from('budget_items')
    .insert({ household_id: householdId, month_key: monthKey, ...item })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateBudgetItem(
  id: string,
  patch: Partial<Pick<BudgetItem, 'label' | 'amount'>>,
): Promise<void> {
  await supabase.from('budget_items').update(patch).eq('id', id)
}

export async function deleteBudgetItem(id: string): Promise<void> {
  await supabase.from('budget_items').delete().eq('id', id)
}
