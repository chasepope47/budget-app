import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Props = {
  householdId: string
  monthKey: string
}

export default function PantryBudgetCard({ householdId, monthKey }: Props) {
  const [actual, setActual]   = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [goal, setGoal]       = useState<number>(() => {
    const raw = localStorage.getItem(`pantry_goal_${monthKey}`)
    return raw ? Number(raw) : 0
  })
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState('')

  useEffect(() => {
    const raw = localStorage.getItem(`pantry_goal_${monthKey}`)
    setGoal(raw ? Number(raw) : 0)
  }, [monthKey])

  useEffect(() => {
    setLoading(true)
    supabase
      .from('pantry_items')
      .select('price, quantity')
      .eq('household_id', householdId)
      .then(({ data }) => {
        const total = (data ?? []).reduce((s, i) => s + (i.price ?? 0) * (i.quantity ?? 1), 0)
        setActual(total)
        setLoading(false)
      })
  }, [householdId])

  function saveGoal() {
    const n = parseFloat(draft)
    if (!isNaN(n) && n >= 0) {
      setGoal(n)
      localStorage.setItem(`pantry_goal_${monthKey}`, String(n))
    }
    setEditing(false)
  }

  const pct      = goal > 0 && actual !== null ? Math.min((actual / goal) * 100, 100) : 0
  const over     = goal > 0 && actual !== null && actual > goal
  const nearLimit = goal > 0 && actual !== null && !over && pct >= 80

  const barColor = over ? 'bg-rose-500' : nearLimit ? 'bg-amber-400' : 'bg-cyan-500'
  const textColor = over ? 'text-rose-300' : nearLimit ? 'text-amber-300' : 'text-cyan-300'

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-100">🛒 Pantry Monthly Budget</h2>
        <button
          onClick={() => { setDraft(goal > 0 ? String(goal) : ''); setEditing(true) }}
          className="text-xs text-slate-400 hover:text-cyan-400 transition"
        >
          {goal > 0 ? 'Edit goal' : 'Set goal'}
        </button>
      </div>

      {editing ? (
        <div className="flex items-center gap-2">
          <span className="text-slate-400 text-sm">$</span>
          <input
            type="number"
            min={0}
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveGoal(); if (e.key === 'Escape') setEditing(false) }}
            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
            placeholder="e.g. 600"
          />
          <button onClick={saveGoal} className="px-3 py-1.5 text-xs bg-cyan-500 text-slate-900 rounded-lg font-semibold">Save</button>
          <button onClick={() => setEditing(false)} className="text-xs text-slate-500 hover:text-slate-300">Cancel</button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-xs text-slate-500 mb-0.5">Actual</div>
              <div className={`text-2xl font-bold ${textColor}`}>
                {loading ? '…' : `$${(actual ?? 0).toFixed(2)}`}
              </div>
            </div>
            {goal > 0 && (
              <div className="text-right">
                <div className="text-xs text-slate-500 mb-0.5">Goal</div>
                <div className="text-2xl font-bold text-slate-300">${goal.toFixed(2)}</div>
              </div>
            )}
          </div>

          {goal > 0 && (
            <>
              <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${barColor}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className={textColor}>
                  {over
                    ? `$${((actual ?? 0) - goal).toFixed(2)} over budget`
                    : nearLimit
                    ? `Almost at limit — $${(goal - (actual ?? 0)).toFixed(2)} remaining`
                    : `$${(goal - (actual ?? 0)).toFixed(2)} remaining`}
                </span>
                <span className="text-slate-500">{pct.toFixed(0)}%</span>
              </div>
            </>
          )}

          {goal === 0 && (
            <p className="text-xs text-slate-500">Set a monthly goal to track your pantry spending.</p>
          )}
        </div>
      )}
    </div>
  )
}
