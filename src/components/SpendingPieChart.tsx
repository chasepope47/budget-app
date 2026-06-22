type Slice = { label: string; value: number; color: string }

type Props = {
  slices: Slice[]
  size?: number
  onSliceClick?: (label: string) => void
}

const COLORS = [
  '#22d3ee', // cyan
  '#818cf8', // indigo
  '#34d399', // emerald
  '#fb923c', // orange
  '#f472b6', // pink
  '#a78bfa', // violet
  '#facc15', // yellow
  '#60a5fa', // blue
]

export function buildSlices(buckets: Record<string, number>): Slice[] {
  return Object.entries(buckets)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], i) => ({ label, value, color: COLORS[i % COLORS.length] }))
}

export default function SpendingPieChart({ slices, size = 280, onSliceClick }: Props) {
  if (slices.length === 0) return null

  const total = slices.reduce((s, sl) => s + sl.value, 0)
  const cx = size / 2
  const cy = size / 2
  const r  = size * 0.40
  const ir = size * 0.24

  function polarToXY(angle: number, radius: number) {
    const rad = (angle - 90) * (Math.PI / 180)
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) }
  }

  function arcPath(startAngle: number, endAngle: number): string {
    const large = endAngle - startAngle > 180 ? 1 : 0
    const s  = polarToXY(startAngle, r)
    const e  = polarToXY(endAngle, r)
    const si = polarToXY(startAngle, ir)
    const ei = polarToXY(endAngle, ir)
    return [
      `M ${s.x} ${s.y}`,
      `A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`,
      `L ${ei.x} ${ei.y}`,
      `A ${ir} ${ir} 0 ${large} 0 ${si.x} ${si.y}`,
      'Z',
    ].join(' ')
  }

  let cursor = 0
  const paths = slices.map((sl) => {
    const angle = (sl.value / total) * 360
    const path  = arcPath(cursor, cursor + angle - 0.5)
    cursor += angle
    return { ...sl, path }
  })

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Donut — always centered */}
      <svg width={size} height={size} style={{ display: 'block', margin: '0 auto' }} className="cursor-pointer">
        {paths.map((sl) => (
          <path
            key={sl.label}
            d={sl.path}
            fill={sl.color}
            opacity={0.9}
            style={{ cursor: onSliceClick ? 'pointer' : 'default' }}
            onClick={() => onSliceClick?.(sl.label)}
            onMouseEnter={(e) => {
              if (onSliceClick) {
                e.currentTarget.style.opacity = '1'
                e.currentTarget.style.filter = 'brightness(1.2)'
              }
            }}
            onMouseLeave={(e) => {
              if (onSliceClick) {
                e.currentTarget.style.opacity = '0.9'
                e.currentTarget.style.filter = 'brightness(1)'
              }
            }}
          />
        ))}
        <text x={cx} y={cy - 10} textAnchor="middle" fill="#94a3b8" fontSize={13}>Total</text>
        <text x={cx} y={cy + 14} textAnchor="middle" fill="#f1f5f9" fontSize={Math.round(size * 0.072)} fontWeight="bold">
          ${total.toLocaleString('en-US', { maximumFractionDigits: 0 })}
        </text>
      </svg>

      {/* Legend — full width below chart */}
      <div className="w-full flex flex-col gap-2.5">
        {paths.map((sl) => {
          const pct = ((sl.value / total) * 100).toFixed(1)
          return (
            <button
              key={sl.label}
              onClick={() => onSliceClick?.(sl.label)}
              className={`flex items-center gap-3 p-2 rounded transition ${
                onSliceClick ? 'hover:bg-slate-900/50 cursor-pointer' : ''
              }`}
            >
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: sl.color }} />
              <span className="flex-1 text-sm text-slate-300 text-left">{sl.label}</span>
              <span className="text-xs text-slate-500 w-12 text-right">{pct}%</span>
              <span className="text-sm font-semibold text-slate-100 w-24 text-right">${sl.value.toFixed(2)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
