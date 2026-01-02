// src/hook/useStatementImport.js //
import { useMemo, useState } from "react";
import {
  getStatementDateRange,
  isoDate,
  statementKeyFromRange,
  sumAmounts,
} from "../lib/statementMath.js";

/**
 * Persistence adapters (swap these for Firestore/Supabase/local)
 */
async function upsertAccount(account) {
  // TODO: replace with your real persistence
  // return savedAccount (with id)
  return account;
}

async function saveTransactions(accountId, rows) {
  // TODO: replace with your real persistence
  // rows should include accountId when you store them
  return true;
}

async function saveStatementImport(record) {
  // TODO: replace with your real persistence
  return record;
}

export function useStatementImport({ existingAccounts = [] }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [pending, setPending] = useState(null); // holds parsed rows + target account details
  const [busy, setBusy] = useState(false);

  const accountsById = useMemo(() => {
    const m = new Map();
    for (const a of existingAccounts || []) m.set(a.id, a);
    return m;
  }, [existingAccounts]);

  function beginImport({ rows, accountId, newAccountName }) {
    const range = getStatementDateRange(rows, "Date");
    const statementKey = statementKeyFromRange(range);
    const transactionSum = sumAmounts(rows, "Amount");

    const existingAccount = accountId ? accountsById.get(accountId) : null;

    setPending({
      rows,
      accountId: existingAccount?.id || null,
      newAccountName: newAccountName || "",
      existingAccount,
      range,
      statementKey,
      transactionSum,
    });

    // For your USAA export, we ALWAYS need user ending balance
    setModalOpen(true);
  }

  async function confirmAndFinalize({ endingBalance, startingBalance }) {
    if (!pending) return;

    setBusy(true);
    try {
      const { rows, existingAccount, accountId, newAccountName, range, statementKey, transactionSum } =
        pending;

      const startISO = range?.start ? isoDate(range.start) : null;
      const endISO = range?.end ? isoDate(range.end) : null;

      // 1) Create or update account
      const baseAccount = existingAccount || {
        id: accountId || crypto.randomUUID(),
        name: newAccountName || "New Account",
        currentBalance: 0,
        lastConfirmedEndingBalance: null,
        lastStatementEndISO: null,
      };

      // 2) Safety: only update balance if statement is newer
      const prevEnd = baseAccount.lastStatementEndISO;
      const isNewer = !prevEnd || (endISO && endISO > prevEnd);

      const nextAccount = {
        ...baseAccount,
        // always store last confirmed ending for suggestion UX
        lastConfirmedEndingBalance: endingBalance,
        // only update current balance if statement end is newer
        currentBalance: isNewer ? endingBalance : baseAccount.currentBalance,
        lastStatementEndISO: isNewer && endISO ? endISO : baseAccount.lastStatementEndISO,
      };

      const savedAccount = await upsertAccount(nextAccount);

      // 3) Save transactions (attach accountId)
      await saveTransactions(savedAccount.id, rows);

      // 4) Save statement import record (for dedupe + history)
      await saveStatementImport({
        id: statementKey || crypto.randomUUID(),
        accountId: savedAccount.id,
        startISO,
        endISO,
        transactionSum,
        endingBalance,
        startingBalance,
        createdAtISO: new Date().toISOString(),
      });

      // done
      setModalOpen(false);
      setPending(null);

      return { ok: true, account: savedAccount };
    } catch (e) {
      console.error(e);
      return { ok: false, error: e };
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    setModalOpen(false);
    setPending(null);
  }

  const modalProps = useMemo(() => {
    const p = pending;
    const suggested = p?.existingAccount?.lastConfirmedEndingBalance ?? null;

    const rangeLabel =
      p?.range?.start && p?.range?.end
        ? `${p.range.start.toLocaleDateString()} – ${p.range.end.toLocaleDateString()}`
        : "";

    return {
      open: modalOpen,
      accountName: p?.existingAccount?.name || p?.newAccountName || "New account",
      statementRangeLabel: rangeLabel,
      suggestedEndingBalance: suggested,
      transactionSum: p?.transactionSum ?? 0,
    };
  }, [pending, modalOpen]);

  return {
    beginImport,
    confirmAndFinalize,
    cancel,
    busy,
    modalProps,
    pending,
  };
}
