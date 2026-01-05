// src/components/MiniDueCalendar.jsx
import React from "react";

function isoDay(date) {
  // returns YYYY-MM-DD in local time
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseISODateLocal(iso) {
  if (!iso || typeof iso !== "string") return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d);
  dt.setHours(0, 0, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
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
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
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

function fmtCompactMoney(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "$0";
  const abs = Math.abs(x);
  if (abs >= 1_000_000) return `$${(x / 1_000_000).toFixed(1)}m`;
  if (abs >= 1000) return `$${(x / 1000).toFixed(1)}k`;
  return `$${x.toFixed(0)}`;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export default function MiniDueCalendar({
  items, // preferred
  bills, // legacy
  selectedDateISO,
  onSelectDate = () => {},

  // ✅ parent-controlled month rollover
  visibleMonthISO, // "YYYY-MM-01" (or any ISO day in month)
  onVisibleMonthChange = () => {},

  badgeMode = "auto", // "auto" | "count" | "sum"
}) {
  const data = Array.isArray(items) ? items : Array.isArray(bills) ? bills : [];

  // ✅ derive month from visibleMonthISO if provided; otherwise selection; otherwise today
  const monthStart = React.useMemo(() => {
    const fromVisible = parseISODateLocal(visibleMonthISO);
    if (fromVisible) return startOfMonth(fromVisible);

    const fromSelected = parseISODateLocal(selectedDateISO);
    if (fromSelected) return startOfMonth(fromSelected);

    return startOfMonth(new Date());
  }, [visibleMonthISO, selectedDateISO]);

  const todayISO = isoDay(new Date());
  const totalDays = daysInMonth(monthStart);
  const firstWeekday = weekdayIndexSun0(monthStart);

  // dateISO -> { count, sum, hasAmount }
  const dueAggByDay = React.useMemo(() => {
    const map = new Map();

    for (const b of data) {
      const due = b?.dueDate;
      if (!due) continue;

      // Only bucket items that are in this visible month to avoid huge maps
      if (typeof due === "string" && due.slice(0, 7) !== isoDay(monthStart).slice(0, 7)) {
        // Still safe to skip: occurrences are already month-filtered in BudgetPage,
        // but this keeps the component robust if someone passes all months.
      }

      const prev = map.get(due) || { count: 0, sum: 0, hasAmount: false };
      const amt = Number(b?.amount);
      const hasAmount = Number.isFinite(amt);

      map.set(due, {
        count: prev.count + 1,
        sum: prev.sum + (hasAmount ? amt : 0),
        hasAmount: prev.hasAmount || hasAmount,
      });
    }

    return map;
  }, [data, monthStart]);

  // build calendar cells: leading blanks + 1..totalDays
  const cells = React.useMemo(() => {
    const out = [];
    for (let i = 0; i < firstWeekday; i++) out.push(null);
    for (let day = 1; day <= totalDays; day++) out.push(day);
    // always render full weeks (6 rows) so the card doesn’t “jump” between months
    const target = 42; // 6 * 7
    while (out.length < target) out.push(null);
    return out;
  }, [firstWeekday, totalDays]);

  const monthLabel = React.useMemo(
    () =>
      monthStart.toLocaleString(undefined, {
        month: "long",
        year: "numeric",
      }),
    [monthStart]
  );

  function dayToISO(dayNum) {
    const d = new Date(monthStart);
    d.setDate(dayNum);
    return isoDay(d);
  }

  function setMonth(nextDateObj) {
    const next = startOfMonth(nextDateObj);
    onVisibleMonthChange(isoDay(next)); // store as YYYY-MM-01
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

  // ✅ if selection changes to a different month and parent isn’t controlling month, keep it in sync
  React.useEffect(() => {
    if (!selectedDateISO) return;
    if (typeof visibleMonthISO === "string" && visibleMonthISO.length >= 7) return; // parent controls it
    const sel = parseISODateLocal(selectedDateISO);
    if (!sel) return;
    if (
      sel.getFullYear() !== monthStart.getFullYear() ||
      sel.getMonth() !== monthStart.getMonth()
    ) {
      setMonth(sel);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDateISO]);

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

        <div className="flex flex-col items-center min-w-0">
          <div className="text-sm font-semibold text-slate-100 truncate">{monthLabel}</div>
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
          if (!dayNum) {
            return (
              <div
                key={idx}
                className="h-9 rounded-xl border border-transparent bg-black/0"
              />
            );
          }

          const dayISO = dayToISO(dayNum);
          const agg = dueAggByDay.get(dayISO) || { count: 0, sum: 0, hasAmount: false };

          const isSelected = !!selectedDateISO && isSameDayISO(dayISO, selectedDateISO);
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

          // Subtle intensity for "busier" days
          const heat = clamp(agg.count, 0, 6);
          const heatClass =
            agg.count === 0
              ? "bg-black/20"
              : heat <= 2
              ? "bg-cyan-500/10"
              : heat <= 4
              ? "bg-cyan-500/15"
              : "bg-cyan-500/20";

          return (
            <button
              key={idx}
              type="button"
              onClick={() => onSelectDate(dayISO)}
              className={[
                "relative h-9 rounded-xl border text-xs transition",
                "border-slate-700/70 text-slate-100 hover:border-cyan-400/60",
                "flex items-center justify-center",
                heatClass,
                isSelected ? "border-cyan-400/80 ring-1 ring-cyan-300/25" : "",
                isToday ? "ring-1 ring-slate-400/40" : "",
              ].join(" ")}
              title={title}
            >
              <span className="text-xs font-semibold">{dayNum}</span>

              {agg.count > 0 && (
                <span
                  className={[
                    "absolute right-1.5 bottom-1.5 rounded-full border px-1.5 py-0.5 text-[10px] leading-none",
                    "border-slate-600/70 text-slate-200 bg-black/30",
                    isSelected ? "border-cyan-400/60 text-cyan-100" : "",
                  ].join(" ")}
                >
                  {badgeText}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between text-[0.65rem] text-slate-500">
        <span>Tip: tap a day to filter due items.</span>
        <span>
          Badges:{" "}
          <span className="text-slate-300">
            {badgeMode === "sum" ? "sum" : badgeMode === "count" ? "count" : "auto"}
          </span>
        </span>
      </div>
    </div>
  );
}
