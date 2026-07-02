/** ISO YYYY-MM-DD → DD/MM/YYYY */
export function fmtDate(iso) {
  if (!iso) return '—';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function fmt(n) {
  return (n ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

export function isUnclassified(entry) {
  return entry.status === 'manual_review'
    || entry.debit_account === '9.9.9.99'
    || entry.credit_account === '9.9.9.99'
    || /não classificado/i.test(entry.category || '');
}

/** Conta contábil que falta definir (contrapartida ao banco) */
export function pendingAccount(entry) {
  if (entry.debit_account === '9.9.9.99') return { side: 'debit', code: entry.debit_account, name: entry.debit_name };
  if (entry.credit_account === '9.9.9.99') return { side: 'credit', code: entry.credit_account, name: entry.credit_name };
  return null;
}

/** Conta de lançamento efetiva (contrapartida ao banco) */
export function postingAccount(entry) {
  const bankCoa = entry.bank_coa; // may not exist
  if (entry.debit_account !== '9.9.9.99' && entry.debit_account !== bankCoa) {
    return { code: entry.debit_account, name: entry.debit_name };
  }
  if (entry.credit_account !== '9.9.9.99') {
    return { code: entry.credit_account, name: entry.credit_name };
  }
  return null;
}
