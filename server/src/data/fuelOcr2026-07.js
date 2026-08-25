// Valores extraídos dos cupons NFC-e (OCR/leitura documental) — 07/2026
// Chave: nome do arquivo na pasta COMBUSTÍVEL

export const FUEL_OCR_BY_FILENAME = {
  'Digitalizado_20260702-1405.pdf': {
    doc_date: '2026-07-01', doc_time: '15:57', amount: 216.00,
    station: 'CD FERRAGENS LTDA', product: 'Selante fixa tudo + Cola instantânea (não é combustível)', liters: null,
    plate: null, payment: 'PIX', is_fuel: false, nf: '000003829',
  },
  'Digitalizado_20260704-0919.pdf': {
    doc_date: '2026-07-03', doc_time: '12:16', amount: 400.00,
    station: 'PLANALTO PETROLEO UNIAO LTDA', product: 'Diesel S10 Comum', liters: 54.87,
    plate: 'RSR2F17', payment: 'Dinheiro', nf: '000402558',
  },
  'Digitalizado_20260707-1239.pdf': {
    doc_date: '2026-07-06', doc_time: '11:53', amount: 400.00,
    station: 'PLANALTO PETROLEO BOLA LTDA', product: 'Diesel S10 Aditivado', liters: 55.02,
    plate: 'RSS1D29', payment: 'Dinheiro', nf: '000120936',
  },
  'Digitalizado_20260708-0719.pdf': {
    doc_date: '2026-07-08', doc_time: '06:42', amount: 163.14,
    station: 'POSTO AEROPOSTO COMERCIO LTDA', product: 'Etanol Comum', liters: 33.638,
    plate: null, payment: 'Dinheiro', nf: '000007360',
  },
  'Digitalizado_20260711-1234.pdf': {
    doc_date: '2026-06-21', doc_time: '09:26', amount: 209.80,
    station: 'POSTO HOMERO CASTELO BRANCO LTDA', product: 'Gasolina Comum', liters: 30.45,
    plate: null, payment: 'Cartão de Crédito', nf: '000528168',
    note: 'Cupom emitido em 21/06/2026 (mês anterior), digitalizado em 11/07/2026 — conferir fatura do cartão',
  },
  'Digitalizado_20260711-1235.pdf': {
    doc_date: '2026-05-31', doc_time: '08:30', amount: 240.04,
    station: 'POSTO HOMERO CASTELO BRANCO LTDA', product: 'Gasolina Comum', liters: 35.881,
    plate: null, payment: 'Cartão de Crédito', nf: '000524094',
    note: 'Cupom emitido em 31/05/2026 (dois meses antes), digitalizado em 11/07/2026 — conferir fatura do cartão',
  },
  'Digitalizado_20260718-0726.pdf': {
    doc_date: '2026-07-16', doc_time: '08:56', amount: 364.50,
    station: 'PLANALTO PETROLEO UNIAO LTDA', product: 'Diesel S10 Comum', liters: 50.00,
    plate: 'RSR2F17', payment: 'Dinheiro', nf: '000404336',
  },
  'Digitalizado_20260718-0940.pdf': {
    doc_date: '2026-07-16', doc_time: '08:42', amount: 300.00,
    station: 'PLANALTO PETROLEO BOLA LTDA', product: 'Diesel S10 Aditivado', liters: 41.265,
    plate: 'RSS1D29', payment: 'Dinheiro', nf: '000000949',
  },
  'Digitalizado_20260718-0941.pdf': {
    doc_date: '2026-07-16', doc_time: '11:08', amount: 70.01,
    station: 'PLANALTO PETROLEO BOLA LTDA', product: 'Diesel S10 Aditivado', liters: 9.630,
    plate: 'RSS1D29', payment: 'Dinheiro', nf: '000121457',
  },
  'Digitalizado_20260723-0746.pdf': {
    doc_date: '2026-07-22', doc_time: '17:14', amount: 238.67,
    station: 'POSTO FLEX - PRIMAVERA (SIG PETROLEO LTDA)', product: 'Gasolina Comum', liters: 35.151,
    plate: null, payment: 'Dinheiro', nf: '000117301',
  },
  'Digitalizado_20260724-1102.pdf': {
    doc_date: '2026-07-23', doc_time: '10:46', amount: 400.00,
    station: 'PLANALTO PETROLEO BOLA LTDA', product: 'Diesel S10 Aditivado', liters: 55.02,
    plate: 'RSS1D29', payment: 'Dinheiro', nf: '000121772',
  },
  'Digitalizado_20260731-1144.pdf': {
    doc_date: '2026-07-30', doc_time: '10:45', amount: 400.00,
    station: 'PLANALTO PETROLEO UNIAO LTDA', product: 'Diesel S10 Comum', liters: 54.87,
    plate: 'RSR2F17', payment: 'Dinheiro', nf: '000525515',
  },
  'Digitalizado_20260801-1123.pdf': {
    doc_date: '2026-07-31', doc_time: '10:16', amount: 380.00,
    station: 'PLANALTO PETROLEO BOLA LTDA', product: 'Diesel S10 Aditivado', liters: 52.27,
    plate: 'RSS1D29', payment: 'Dinheiro', nf: '000000359',
    note: 'Digitalizado em 01/08/2026 (cupom de 31/07/2026)',
  },
  'Digitalizado_20260801-1125.pdf': {
    doc_date: '2026-07-31', doc_time: '17:18', amount: 212.35,
    station: 'AVALLON COMBUSTIVEIS LTDA', product: 'Gasolina Comum', liters: 30.821,
    plate: null, payment: 'Cartão de Débito', nf: '000031451',
    note: 'Digitalizado em 01/08/2026 (cupom de 31/07/2026)',
  },
  'gás para empilhadeira.pdf': {
    doc_date: '2026-07-06', doc_time: null, amount: 250.00,
    station: 'E CRISTINA DA SILVA EIRELI', product: 'GLP botijão 20kg — gás para empilhadeira (não é combustível veicular)', liters: null,
    plate: null, payment: 'A prazo', is_fuel: false, nf: '000013206',
  },
};

export function enrichFuelRecord(record) {
  const ocr = FUEL_OCR_BY_FILENAME[record.file_name];
  if (!ocr) return record;
  return {
    ...record,
    doc_date: ocr.doc_date || record.doc_date,
    doc_time: ocr.doc_time || record.doc_time,
    amount: ocr.amount ?? record.amount,
    station: ocr.station || record.station,
    product: ocr.product,
    liters: ocr.liters,
    plate: ocr.plate,
    payment: ocr.payment,
    is_fuel: ocr.is_fuel !== false,
    note: ocr.note,
    nf: ocr.nf,
    status: record.ledger_entry_id ? 'conciliado' : (ocr.amount ? 'documento' : record.status),
  };
}
