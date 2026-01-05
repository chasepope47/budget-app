// src/components/MiniDueCalendar.jsx
import React from "react";

function isoDay(date) {
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
  return d.getDay();
}

function isSameDayISO(aISO, bISO) {
  return aISO === bISO;
}

function fmtCompactMoney(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "$0";
  const abs = Math.abs(x);
  if (abs >= 1000) return `$${(x / 1000).toFixed(1)}k`;
  return `$${x.toFixed(0)}`;
}

function safeParseISO(iso) {
  if (!iso || typeof iso !== "string") return null;
  const dt = new Date(iso);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export default function MiniDueCalendar({
  items,
  bills,
  selectedDateISO,
  onSelectDate = () => {},

  // ✅ NEW: parent-controlled month
  visibleMonthISO,
  onVisibleMonthChange = () => {},

  badgeMode = "auto", // "auto" | "count" | "sum"
}) {
  const data = Array.isArray(items) ? items : Array.isArray(bills) ? bills : [];

  // ✅ Use parent month if provided, else derive from selection or today
  const monthAnchor = React.useMemo(() => {
    const fromVisible = safeParseISO(visibleMonthISO);
    if (fromVisible) return startOfMonth(fromVisible);

    const fromSelected = safeParseISO(selectedDateISO);
    if (fromSelected) return startOfMonth(fromSelected);

    return startOfMonth(new Date());
  }, [visibleMonthISO, selectedDateISO]);

  const todayISO = isoDay(new Date());
  const monthStart = monthAnchor;
  const totalDays = daysInMonth(monthStart);
  const firstWeekday = weekdayIndexSun0(monthStart);

  // dateISO -> { count, sum, hasAmount }
  const dueAggByDay = React.useMemo(() => {
    const map = new Map();
    for (const b of data) {
      if (!b?.dueDate) continue;
      const key = b.dueDate;
      const prev = map.get(key) || { count: 0, sum: 0, hasAmount: false };

      const amt = Number(b?.amount);
      const hasAmount = Number.isFinite(amt);

      map.set(key, {
        count: prev.count + 1,
        sum: prev.sum + (hasAmount ? amt : 0),
        hasAmount: prev.hasAmount || hasAmount,
      });
    }
    return map;
  }, [data]);

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

  function setMonth(nextDateObj) {
    const next = startOfMonth(nextDateObj);
    onVisibleMonthChange(isoDay(next)); // store as YYYY-MM-DD (day=01)
  }

  function goPrev() {
    setMonth(addMonths(monthStart, -1));
  }

  function goNext() {
    setMonth(addMonths(monthStart, 1));
  }

  function goToday() {
    const d = new Date();
    setMonth(d);
    onSelectDate(isoDay(d));
  }

  return (
    <div className="rounded-2xl border border-slate-700/70 bg-[#05060F] p-4">
      <div className="flex items-center justify-between gap-2">
        <button
          className="rounded-xl border border-slate-700/70 px-3 py-1 text-xs text-slate-200 hover:border-cyan-400/60 transition"
          onClick={goPrev}
          type="button"
          aria-label="Previous month"
        >
          ◀
        </button>

        <div className="flex flex-col items-center">
          <div className="text-sm font-semibold text-slate-100">{monthLabel}</div>
          <button
            type="button"
            onClick={goToday}
            className="mt-1 text-[0.65rem] text-slate-400 hover:text-cyan-200 transition"
          >
            Today
          </button>
        </div>

        <button
          className="rounded-xl border border-slate-700/70 px-3 py-1 text-xs text-slate-200 hover:border-cyan-400/60 transition"
          onClick={goNext}
          type="button"
          aria-label="Next month"
        >
          ▶
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-2 text-center text-[11px] text-slate-400">
        {["S", "M", "T", "W", "T", "F", "S"].map((d) => (
          <div key={d} className="h-9 flex items-center justify-center">
            {d}
          </div>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-7 gap-2">
        {cells.map((dayNum, idx) => {
          if (!dayNum) return <div key={idx} className="h-9 rounded-lg" />;

          const dayISO = dayToISO(dayNum);
          const agg =
            dueAggByDay.get(dayISO) || { count: 0, sum: 0, hasAmount: false };

          const isSelected = selectedDateISO && isSameDayISO(dayISO, selectedDateISO);
          const isToday = isSameDayISO(dayISO, todayISO);

          const preferSum =
            badgeMode === "sum" || (badgeMode === "auto" && agg.hasAmount);
          const badgeText = preferSum ? fmtCompactMoney(agg.sum) : String(agg.count);

          const title =
            agg.count > 0
              ? agg.hasAmount
                ? `${agg.count} due • $${Number(agg.sum).toFixed(2)}`
                : `${agg.count} due`
              : "";

          return (
            <button
              key={idx}
              type="button"
              onClick={() => onSelectDate(dayISO)}
              className={[
                "relative h-9 rounded-xl border text-xs transition",
                "border-slate-700/70 bg-black/20 text-slate-100 hover:border-cyan-400/60",
                "flex items-center justify-center",
                isSelected ? "border-cyan-400/70 bg-cyan-500/10" : "",
                isToday ? "ring-1 ring-slate-400/40" : "",
              ].join(" ")}
              title={title}
            >
              <span className="text-xs font-semibold">{dayNum}</span>

              {agg.count > 0 && (
                <span className="badge-chip absolute right-2 bottom-2 rounded-full border px-1.5 py-0.5 text-[10px]">
                  {badgeText}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
