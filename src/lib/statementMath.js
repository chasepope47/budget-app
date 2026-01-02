// src/lib/statementMath.js //
export function toNumber(val) {
  if (val == null) return null;
  const s = String(val).trim();
  if (!s) return null;
  const negParen = /^\(.*\)$/.test(s);
  const cleaned = s.replace(/[(),$]/g, "").replace(/\s+/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return negParen ? -n : n;
}

export function sumAmounts(rows, amountKey = "Amount") {
  let sum = 0;
  for (const r of rows || []) {
    const n = toNumber(r?.[amountKey]);
    if (Number.isFinite(n)) sum += n;
  }
  return sum;
}

export function parseISODate(s) {
  // expected "YYYY-MM-DD" but tolerate other date strings
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

export function getStatementDateRange(rows, dateKey = "Date") {
  let min = null;
  let max = null;
  for (const r of rows || []) {
    const d = parseISODate(r?.[dateKey]);
    if (!d) continue;
    if (!min || d < min) min = d;
    if (!max || d > max) max = d;
  }
  return { start: min, end: max };
}

export function isoDate(d) {
  if (!(d instanceof Date)) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function statementKeyFromRange(range) {
  // stable id so you can prevent duplicate imports
  if (!range?.start || !range?.end) return null;
  return `${isoDate(range.start)}_${isoDate(range.end)}`;
}
