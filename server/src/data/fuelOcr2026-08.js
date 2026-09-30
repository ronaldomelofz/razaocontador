// Valores extraídos dos cupons NFC-e (OCR/leitura documental) — 08/2026
// Gerado/revisado a partir de PDFs digitais + OCR dos digitalizados

export const FUEL_OCR_BY_FILENAME = {
  '22260855511095000108650020000398971260167660-nfe.pdf': {
    doc_date: '2026-08-26', doc_time: null, amount: 228.21,
    station: 'AVALLON COMBUSTIVEIS LTDA', product: 'Gasolina Comum', liters: 33.61,
    plate: null, payment: 'Cartão de Crédito', is_fuel: true, nf: null,
  },
  '22260855511095000108650030000111601420059775-nfe.pdf': {
    doc_date: '2026-08-27', doc_time: null, amount: 476.36,
    station: 'AVALLON COMBUSTIVEIS LTDA', product: 'Óleo Diesel B S10', liters: 61.151,
    plate: null, payment: 'Cartão de Crédito', is_fuel: true, nf: null,
  },
  'Digitalizado_20260810-1447.pdf': {
    doc_date: '2026-08-10', doc_time: '14:47', amount: 239.01,
    station: 'AVALLON COMBUSTIVEIS LTDA / POSTOS AVALLON', product: 'Gasolina Comum', liters: null,
    plate: null, payment: null, is_fuel: true,
  },
  'Digitalizado_20260811-1205.pdf': {
    doc_date: '2026-08-11', doc_time: '12:05', amount: 100.00,
    station: 'PLANALTO PETROLEO UNIAO LTDA', product: 'Diesel S10 Comum', liters: 13.717,
    plate: null, payment: 'Dinheiro', is_fuel: true,
  },
  'Digitalizado_20260812-1114.pdf': {
    doc_date: '2026-08-11', doc_time: '13:56', amount: 302.00,
    station: 'PLANALTO PETROLEO BOLA LTDA', product: 'Diesel S10 Aditivado', liters: 41.436,
    plate: null, payment: 'Dinheiro', is_fuel: true, nf: '000122657',
    note: 'Cupom emitido em 11/08/2026, digitalizado em 12/08/2026',
  },
  'Digitalizado_20260812-1115.pdf': {
    doc_date: '2026-08-11', doc_time: '10:36', amount: 101.00,
    station: 'PLANALTO PETROLEO BOLA LTDA', product: 'Diesel S10 Aditivado', liters: 13.812,
    plate: null, payment: 'Dinheiro', is_fuel: true, nf: '000122648',
    note: 'Cupom emitido em 11/08/2026, digitalizado em 12/08/2026',
  },
  'Digitalizado_20260813-1242.pdf': {
    doc_date: '2026-08-12', doc_time: '10:47', amount: 309.00,
    station: 'PLANALTO PETROLEO BOLA LTDA', product: 'Diesel S10 Aditivado', liters: 41.436,
    plate: null, payment: 'Dinheiro', is_fuel: true, nf: '000122697',
  },
  'Digitalizado_20260814-1613.pdf': {
    doc_date: '2026-08-14', doc_time: '16:03', amount: 239.96,
    station: 'MAXXI DM PETROLEO LTDA', product: 'Gasolina Comum', liters: 35.34,
    plate: null, payment: 'Cartão de Crédito', is_fuel: true,
  },
  'Digitalizado_20260818-1450.pdf': {
    doc_date: '2026-08-18', doc_time: '14:50', amount: 233.58,
    station: 'AVALLON COMBUSTIVEIS LTDA / POSTOS AVALLON', product: 'Gasolina Comum', liters: null,
    plate: null, payment: 'PIX', is_fuel: true,
    note: 'Valor conciliado com extrato (OCR do cupom digitalizado ilegível em parte)',
  },
  'Digitalizado_20260819-1229 (1).pdf': {
    doc_date: '2026-08-19', doc_time: '12:29', amount: 400.00,
    station: 'PLANALTO PETROLEO UNIAO LTDA', product: 'Diesel S10 Comum', liters: 54.87,
    plate: null, payment: 'Dinheiro', is_fuel: true,
  },
  'Digitalizado_20260819-1229.pdf': {
    doc_date: '2026-08-19', doc_time: '12:29', amount: 400.00,
    station: 'PLANALTO PETROLEO UNIAO LTDA', product: 'Diesel S10 Comum', liters: 54.87,
    plate: null, payment: 'Dinheiro', is_fuel: true,
  },
  'Digitalizado_20260826-1501.pdf': {
    doc_date: '2026-08-26', doc_time: '15:01', amount: 228.21,
    station: 'AVALLON COMBUSTIVEIS LTDA', product: 'Gasolina Comum', liters: 33.61,
    plate: null, payment: 'Cartão de Crédito', is_fuel: true,
  },
  'Digitalizado_20260827-0839.pdf': {
    doc_date: '2026-08-27', doc_time: '08:39', amount: 476.36,
    station: 'AVALLON COMBUSTIVEIS LTDA', product: 'Óleo Diesel B S10', liters: 61.151,
    plate: null, payment: 'Cartão de Crédito', is_fuel: true,
  },
  'Digitalizado_20260829-1032.pdf': {
    doc_date: '2026-08-28', doc_time: '14:18', amount: 408.45,
    station: 'PLANALTO PETROLEO UNIAO LTDA', product: 'Diesel S10 Comum', liters: 57.205,
    plate: null, payment: 'Dinheiro', is_fuel: true,
    note: 'Cupom emitido em 28/08/2026, digitalizado em 29/08/2026',
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
    status: record.ledger_entry_id ? 'conciliado' : (ocr.amount != null ? 'documento' : record.status),
  };
}
