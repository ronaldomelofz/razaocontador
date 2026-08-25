// Valores extraídos dos cupons NFC-e (OCR/leitura documental) — 06/2026
// Chave: nome do arquivo na pasta COMBUSTÍVEL

export const FUEL_OCR_BY_FILENAME = {
  'combustível 062026.pdf': {
    doc_date: '2026-06-03', doc_time: '11:32', amount: 400.0,
    station: 'PLANALTO PETROLEO UNIAO LTDA', product: 'Diesel S10 Comum', liters: 54.87,
    plate: 'RSR2F17', payment: 'Dinheiro',
  },
  'combustível 09062026.pdf': {
    doc_date: '2026-06-09', doc_time: '17:35', amount: 235.15,
    station: 'MAXXI DM PETROLEO LTDA', product: 'Gasolina Comum', liters: 35.15,
    plate: null, payment: 'Cartão de Crédito',
  },
  'COMBUSTÍVEL 223439 .pdf': {
    doc_date: '2026-06-01', doc_time: '10:54', amount: 385.09,
    station: 'PLANALTO PETROLEO BOLA LTDA', product: 'Diesel S10 Aditivado', liters: 52.97,
    plate: 'RSS1D29', payment: 'Dinheiro', nf: '000223439',
  },
  'combustível 399132.pdf': {
    doc_date: '2026-06-12', doc_time: '11:55', amount: 400.0,
    station: 'PLANALTO PETROLEO UNIAO LTDA', product: 'Diesel S10 Comum', liters: 54.87,
    plate: 'RSR2F17', payment: 'Dinheiro', nf: '000399132',
  },
  'Digitalizado_20260616-1520.pdf': {
    doc_date: '2026-06-09', doc_time: '17:35', amount: 235.15,
    station: 'MAXXI DM PETROLEO LTDA', product: 'Gasolina Comum', liters: 35.15,
    plate: null, payment: 'Cartão de Crédito', note: 'Duplicata digital do cupom 09062026',
  },
  'Scan_20260617_130032.jpg': {
    doc_date: '2026-06-16', doc_time: '10:31', amount: 250.0,
    station: 'PLANALTO PETROLEO BOLA LTDA', product: 'Diesel S10 Aditivado', liters: 34.388,
    plate: 'RSS1D29', payment: 'Dinheiro',
  },
  'Scan_20260617_151142.jpg': {
    doc_date: '2026-06-17', doc_time: '13:54', amount: 247.63,
    station: 'POSTOS AVALLON', product: 'Gasolina Comum', liters: 35.941,
    plate: null, payment: 'Cartão Mastercard',
  },
  'Scan_20260624_102848.jpg': {
    doc_date: '2026-06-23', doc_time: '10:19', amount: 150.0,
    station: 'PLANALTO PETRO BOLA LTDA', product: 'Diesel S10 Aditivado', liters: 20.633,
    plate: 'RSS1D29', payment: 'Dinheiro',
  },
  'Scan_20260624_144751.jpg': {
    doc_date: '2026-06-24', doc_time: '14:34', amount: 236.53,
    station: 'POSTOS AVALLON', product: 'Gasolina Comum', liters: 34.33,
    plate: null, payment: 'PIX',
  },
  'Scan_20260625_103138.jpg': {
    doc_date: '2026-06-24', doc_time: '10:28', amount: 400.0,
    station: 'PLANALTO PETROLEO UNIAO LTDA', product: 'Diesel S10 Comum', liters: 54.87,
    plate: 'RSR2F17', payment: 'Dinheiro',
  },
  'Scan_20260626_101342.jpg': {
    doc_date: '2026-06-25', doc_time: '14:53', amount: 160.0,
    station: 'CD FERRAGENS LTDA', product: 'Cola instantânea (não é combustível)', liters: null,
    plate: null, payment: 'Não identificado', is_fuel: false,
  },
  'Scan_20260629_080957.jpg': {
    doc_date: '2026-06-26', doc_time: '10:55', amount: 400.0,
    station: 'PLANALTO PETROLEO BOLA LTDA', product: 'Diesel S10 Aditivado', liters: 55.02,
    plate: 'RSS1D29', payment: 'Dinheiro',
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
