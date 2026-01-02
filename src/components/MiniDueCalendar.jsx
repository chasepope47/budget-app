// src/components/MiniDueCalendar.jsx //
import React from "react";

function isoDay(date) {
  // returns YYYY-MM-DD in local time
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function startOfMonth(date) {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addMonths(date, delta) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + delta);
  return d;
}

function daysInMonth(date) {
  const d = new Date(date);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function weekdayIndexSun0(date) {
  const d = new Date(date);
  return d.getDay(); // 0=Sun
}

function isSameDayISO(aISO, bISO) {
  return aISO === bISO;
}

export default function MiniDueCalendar({
  bills = [],
  selectedDateISO,
  onSelectDate = () => {},
  initialMonthISO, // optional: "2026-01-01"
}) {
  const [monthAnchor, setMonthAnchor] = React.useState(() => {
    const base = initialMonthISO ? new Date(initialMonthISO) : new Date();
    return startOfMonth(base);
  });

  const todayISO = isoDay(new Date());
  const monthStart = startOfMonth(monthAnchor);
  const totalDays = daysInMonth(monthStart);
  const firstWeekday = weekdayIndexSun0(monthStart); // padding

  // map dateISO -> count due
  const dueCountByDay = React.useMemo(() => {
    const map = new Map();
    for (const b of bills) {
      if (!b?.dueDate) continue;
      const key = b.dueDate;
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }, [bills]);

    React.useEffect(() => {
    if (!selectedDateISO) return;

    const sel = new Date(selectedDateISO);
    if (Number.isNaN(sel.getTime())) return;

    // if selected date's month differs from the currently shown month, jump to it
    if (
      sel.getFullYear() !== monthAnchor.getFullYear() ||
      sel.getMonth() !== monthAnchor.getMonth()
    ) {
      setMonthAnchor(startOfMonth(sel));
    }
  }, [selectedDateISO]); // intentionally not depending on monthAnchor to avoid loops

  // build calendar cells: leading blanks + 1..totalDays
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let day = 1; day <= totalDays; day++) cells.push(day);

  const monthLabel = monthStart.toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });

  function dayToISO(dayNum) {
    const d = new Date(monthStart);
    d.setDate(dayNum);
    return isoDay(d);
  }

  return (
    <div className="rounded-2xl border border-slate-700/70 bg-[#05060F] p-4">
      <div className="flex items-center justify-between">
        <button
          className="rounded-xl border border-slate-700/70 px-3 py-1 text-xs text-slate-200 hover:border-cyan-400/60"
          onClick={() => setMonthAnchor((m) => startOfMonth(addMonths(m, -1)))}
          type="button"
        >
          ◀
        </button>

        <div className="text-sm font-semibold text-slate-100">{monthLabel}</div>

        <button
          className="rounded-xl border border-slate-700/70 px-3 py-1 text-xs text-slate-200 hover:border-cyan-400/60"
          onClick={() => setMonthAnchor((m) => startOfMonth(addMonths(m, 1)))}
          type="button"
        >
          ▶
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-2 text-center text-[11px] text-slate-400">
        {["S", "M", "T", "W", "T", "F", "S"].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-7 gap-2">
        {cells.map((dayNum, idx) => {
          if (!dayNum)
            return <div key={idx} className="h-9 rounded-lg" />;

          const dayISO = dayToISO(dayNum);
          const count = dueCountByDay.get(dayISO) || 0;

          const isSelected = selectedDateISO && isSameDayISO(dayISO, selectedDateISO);
          const isToday = isSameDayISO(dayISO, todayISO);

          return (
            <button
              key={idx}
              type="button"
              onClick={() => onSelectDate(dayISO)}
              className={[
                "relative h-9 rounded-xl border text-xs transition",
                "border-slate-700/70 bg-black/20 text-slate-100 hover:border-cyan-400/60",
                isSelected ? "border-cyan-400/70 bg-cyan-500/10" : "",
                isToday ? "ring-1 ring-slate-400/40" : "",
              ].join(" ")}
              title={count ? `${count} due` : ""}
            >
              <span className="absolute left-2 top-2">{dayNum}</span>

              {count > 0 && (
                <span className="absolute right-2 bottom-2 rounded-full border border-slate-600/70 px-1.5 py-0.5 text-[10px] text-slate-200">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
