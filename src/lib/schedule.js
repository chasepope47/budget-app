// src/lib/schedule.js
const DAY_MS = 24 * 60 * 60 * 1000;

function parseISODate(iso) {
  if (!iso || typeof iso !== "string") return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d);
  if (Number.isNaN(dt.getTime())) return null;
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function formatISODate(date) {
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function daysInMonth(year, monthIndex) {
  // monthIndex: 0-11
  return new Date(year, monthIndex + 1, 0).getDate();
}

function clampDay(year, monthIndex, day) {
  const max = daysInMonth(year, monthIndex);
  return Math.min(Math.max(1, day), max);
}

export function checkKey(templateId, dueDateISO) {
  return `${templateId}|${dueDateISO}`;
}

/**
 * Expand a list of recurring templates into concrete occurrences for a month.
 * @param {Array} templates
 * @param {string} monthKey - "YYYY-MM"
 * @returns {Array<{templateId: string, dueDate: string, label: string, amount: number, kind: string, source: string}>}
 */
export function expandTemplatesForMonth(templates = [], monthKey) {
  const list = Array.isArray(templates) ? templates : [];

  const normalizedMonthKey = (() => {
    if (monthKey instanceof Date) {
      const y = monthKey.getFullYear();
      const m = String(monthKey.getMonth() + 1).padStart(2, "0");
      return `${y}-${m}`;
    }
    if (typeof monthKey === "string") {
      // accept YYYY-MM or YYYY-MM-DD
      const slice = monthKey.slice(0, 10);
      const m = slice.match(/^(\d{4})-(\d{2})/);
      if (m) return `${m[1]}-${m[2]}`;
    }
    return null;
  })();

  const m = normalizedMonthKey ? normalizedMonthKey.match(/^(\d{4})-(\d{2})$/) : null;
  if (!m) return [];

  const year = Number(m[1]);
  const monthIndex = Number(m[2]) - 1; // 0-based
  const monthStart = new Date(year, monthIndex, 1);
  monthStart.setHours(0, 0, 0, 0);
  const monthEnd = new Date(year, monthIndex, daysInMonth(year, monthIndex));
  monthEnd.setHours(0, 0, 0, 0);
  const monthIndexValue = year * 12 + monthIndex;

  const occurrences = [];

  const addOccurrence = (tmpl, dateObj) => {
    const dueDate = formatISODate(dateObj);
    occurrences.push({
      templateId: tmpl.id,
      dueDate,
      label: tmpl.label || "Due item",
      amount: Number.isFinite(Number(tmpl.amount)) ? Number(tmpl.amount) : 0,
      kind: tmpl.kind || "expense",
      source: tmpl.source || "transaction",
    });
  };

  for (const tmpl of list) {
    if (!tmpl || !tmpl.id || !tmpl.startDate) continue;
    const start = parseISODate(tmpl.startDate);
    if (!start) continue;

    const cadence = String(tmpl.cadence || "once").toLowerCase();
    const baseDay = Number.isFinite(Number(tmpl.dayOfMonth))
      ? Number(tmpl.dayOfMonth)
      : start.getDate();
    const startIndex = start.getFullYear() * 12 + start.getMonth();

    if (cadence === "once") {
      if (start >= monthStart && start <= monthEnd) addOccurrence(tmpl, start);
      continue;
    }

    if (cadence === "weekly" || cadence === "biweekly") {
      const intervalDays = cadence === "weekly" ? 7 : 14;
      let cursor = new Date(start);

      if (cursor < monthStart) {
        const diffDays = Math.ceil((monthStart - cursor) / DAY_MS);
        const steps = Math.max(0, Math.ceil(diffDays / intervalDays));
        cursor = new Date(cursor.getTime() + steps * intervalDays * DAY_MS);
      }

      while (cursor <= monthEnd) {
        if (cursor >= start) addOccurrence(tmpl, cursor);
        cursor = new Date(cursor.getTime() + intervalDays * DAY_MS);
      }
      continue;
    }

    if (cadence === "monthly") {
      if (monthIndexValue < startIndex) continue;
      const day = clampDay(year, monthIndex, baseDay);
      const due = new Date(year, monthIndex, day);

      if (monthIndexValue === startIndex && due < start) continue;
      addOccurrence(tmpl, due);
      continue;
    }

    if (cadence === "yearly") {
      if (start.getMonth() !== monthIndex) continue;
      if (year < start.getFullYear()) continue;

      const day = clampDay(year, monthIndex, baseDay);
      const due = new Date(year, monthIndex, day);
      if (year === start.getFullYear() && due < start) continue;
      addOccurrence(tmpl, due);
      continue;
    }

    // default fallback: treat unknown cadence as once
    if (start >= monthStart && start <= monthEnd) addOccurrence(tmpl, start);
  }

  return occurrences;
}
