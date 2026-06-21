import { useEffect, useState } from 'react'
import FlowSankey from '../components/FlowSankey.jsx'
import { type Transaction } from '../lib/supabase'
import { getPantrySpendingForMonth, pantryRowsToTransactions } from '../lib/pantrySync'
import PantrySpendingReport from '../components/PantrySpendingReport'

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
function normalizeForDisplay(desc = '') {
  let s = String(desc).trim()
  s = s.replace(/[*#]{3,}\w{2,}$/g, '').trim()
  s = s.replace(/\b(?:\d{3,}|x{3,}\d+)\b/gi, '').trim()
  s = s.replace(/\s+/g, ' ')
  if (s.length > 28) s = s.slice(0, 26) + '…'
  return s || 'Uncategorized'
}

function bucketFor(matchText: string): string {
  const d = matchText.toLowerCase()
  if (TRANSFER.some((k) => d.includes(k)))      return 'Transfers'
  if (FIXED.some((k) => d.includes(k)))         return 'Fixed'
  if (SUBSCRIPTIONS.some((k) => d.includes(k))) return 'Subscriptions'
  if (ESSENTIAL.some((k) => d.includes(k)))     return 'Essential'
  return 'Variable'
}

function bucketForPantry(category: string | null): string {
  const c = (category ?? '').toLowerCase()
  if (['produce','dairy','meat & seafood','frozen','canned & jarred','grains & pasta','snacks','beverages','condiments','spices','baking'].some((k) => c.includes(k.split(' ')[0]))) {
    return 'Groceries'
  }
  return 'Groceries'
}

type SankeyData = {
  nodes: { name: string }[]
  links: { source: string; target: string; value: number }[]
  meta: { incomeTotal: number; spentTotal?: number; leftover?: number; groceriesTotal?: number }
}

function buildSankey(
  txs: Transaction[],
  pantryTxs: Transaction[],
  opts: { topNPerBucket: number; maxRows: number; includeTransfers: boolean; includePantry: boolean },
): SankeyData {
  const allTxs = opts.includePantry ? [...txs, ...pantryTxs] : txs
  const capped = allTxs.length > opts.maxRows ? allTxs.slice(-opts.maxRows) : allTxs

  const incomeTotal = capped.reduce((s, t) => s + (t.amount > 0 ? t.amount : 0), 0)

  const bucketTotals = new Map<string, number>()
  const bucketMerchants = new Map<string, Map<string, number>>()

  for (const t of capped) {
    const amt = t.amount
    if (!(amt < 0)) continue

    const isPantry = t.source === 'pantry'
    const matchText = normalizeForMatch(t.description)
    const merchant = isPantry
      ? normalizeForDisplay(t.description)
      : normalizeForDisplay(t.description)
    const bucket = isPantry ? bucketForPantry(t.category) : bucketFor(matchText)

    if (!opts.includeTransfers && bucket === 'Transfers') continue

    const v = Math.abs(amt)
    bucketTotals.set(bucket, (bucketTotals.get(bucket) ?? 0) + v)

    if (!bucketMerchants.has(bucket)) bucketMerchants.set(bucket, new Map())
    const m = bucketMerchants.get(bucket)!
    m.set(merchant, (m.get(merchant) ?? 0) + v)
  }

  if (incomeTotal <= 0 && bucketTotals.size === 0) {
    return { nodes: [], links: [], meta: { incomeTotal: 0 } }
  }

  const baseBuckets = opts.includeTransfers
    ? ['Fixed', 'Subscriptions', 'Essential', 'Groceries', 'Variable', 'Transfers']
    : ['Fixed', 'Subscriptions', 'Essential', 'Groceries', 'Variable']

  const activeBuckets = baseBuckets.filter((b) => (bucketTotals.get(b) ?? 0) > 0)
  const nodes: { name: string }[] = [{ name: 'Income' }, ...activeBuckets.map((b) => ({ name: b }))]
  const links: { source: string; target: string; value: number }[] = []

  for (const b of activeBuckets) {
    const v = bucketTotals.get(b) ?? 0
    if (v > 0) links.push({ source: 'Income', target: b, value: v })
  }

  function topN(m: Map<string, number>, n: number): [string, number][] {
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, n)
  }

  for (const b of activeBuckets) {
    const m = bucketMerchants.get(b)
    if (!m) continue
    for (const [merchant, v] of topN(m, opts.topNPerBucket)) {
      nodes.push({ name: merchant })
      links.push({ source: b, target: merchant, value: v })
    }
  }

  const nonTransferBuckets = activeBuckets.filter((b) => b !== 'Transfers')
  const spent = nonTransferBuckets.reduce((s, b) => s + (bucketTotals.get(b) ?? 0), 0)
  const leftover = Math.max(0, incomeTotal - spent)

  if (leftover > 0) {
    nodes.push({ name: 'Leftover' })
    links.push({ source: 'Income', target: 'Leftover', value: leftover })
  }

  const seen = new Set<string>()
  const uniqueNodes = nodes.filter((n) => { if (seen.has(n.name)) return false; seen.add(n.name); return true })

  return {
    nodes: uniqueNodes,
    links,
    meta: {
      incomeTotal,
      spentTotal: spent,
      leftover,
      groceriesTotal: bucketTotals.get('Groceries'),
    },
  }
}

const SETTINGS_KEY = 'budgetApp_reportSettings_v2'

export default function ReportsPage({ householdId, monthKey, month, transactions }: ReportsPageProps) {
  const [tab, setTab] = useState<'overview' | 'pantry' | 'groceries' | 'settings'>('overview')
  const [data, setData] = useState<SankeyData>({ nodes: [], links: [], meta: { incomeTotal: 0 } })
  const [pantryTxs, setPantryTxs] = useState<Transaction[]>([])
  const [pantryLoading, setPantryLoading] = useState(false)
  const [chartHeight, setChartHeight] = useState(560)

  type Settings = typeof DEFAULT_SETTINGS
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY)
      return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS }
    } catch { return { ...DEFAULT_SETTINGS } }
  })

  // Responsive chart height
  useEffect(() => {
    function compute() { setChartHeight(Math.max(380, Math.min(680, Math.round(window.innerHeight * 0.55)))) }
    compute()
    window.addEventListener('resize', compute)
    return () => window.removeEventListener('resize', compute)
  }, [])

  // Load pantry spending for this month
  useEffect(() => {
    if (!householdId || !settings.includePantry) { setPantryTxs([]); return }
    setPantryLoading(true)
    getPantrySpendingForMonth(householdId, monthKey)
      .then((rows) => setPantryTxs(pantryRowsToTransactions(rows, householdId) as Transaction[]))
      .catch(() => setPantryTxs([]))
      .finally(() => setPantryLoading(false))
  }, [householdId, monthKey, settings.includePantry])

  // Rebuild Sankey when data or settings change
  useEffect(() => {
    const id = setTimeout(() => {
      setData(buildSankey(transactions, pantryTxs, settings))
    }, 0)
    return () => clearTimeout(id)
  }, [transactions, pantryTxs, settings])

  // Persist settings
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

  const groceriesTotal = data.meta.groceriesTotal ?? 0
  const pantryItems = pantryTxs.length

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-100">{month} Reports</h1>
        <div className="inline-flex rounded-xl border border-slate-800 bg-slate-950/40 p-1">
          {(['overview', 'pantry', 'groceries', 'settings'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-sm rounded-lg capitalize transition ${tab === t ? 'bg-slate-900 text-slate-100' : 'text-slate-300 hover:text-slate-100'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {tab === 'overview' && (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-3">
          {settings.includePantry && pantryItems > 0 && (
            <div className="mb-3 flex items-center gap-2 px-1">
              <span className="text-xs text-slate-400">
                🥫 {pantryItems} pantry items included
                {groceriesTotal > 0 && (
                  <span className="ml-1 text-amber-300 font-medium">(${groceriesTotal.toFixed(2)} in groceries)</span>
                )}
              </span>
            </div>
          )}
          <div className="hScroll">
            <div style={{ minHeight: chartHeight }}>
              <FlowSankey data={data} height={chartHeight} onNodeClick={() => {}} />
            </div>
          </div>
        </div>
      )}

      {tab === 'pantry' && (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
          <h2 className="text-sm font-medium text-slate-100 mb-4">Pantry Spending by Store</h2>
          <PantrySpendingReport householdId={householdId} />
        </div>
      )}

      {tab === 'groceries' && (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-medium text-slate-100">Pantry Spending — {month}</h2>
            {pantryLoading && <span className="text-xs text-slate-400">Loading…</span>}
          </div>

          {!settings.includePantry && (
            <p className="text-xs text-slate-400">Enable "Include Pantry" in Settings to see grocery data.</p>
          )}

          {settings.includePantry && pantryTxs.length === 0 && !pantryLoading && (
            <p className="text-xs text-slate-400">
              No pantry spending recorded this month. Items consumed in the Pantry app appear here automatically.
            </p>
          )}

          {settings.includePantry && pantryTxs.length > 0 && (
            <>
              <div className="text-2xl font-semibold text-amber-300">${groceriesTotal.toFixed(2)}</div>
              <div className="text-xs text-slate-400">{pantryTxs.length} items consumed this month</div>

              <div className="max-h-72 overflow-auto rounded-lg border border-slate-800">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-900 text-slate-300 sticky top-0">
                    <tr>
                      <th className="px-3 py-1.5">Date</th>
                      <th className="px-3 py-1.5">Item</th>
                      <th className="px-3 py-1.5">Category</th>
                      <th className="px-3 py-1.5 text-right">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {pantryTxs.map((tx) => (
                      <tr key={tx.pantry_history_id ?? tx.id} className="hover:bg-slate-900/60">
                        <td className="px-3 py-1.5 text-slate-400">{tx.date}</td>
                        <td className="px-3 py-1.5 text-slate-200">{tx.description}</td>
                        <td className="px-3 py-1.5 text-slate-400">{tx.category ?? 'Groceries'}</td>
                        <td className="px-3 py-1.5 text-right text-rose-300">${Math.abs(tx.amount).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
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
