export const FUEL_ACCOUNT = '4.02.01.01.06.0001';

const FUEL_TEXT_RE = /POSTOS?\s|POSTO\s|COMBUST|LUBRIFIC|GASOLINA|DIESEL|ABASTEC/i;

export function isFuelEntry(entry) {
  if (entry.debit_account?.startsWith('4.02.01.01.06')) return true;
  if (/combust/i.test(entry.category || '')) return true;
  const text = `${entry.description || ''} ${entry.counterparty || ''}`;
  return FUEL_TEXT_RE.test(text);
}
