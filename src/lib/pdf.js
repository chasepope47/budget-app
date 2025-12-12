import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/build/pdf";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  parseDateCell,
  parseAmountCell,
  categorizeTransaction,
} from "./csv.js";

if (workerSrc && GlobalWorkerOptions) {
  GlobalWorkerOptions.workerSrc = workerSrc;
}

async function readPdfText(file) {
  const buffer =
    typeof file.arrayBuffer === "function"
      ? await file.arrayBuffer()
      : file;

  const pdf = await getDocument({ data: buffer }).promise;
  const chunks = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) {
      chunks.push(text);
    }
  }

  return chunks.join("\n");
}

function parseTransactionsFromTextBlock(text = "") {
  if (!text) return [];

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const datePattern =
    /^(\d{4}[\/-]\d{1,2}[\/-]\d{1,2}|\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/;
  const transactions = [];

  for (const rawLine of lines) {
    const dateMatch = rawLine.match(datePattern);
    if (!dateMatch) continue;

    const amountMatch = rawLine.match(
      /([-+]?\(?\$?\d[\d,]*(?:\.\d{2})?\)?)(?!.*[-+]?\(?\$?\d[\d,]*(?:\.\d{2})?\)?)/ // last number-like token
    );
    if (!amountMatch) continue;

    const normalizedDate = parseDateCell(dateMatch[0]);
    const normalizedAmount = parseAmountCell(amountMatch[0]);
    if (!normalizedDate || Number.isNaN(normalizedAmount)) continue;

    const description = rawLine
      .slice(dateMatch[0].length, rawLine.lastIndexOf(amountMatch[0]))
      .trim();

    transactions.push({
      date: normalizedDate,
      description: description || "Transaction",
      amount: normalizedAmount,
      category: categorizeTransaction(description, normalizedAmount),
    });
  }

  return transactions;
}

export async function parsePdfTransactions(file) {
  const text = await readPdfText(file);
  const rows = parseTransactionsFromTextBlock(text);
  return { text, rows };
}
