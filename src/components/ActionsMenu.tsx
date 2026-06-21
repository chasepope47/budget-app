const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

type Props = {
  monthKey: string
  onSetMonthKey: (key: string) => void
  onOpenWorkspaceManager: () => void
}

function prevMonth(mk: string): string {
  const [y, m] = mk.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

function nextMonth(mk: string): string {
  const [y, m] = mk.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

function monthLabel(mk: string): string {
  const [y, m] = mk.split('-').map(Number)
  return `${MONTHS[m - 1]} ${y}`
}

export default function ActionsMenu({ monthKey, onSetMonthKey, onOpenWorkspaceManager }: Props) {
  return (
    <div className="flex items-center gap-1">
      <button type="button"
        onClick={() => onSetMonthKey(prevMonth(monthKey))}
        className="flex items-center justify-center w-7 h-7 rounded-full border border-slate-700 text-slate-400 hover:border-cyan-400/60 hover:text-cyan-300 transition text-sm">
        ‹
      </button>

      <span className="px-2 py-1 rounded-lg border border-slate-700 bg-slate-900/60 text-slate-200 text-xs font-medium min-w-[90px] text-center">
        {monthLabel(monthKey)}
      </span>

      <button type="button"
        onClick={() => onSetMonthKey(nextMonth(monthKey))}
        className="flex items-center justify-center w-7 h-7 rounded-full border border-slate-700 text-slate-400 hover:border-cyan-400/60 hover:text-cyan-300 transition text-sm">
        ›
      </button>

      <button type="button"
        onClick={onOpenWorkspaceManager}
        title="Manage Workspace"
        className="ml-1 flex items-center justify-center w-7 h-7 rounded-full border border-slate-700 text-slate-400 hover:border-cyan-400/60 hover:text-cyan-300 transition text-xs">
        ⚙
      </button>
    </div>
  )
}
