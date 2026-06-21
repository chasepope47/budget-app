import { useState } from 'react'
import type { User } from '../lib/supabase'

type ToastState = { kind: 'success' | 'error'; message: string } | null

type Props = {
  monthKey: string
  onSetMonthKey: (key: string) => void
  onToast: (t: ToastState) => void
  onOpenWorkspaceManager: () => void
}

function prevMonth(mk: string): string {
  const [y, m] = mk.split('-').map(Number)
  if (m === 1) return `${y - 1}-12`
  return `${y}-${String(m - 1).padStart(2, '0')}`
}

function nextMonth(mk: string): string {
  const [y, m] = mk.split('-').map(Number)
  if (m === 12) return `${y + 1}-01`
  return `${y}-${String(m + 1).padStart(2, '0')}`
}

export default function ActionsMenu({ monthKey, onSetMonthKey, onToast, onOpenWorkspaceManager }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button type="button"
        className="flex items-center justify-center w-9 h-9 rounded-full border border-slate-600/70 text-slate-300 hover:border-cyan-400/60 hover:text-cyan-200 transition"
        onClick={() => setOpen((p) => !p)}>
        <span className="relative flex flex-col justify-between w-4 h-3">
          <span className={`h-[2px] rounded-full bg-current transition-transform duration-200 ${open ? 'translate-y-[5px] rotate-45' : ''}`} />
          <span className={`h-[2px] rounded-full bg-current transition-opacity duration-200 ${open ? 'opacity-0' : 'opacity-100'}`} />
          <span className={`h-[2px] rounded-full bg-current transition-transform duration-200 ${open ? '-translate-y-[5px] -rotate-45' : ''}`} />
        </span>
      </button>

      <div className={`absolute right-0 mt-2 w-52 bg-[#0B0C14] border border-slate-700/70 rounded-lg shadow-lg z-50 text-xs origin-top-right transform transition-all duration-150 ${open ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto' : 'opacity-0 scale-95 -translate-y-1 pointer-events-none'}`}>
        {/* Month navigation */}
        <div className="px-3 py-2 border-b border-slate-800/70">
          <div className="text-[0.65rem] uppercase tracking-widest text-slate-500 mb-1.5">Month</div>
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={() => onSetMonthKey(prevMonth(monthKey))}
              className="px-2 py-1 rounded border border-slate-700 text-slate-300 hover:border-cyan-400/60 transition">←</button>
            <span className="text-slate-200 font-mono">{monthKey}</span>
            <button type="button" onClick={() => onSetMonthKey(nextMonth(monthKey))}
              className="px-2 py-1 rounded border border-slate-700 text-slate-300 hover:border-cyan-400/60 transition">→</button>
          </div>
        </div>

        <button type="button"
          className="w-full text-left px-3 py-2 hover:bg-slate-800/80 text-slate-200"
          onClick={() => { onOpenWorkspaceManager(); setOpen(false) }}>
          Manage Workspace
        </button>
      </div>
    </div>
  )
}
