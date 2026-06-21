import { supabase, type Household, type HouseholdMember, type HouseholdInvite } from '../lib/supabase'

function generateCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export async function ensureHousehold(userId: string, email: string): Promise<string> {
  const { data: existing } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', userId)
    .single()

  if (existing) return existing.household_id

  const { data: household, error } = await supabase
    .from('households')
    .insert({ name: 'My Budget', created_by: userId })
    .select()
    .single()

  if (error || !household) throw new Error(error?.message ?? 'Failed to create household')

  await supabase.from('household_members').insert({
    household_id: household.id,
    user_id: userId,
    email,
    role: 'owner',
  })

  return household.id
}

export async function getHousehold(householdId: string): Promise<Household | null> {
  const { data } = await supabase
    .from('households')
    .select('*')
    .eq('id', householdId)
    .single()
  return data
}

export async function renameHousehold(householdId: string, name: string): Promise<void> {
  await supabase.from('households').update({ name }).eq('id', householdId)
}

export async function getMembers(householdId: string): Promise<HouseholdMember[]> {
  const { data } = await supabase
    .from('household_members')
    .select('*')
    .eq('household_id', householdId)
  return data ?? []
}

export async function removeMember(householdId: string, userId: string): Promise<void> {
  await supabase
    .from('household_members')
    .delete()
    .eq('household_id', householdId)
    .eq('user_id', userId)
}

export async function createInviteCode(householdId: string, userId: string): Promise<string> {
  // Deactivate previous unused codes
  await supabase
    .from('household_invites')
    .delete()
    .eq('household_id', householdId)
    .is('used_by', null)

  const code = generateCode()
  const { error } = await supabase.from('household_invites').insert({
    household_id: householdId,
    created_by: userId,
    code,
  })
  if (error) throw new Error('Failed to create invite code')
  return code
}

export type JoinResult = 'ok' | 'invalid' | 'expired' | 'already_member'

export async function joinByCode(
  code: string,
  userId: string,
  email: string,
): Promise<{ result: JoinResult; householdId?: string }> {
  const { data: invite } = await supabase
    .from('household_invites')
    .select('*')
    .eq('code', code.toUpperCase().trim())
    .is('used_by', null)
    .single()

  if (!invite) return { result: 'invalid' }
  if (new Date(invite.expires_at) < new Date()) return { result: 'expired' }

  const { data: alreadyMember } = await supabase
    .from('household_members')
    .select('id')
    .eq('household_id', invite.household_id)
    .eq('user_id', userId)
    .single()

  if (alreadyMember) return { result: 'already_member', householdId: invite.household_id }

  // Leave current household
  const { data: current } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', userId)
    .single()

  if (current) {
    const { count } = await supabase
      .from('household_members')
      .select('*', { count: 'exact', head: true })
      .eq('household_id', current.household_id)

    await supabase
      .from('household_members')
      .delete()
      .eq('household_id', current.household_id)
      .eq('user_id', userId)

    if ((count ?? 0) <= 1) {
      await supabase.from('households').delete().eq('id', current.household_id)
    }
  }

  // Join new household
  await supabase.from('household_members').insert({
    household_id: invite.household_id,
    user_id: userId,
    email,
    role: 'member',
  })

  // Mark invite used
  await supabase
    .from('household_invites')
    .update({ used_by: userId })
    .eq('id', invite.id)

  return { result: 'ok', householdId: invite.household_id }
}

export async function leaveHousehold(householdId: string, userId: string): Promise<string> {
  const { count } = await supabase
    .from('household_members')
    .select('*', { count: 'exact', head: true })
    .eq('household_id', householdId)

  await supabase
    .from('household_members')
    .delete()
    .eq('household_id', householdId)
    .eq('user_id', userId)

  if ((count ?? 0) <= 1) {
    await supabase.from('households').delete().eq('id', householdId)
  }

  // Create a new solo household for the user
  const { data: newHousehold } = await supabase
    .from('households')
    .insert({ name: 'My Budget', created_by: userId })
    .select()
    .single()

  const newId = newHousehold!.id
  await supabase.from('household_members').insert({
    household_id: newId,
    user_id: userId,
    role: 'owner',
  })

  return newId
}
