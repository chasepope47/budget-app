import { supabase, type Goal, type GoalContribution } from '../lib/supabase'

export async function getGoals(householdId: string): Promise<Goal[]> {
  const { data } = await supabase
    .from('goals')
    .select('*')
    .eq('household_id', householdId)
    .order('created_at')
  return data ?? []
}

export async function addGoal(
  goal: Omit<Goal, 'id' | 'created_at' | 'updated_at'>,
): Promise<Goal> {
  const { data, error } = await supabase
    .from('goals')
    .insert(goal)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateGoal(id: string, patch: Partial<Omit<Goal, 'id' | 'household_id' | 'created_at' | 'updated_at'>>): Promise<void> {
  await supabase
    .from('goals')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
}

export async function deleteGoal(id: string): Promise<void> {
  await supabase.from('goals').delete().eq('id', id)
}

export async function addContribution(
  contribution: Omit<GoalContribution, 'id' | 'created_at'>,
): Promise<GoalContribution> {
  const { data: contrib, error } = await supabase
    .from('goal_contributions')
    .insert(contribution)
    .select()
    .single()
  if (error) throw error

  // Update current_amount on the goal
  const { data: goal } = await supabase
    .from('goals')
    .select('current_amount')
    .eq('id', contribution.goal_id)
    .single()

  if (goal) {
    await supabase
      .from('goals')
      .update({
        current_amount: (goal.current_amount ?? 0) + contribution.amount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', contribution.goal_id)
  }

  return contrib
}

export async function getContributions(goalId: string): Promise<GoalContribution[]> {
  const { data } = await supabase
    .from('goal_contributions')
    .select('*')
    .eq('goal_id', goalId)
    .order('date', { ascending: false })
  return data ?? []
}

export async function recalculateGoalFromContributions(goalId: string): Promise<number> {
  const { data } = await supabase
    .from('goal_contributions')
    .select('amount')
    .eq('goal_id', goalId)
  const total = (data ?? []).reduce((s, c) => s + (Number(c.amount) ?? 0), 0)
  await supabase
    .from('goals')
    .update({ current_amount: total, updated_at: new Date().toISOString() })
    .eq('id', goalId)
  return total
}
