type Slice = { label: string; value: number; color: string }

type Props = {
  slices: Slice[]
  size?: number
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

export default function SpendingPieChart({ slices, size = 220 }: Props) {
  if (slices.length === 0) return null

  const total = slices.reduce((s, sl) => s + sl.value, 0)
  const cx = size / 2
  const cy = size / 2
  const r  = size * 0.38
  const ir = size * 0.22 // inner radius for donut

  // Build SVG arc paths
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
    <div className="flex flex-col sm:flex-row items-center gap-6">
      {/* Donut */}
      <div className="relative flex-shrink-0">
        <svg width={size} height={size}>
          {paths.map((sl) => (
            <path key={sl.label} d={sl.path} fill={sl.color} opacity={0.9} />
          ))}
          {/* centre text */}
          <text x={cx} y={cy - 8} textAnchor="middle" fill="#94a3b8" fontSize={11}>Total</text>
          <text x={cx} y={cy + 10} textAnchor="middle" fill="#f1f5f9" fontSize={14} fontWeight="bold">
            ${total.toFixed(0)}
          </text>
        </svg>
      </div>

      {/* Legend */}
      <div className="flex flex-col gap-2 w-full">
        {paths.map((sl) => {
          const pct = ((sl.value / total) * 100).toFixed(1)
          return (
            <div key={sl.label} className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: sl.color }} />
              <span className="flex-1 text-sm text-slate-300 truncate">{sl.label}</span>
              <span className="text-xs text-slate-500">{pct}%</span>
              <span className="text-sm font-semibold text-slate-100 w-20 text-right">${sl.value.toFixed(2)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
