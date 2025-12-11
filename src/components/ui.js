// src/components/ui.js

// Simple currency formatter (USD by default)
export function formatCurrency(
  value,
  {
    currency = "USD",
    locale = "en-US",
    minimumFractionDigits = 2,
    maximumFractionDigits = 2,
  } = {}
) {
  const num = Number(value);
  if (Number.isNaN(num)) return "-";

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(num);
}

// Date formatter for transaction dates (string in → pretty string out)
export function formatDate(
  value,
  {
    locale = "en-US",
    options = { year: "numeric", month: "short", day: "2-digit" },
  } = {}
) {
  if (!value) return "-";

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return value; // fallback to raw

  return new Intl.DateTimeFormat(locale, options).format(date);
}

// Clamp a number between min and max
export function clamp(value, min = 0, max = 100) {
  const num = Number(value);
  if (Number.isNaN(num)) return min;
  return Math.min(max, Math.max(min, num));
}

// Simple unique ID helper
export function generateId(prefix = "id") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

// Debounce utility
export function debounce(fn, delay = 250) {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// Amount → Tailwind text color for transactions
export function getAmountColorClass(amount) {
  const num = Number(amount);
  if (Number.isNaN(num) || num === 0) return "text-slate-300";
  if (num < 0) return "text-rose-300";
  return "text-emerald-300";
}

// Move an item in an array (used in nav / dashboard reordering)
export function moveArrayItem(array, fromIndex, toIndex) {
  if (!Array.isArray(array)) return array;
  if (fromIndex === toIndex) return array;

  const copy = [...array];
  const item = copy.splice(fromIndex, 1)[0];
  copy.splice(toIndex, 0, item);
  return copy;
}

// groupBy helper
export function groupBy(array, keyFn) {
  const map = {};
  for (const item of array || []) {
    const key = keyFn(item);
    if (!map[key]) map[key] = [];
    map[key].push(item);
  }
  return map;
}
