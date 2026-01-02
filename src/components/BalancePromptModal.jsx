// src/components/BalancePromptModal.jsx //
import React, { useEffect, useMemo, useState } from "react";

function formatMoney(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "";
  return x.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function parseMoney(input) {
  if (input == null) return null;
  const s = String(input).trim();
  if (!s) return null;

  // handle ($123.45) as negative
  const negParen = /^\(.*\)$/.test(s);
  const cleaned = s.replace(/[(),$]/g, "").replace(/\s+/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return negParen ? -n : n;
}

export default function BalancePromptModal({
  open,
  onClose,
  onConfirm,
  accountName,
  statementRangeLabel, // e.g., "Nov 1 – Nov 30, 2025"
  suggestedEndingBalance, // number or null
  transactionSum, // number (sum of amounts in statement)
}) {
  const [endingInput, setEndingInput] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    // prefill with suggestion if present
    setEndingInput(
      Number.isFinite(suggestedEndingBalance) ? String(suggestedEndingBalance) : ""
    );
  }, [open, suggestedEndingBalance]);

  const parsedEnding = useMemo(() => parseMoney(endingInput), [endingInput]);

  const computedStarting = useMemo(() => {
    if (!Number.isFinite(parsedEnding)) return null;
    // starting = ending - sum(transactions)
    return parsedEnding - (Number.isFinite(transactionSum) ? transactionSum : 0);
  }, [parsedEnding, transactionSum]);

  if (!open) return null;

  function handleConfirm() {
    setError("");
    const ending = parseMoney(endingInput);
    if (!Number.isFinite(ending)) {
      setError("Please enter a valid ending balance (example: 1284.32).");
      return;
    }
    onConfirm({
      endingBalance: ending,
      startingBalance: computedStarting,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-[92vw] max-w-xl rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Confirm statement balance</h2>
            <p className="text-sm text-gray-600 mt-1">
              This statement doesn’t include a running balance. Enter the{" "}
              <b>Ending Balance</b> shown on your statement so we can set the
              correct account balance.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-2">
          <div className="text-sm text-gray-700">
            <div>
              <b>Account:</b> {accountName || "New account"}
            </div>
            {statementRangeLabel ? (
              <div>
                <b>Statement:</b> {statementRangeLabel}
              </div>
            ) : null}
            {Number.isFinite(transactionSum) ? (
              <div>
                <b>Transactions total:</b> {formatMoney(transactionSum)}
              </div>
            ) : null}
          </div>

          {Number.isFinite(suggestedEndingBalance) ? (
            <button
              type="button"
              onClick={() => setEndingInput(String(suggestedEndingBalance))}
              className="w-full rounded-xl border px-3 py-2 text-left hover:bg-gray-50"
              title="Use last known ending balance"
            >
              Use last ending balance: <b>{formatMoney(suggestedEndingBalance)}</b>
            </button>
          ) : null}

          <label className="block text-sm font-medium mt-2">Ending Balance</label>
          <input
            value={endingInput}
            onChange={(e) => setEndingInput(e.target.value)}
            placeholder="e.g. 1284.32"
            className="w-full rounded-xl border px-3 py-2 outline-none focus:ring"
            inputMode="decimal"
          />

          {Number.isFinite(computedStarting) ? (
            <div className="text-sm text-gray-700">
              Starting balance will be: <b>{formatMoney(computedStarting)}</b>
            </div>
          ) : null}

          {error ? <div className="text-sm text-red-600">{error}</div> : null}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="rounded-xl px-4 py-2 text-sm bg-black text-white hover:opacity-90"
          >
            Confirm & Import
          </button>
        </div>
      </div>
    </div>
  );
}
