import { useEffect, useMemo, useState } from 'react'
import { type Transaction } from '../lib/supabase'
import { getPantrySpendingForMonth, pantryRowsToTransactions } from '../lib/pantrySync'
import PantrySpendingReport from '../components/PantrySpendingReport'
import SpendingPieChart, { buildSlices } from '../components/SpendingPieChart'

type ReportsPageProps = {
  householdId: string
  monthKey: string
  month: string
  transactions: Transaction[]
}

const DEFAULT_SETTINGS = {
  topNPerBucket: 10,
  maxRows: 20000,
  includeTransfers: true,
  includePantry: true,
  preset: 'Detailed',
}

const PRESETS: Record<string, typeof DEFAULT_SETTINGS> = {
  Minimal:  { topNPerBucket: 5,  maxRows: 10000,  includeTransfers: false, includePantry: true,  preset: 'Minimal'  },
  Detailed: { topNPerBucket: 12, maxRows: 60000,  includeTransfers: true,  includePantry: true,  preset: 'Detailed' },
  Audit:    { topNPerBucket: 30, maxRows: 200000, includeTransfers: true,  includePantry: true,  preset: 'Audit'    },
}

const FIXED        = ['rent','mortgage','apts','apt','apartment','lease','property management','hoa','insurance','internet','phone','utilities','loan','payment']
const SUBSCRIPTIONS= ['amazon prime','prime membership','netflix','hulu','spotify','youtube premium','rocket money','membership','subscription','icloud','google one','dropbox']
const ESSENTIAL    = ['grocery','groceries','costco','walmart','gas','fuel','medical','pharmacy','power','water']
const TRANSFER     = ['transfer','zelle','venmo','cash app','withdrawal','deposit']

function normalizeForMatch(desc = '') { return String(desc).trim().toLowerCase().replace(/\s+/g, ' ') }

function bucketFor(matchText: string): string {
  const d = matchText.toLowerCase()
  if (TRANSFER.some((k) => d.includes(k)))      return 'Transfers'
  if (FIXED.some((k) => d.includes(k)))         return 'Fixed'
  if (SUBSCRIPTIONS.some((k) => d.includes(k))) return 'Subscriptions'
  if (ESSENTIAL.some((k) => d.includes(k)))     return 'Essential'
  return 'Variable'
}

const SETTINGS_KEY = 'budgetApp_reportSettings_v2'

function OverviewTab({ transactions, pantryTxs, month, includePantry }: {
  transactions: Transaction[]
  pantryTxs: Transaction[]
  month: string
  includePantry: boolean
}) {
  const slices = useMemo(() => {
    const all = includePantry ? [...transactions, ...pantryTxs] : transactions
    const buckets: Record<string, number> = {}
    for (const t of all) {
      if (t.amount >= 0) continue
      const isPantry = t.source === 'pantry'
      const bucket = isPantry ? 'Groceries' : bucketFor(normalizeForMatch(t.description))
      buckets[bucket] = (buckets[bucket] ?? 0) + Math.abs(t.amount)
    }
    return buildSlices(buckets)
  }, [transactions, pantryTxs, includePantry])

  const total = slices.reduce((s, sl) => s + sl.value, 0)
  const income = transactions.reduce((s, t) => s + (t.amount > 0 ? t.amount : 0), 0)

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5 space-y-5">
      {/* Header stats */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-100">{month} Spending</h2>
        {income > 0 && (
          <div className="text-right">
            <div className="text-xs text-slate-500">Income</div>
            <div className="text-sm font-semibold text-emerald-300">${income.toLocaleString('en-US', { maximumFractionDigits: 2 })}</div>
          </div>
        )}
      </div>

      {slices.length === 0
        ? <p className="text-sm text-slate-400 py-8 text-center">No expenses recorded this month.</p>
        : (
          <div className="flex justify-center">
            <div className="w-full max-w-sm">
              <SpendingPieChart slices={slices} size={300} />
            </div>
          </div>
        )
      }

      {income > 0 && total > 0 && (
        <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>Total spent: <span className="text-rose-300 font-semibold">${total.toFixed(2)}</span></span>
          <span>Leftover: <span className="text-emerald-300 font-semibold">${Math.max(0, income - total).toFixed(2)}</span></span>
        </div>
      )}
    </div>
  )
}

export default function ReportsPage({ householdId, monthKey, month, transactions }: ReportsPageProps) {
  const [tab, setTab] = useState<'overview' | 'pantry' | 'settings'>('overview')
  const [pantryTxs, setPantryTxs] = useState<Transaction[]>([])

  type Settings = typeof DEFAULT_SETTINGS
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY)
      return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS }
    } catch { return { ...DEFAULT_SETTINGS } }
  })

  useEffect(() => {
    if (!householdId || !settings.includePantry) { setPantryTxs([]); return }
    getPantrySpendingForMonth(householdId, monthKey)
      .then((rows) => setPantryTxs(pantryRowsToTransactions(rows, householdId) as Transaction[]))
      .catch(() => setPantryTxs([]))
  }, [householdId, monthKey, settings.includePantry])

  useEffect(() => {
    const t = setTimeout(() => {
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) } catch {}
    }, 300)
    return () => clearTimeout(t)
  }, [settings])

  function applyPreset(name: string) {
    const p = PRESETS[name]
    if (p) setSettings((s) => ({ ...s, ...p }))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-100">{month} Reports</h1>
        <div className="inline-flex rounded-xl border border-slate-800 bg-slate-950/40 p-1">
          {(['overview', 'pantry', 'settings'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-sm rounded-lg capitalize transition ${tab === t ? 'bg-slate-900 text-slate-100' : 'text-slate-300 hover:text-slate-100'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {tab === 'overview' && <OverviewTab transactions={transactions} pantryTxs={pantryTxs} month={month} includePantry={settings.includePantry} />}

      {tab === 'pantry' && (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
          <h2 className="text-sm font-medium text-slate-100 mb-4">Pantry Spending by Store</h2>
          <PantrySpendingReport householdId={householdId} />
        </div>
      )}

      {tab === 'settings' && (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 space-y-5">
          <div className="space-y-2">
            <div className="text-sm font-medium text-slate-100">Presets</div>
            <div className="flex flex-wrap gap-2">
              {['Minimal', 'Detailed', 'Audit'].map((name) => (
                <button key={name} onClick={() => applyPreset(name)}
                  className="text-sm px-3 py-2 rounded-md border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-100">
                  {name}
                </button>
              ))}
              <button onClick={() => setSettings({ ...DEFAULT_SETTINGS, preset: 'Custom' })}
                className="text-sm px-3 py-2 rounded-md border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-100">
                Reset
              </button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-slate-100 text-sm font-medium">Top merchants per bucket</label>
              <input type="number" min={1} max={50}
                value={settings.topNPerBucket}
                onChange={(e) => setSettings((s) => ({ ...s, topNPerBucket: Math.max(1, Math.min(50, Number(e.target.value))), preset: 'Custom' }))}
                className="w-full bg-slate-900 border border-slate-800 rounded-md px-3 py-2 text-slate-100" />
            </div>

            <div className="space-y-2">
              <label className="text-slate-100 text-sm font-medium">Max rows to process</label>
              <input type="number" min={1000} max={200000} step={1000}
                value={settings.maxRows}
                onChange={(e) => setSettings((s) => ({ ...s, maxRows: Math.max(1000, Math.min(200000, Number(e.target.value))), preset: 'Custom' }))}
                className="w-full bg-slate-900 border border-slate-800 rounded-md px-3 py-2 text-slate-100" />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-slate-100 text-sm font-medium">Include Transfers</p>
                <p className="text-slate-400 text-xs">Show "Transfers" bucket in the Sankey.</p>
              </div>
              <input type="checkbox" checked={!!settings.includeTransfers}
                onChange={(e) => setSettings((s) => ({ ...s, includeTransfers: e.target.checked, preset: 'Custom' }))}
                className="h-5 w-5" />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-slate-100 text-sm font-medium">Include Pantry Spending</p>
                <p className="text-slate-400 text-xs">Overlay grocery data from your Pantry app.</p>
              </div>
              <input type="checkbox" checked={!!settings.includePantry}
                onChange={(e) => setSettings((s) => ({ ...s, includePantry: e.target.checked, preset: 'Custom' }))}
                className="h-5 w-5" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
