// server/src/engine/reconcile.js
// Cruza raw_transactions (banco) com fiscal_documents (NF-e/NFC-e) e boletos,
// usando valor + janela de data + (quando disponível) CNPJ/CPF da contraparte.

import dayjs from 'dayjs';

const DATE_WINDOW_DAYS = 3;
const DATE_WINDOW_SUPPLIER_DAYS = 15;
const VALUE_TOLERANCE = 0.02; // tolerância de R$0,02 (arredondamento)

function sameValue(a, b) {
  return Math.abs(Math.abs(a) - Math.abs(b)) <= VALUE_TOLERANCE;
}

function withinWindow(dateA, dateB, days = DATE_WINDOW_DAYS) {
  return Math.abs(dayjs(dateA).diff(dayjs(dateB), 'day')) <= days;
}

/**
 * @param {Array} bankTxs   raw_transactions do período (não conciliados)
 * @param {Array} fiscalDocs fiscal_documents do período
 * @returns {Array} matches [{ raw_transaction_id, fiscal_document_id, match_type, match_score }]
 */
export function matchBankToFiscal(bankTxs, fiscalDocs) {
  const matches = [];
  const usedFiscal = new Set();

  function scorePair(tx, doc, maxDays) {
    if (!sameValue(tx.amount, doc.total_value)) return null;
    const issueOk = withinWindow(tx.tx_date, doc.issue_date, maxDays);
    const entradaOk = doc.data_entrada && withinWindow(tx.tx_date, doc.data_entrada, maxDays);
    if (!issueOk && !entradaOk) return null;
    const docMatch =
      tx.counterparty_doc && doc.counterparty_doc && tx.counterparty_doc === doc.counterparty_doc;
    let score = docMatch ? 1.0 : 0.7;
    if (entradaOk && !issueOk) score -= 0.05;
    if (maxDays > DATE_WINDOW_DAYS) score -= 0.1;
    return score;
  }

  for (const windowDays of [DATE_WINDOW_DAYS, DATE_WINDOW_SUPPLIER_DAYS]) {
    for (const tx of bankTxs) {
      if (matches.some((m) => m.raw_transaction_id === tx.id)) continue;
      let best = null;
      for (const doc of fiscalDocs) {
        if (usedFiscal.has(doc.id)) continue;
        const score = scorePair(tx, doc, windowDays);
        if (score == null) continue;
        if (!best || score > best.score) best = { doc, score };
      }
      if (best) {
        matches.push({
          raw_transaction_id: tx.id,
          fiscal_document_id: best.doc.id,
          match_type: best.score >= 0.95 ? 'exact' : 'fuzzy',
          match_score: Math.round(best.score * 100) / 100,
        });
        usedFiscal.add(best.doc.id);
      }
    }
  }
  return matches;
}

/** Concilia repasses de cartão: soma de vendas por forma de pagamento (cartão) vs. crédito bancário do concentrador */
export function matchCardSettlements(bankTxs, cardSalesTotalsByDate) {
  // cardSalesTotalsByDate: { 'YYYY-MM-DD': totalVendasCartaoNoDia }
  const out = [];
  for (const tx of bankTxs) {
    const expected = cardSalesTotalsByDate[tx.tx_date];
    if (expected == null) continue;
    out.push({
      tx_date: tx.tx_date,
      bank_amount: tx.amount,
      expected_sales: expected,
      diff: +(tx.amount - expected).toFixed(2),
      status: Math.abs(tx.amount - expected) <= VALUE_TOLERANCE ? 'ok' : 'diverge ⚠️',
    });
  }
  return out;
}
