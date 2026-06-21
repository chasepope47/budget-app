import { supabase, type ScheduledTemplate, type ScheduleCheck } from '../lib/supabase'

// ─── Templates ────────────────────────────────────────────────────────────────

export async function getScheduledTemplates(householdId: string): Promise<ScheduledTemplate[]> {
  const { data } = await supabase
    .from('scheduled_templates')
    .select('*')
    .eq('household_id', householdId)
    .order('created_at')
  return data ?? []
}

export async function addScheduledTemplate(
  template: Omit<ScheduledTemplate, 'id' | 'created_at'>,
): Promise<ScheduledTemplate> {
  const { data, error } = await supabase
    .from('scheduled_templates')
    .insert(template)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateScheduledTemplate(
  id: string,
  patch: Partial<Omit<ScheduledTemplate, 'id' | 'household_id' | 'created_at'>>,
): Promise<void> {
  await supabase.from('scheduled_templates').update(patch).eq('id', id)
}

export async function deleteScheduledTemplate(id: string): Promise<void> {
  // Cascade will clean up schedule_checks
  await supabase.from('scheduled_templates').delete().eq('id', id)
}

// ─── Checks ───────────────────────────────────────────────────────────────────

export async function getScheduleChecks(householdId: string): Promise<Record<string, boolean>> {
  const { data } = await supabase
    .from('schedule_checks')
    .select('template_id, due_date, paid')
    .eq('household_id', householdId)

  const map: Record<string, boolean> = {}
  for (const row of data ?? []) {
    map[`${row.template_id}|${row.due_date}`] = row.paid
  }
  return map
}

export async function setScheduleCheck(
  householdId: string,
  templateId: string,
  dueDate: string,
  paid: boolean,
): Promise<void> {
  await supabase
    .from('schedule_checks')
    .upsert(
      {
        household_id: householdId,
        template_id: templateId,
        due_date: dueDate,
        paid,
        paid_at: paid ? new Date().toISOString() : null,
      },
      { onConflict: 'template_id,due_date' },
    )
}
