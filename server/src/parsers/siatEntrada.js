// server/src/parsers/siatEntrada.js
// Parser do Relatório SIAT (SEFAZ-PI) — "Consulta NF-e" tipo
// "01 - Notas Fiscais de Entrada para o Contribuinte".
// Arquivo típico: "RELATÓRIO SIAT MMYYYY - FALCÃO.xls" na pasta NOTAS FISCAL DE ENTRADA.
//
// O SIAT lista itens (linha a linha). Este parser agrega por NF + emitente.

import fs from 'node:fs';
import path from 'node:path';
import xlsx from 'xlsx';

function excelSerialToISO(n) {
  if (n == null || typeof n !== 'number') return null;
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000);
  return d.toISOString().slice(0, 10);
}

function excelSerialToISOLoose(v) {
  if (v == null) return null;
  if (typeof v === 'number') return excelSerialToISO(v);
  const s = String(v).trim();
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

/** Converte CFOP do emitente (saída 5xxx/6xxx) para CFOP de entrada do destinatário (1xxx/2xxx). */
export function toEntradaCfop(supplierCfop) {
  const c = String(supplierCfop || '').replace(/\D/g, '');
  if (c.length !== 4) return null;
  if (c.startsWith('5')) return `1${c.slice(1)}`;
  if (c.startsWith('6')) return `2${c.slice(1)}`;
  return c;
}

/**
 * @param {string} filePath caminho do .xls/.xlsx SIAT
 * @returns {{ meta: object, items: object[], notes: object[] }}
 */
export function parseSiatEntrada(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`SIAT não encontrado: ${filePath}`);
  const wb = xlsx.readFile(filePath);
  const sheetName = wb.SheetNames.find((n) => /consulta\s*nf/i.test(n)) || wb.SheetNames[0];
  const rows = xlsx.utils.sheet_to_json(wb.Sheets[sheetName], { defval: null, header: 1 });

  const meta = {
    source: path.basename(filePath),
    sheet: sheetName,
    tipoConsulta: null,
    cnpj: null,
    periodoEmissao: null,
  };
  for (const r of rows.slice(0, 14)) {
    if (!r) continue;
    const label = String(r[0] || '').toUpperCase();
    if (label.includes('TIPO DE CONSULTA')) meta.tipoConsulta = r[2];
    if (label.includes('CPF/CNPJ')) meta.cnpj = String(r[2] || '').replace(/\D/g, '');
    if (label.includes('DATA DE EMISSÃO')) meta.periodoEmissao = r[2];
  }

  let headerIdx = rows.findIndex((r) => r && String(r[0] || '').toUpperCase().includes('NÚM') && String(r[0] || '').toUpperCase().includes('NOTA'));
  if (headerIdx < 0) headerIdx = 13;

  const header = (rows[headerIdx] || []).map((c) => String(c || '').toUpperCase().normalize('NFD').replace(/\p{M}/gu, ''));
  const col = (...labels) => {
    for (const label of labels) {
      const i = header.findIndex((h) => h.includes(label));
      if (i >= 0) return i;
    }
    return -1;
  };

  // Layouts SIAT observados:
  // - legado (c/ MODELO + DESTINATÁRIO + UND/QTD/VLR UNIT)
  // - compacto set/out (sem destinatário; CFOP + VLR PROD + DATA ENTRADA)
  const iNf = col('NUM. NOTA', 'NUM NOTA') >= 0 ? col('NUM. NOTA', 'NUM NOTA') : 0;
  const iEmissao = col('DT. EMISSAO', 'DT EMISSAO', 'DATA DE EMISSAO');
  const iModelo = col('MODELO');
  const iEmitCnpj = col('EMITENTE');
  const iEmitName = (() => {
    // 1ª "RAZAO SOCIAL" após emitente
    const start = iEmitCnpj >= 0 ? iEmitCnpj + 1 : 0;
    for (let i = start; i < header.length; i++) {
      if (header[i].includes('RAZAO SOCIAL')) return i;
    }
    return -1;
  })();
  const iEmitUf = (() => {
    const start = iEmitName >= 0 ? iEmitName + 1 : 0;
    for (let i = start; i < header.length; i++) {
      if (header[i] === 'UF') return i;
    }
    return -1;
  })();
  const iDestCnpj = col('DESTINATARIO');
  const iItem = col('ITEM');
  const iProdCode = col('COD. PROD', 'COD PROD');
  const iProdDesc = col('DESCRICAO PROD', 'DESCRICAO');
  const iNcm = col('NCM');
  const iCfop = col('CFOP');
  const iUnd = col('UND');
  const iQty = col('QTD');
  const iUnit = col('VLR UNIT');
  const iProdVal = col('VLR PROD');
  const iCst = col('CST');
  const iDestinacao = col('DESTINACAO');
  const iDataEntrada = col('DATA ENTRADA', 'DATA DE ENTRADA');

  const items = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r[iNf] == null) continue;
    const nfRaw = r[iNf];
    if (typeof nfRaw !== 'number' && !/^\d+$/.test(String(nfRaw))) continue;

    const supplierCfop = iCfop >= 0 && r[iCfop] != null ? String(r[iCfop]).replace(/\D/g, '') : null;
    const emitCnpjRaw = iEmitCnpj >= 0 ? r[iEmitCnpj] : null;
    items.push({
      doc_number: String(parseInt(String(nfRaw), 10)),
      issue_date: excelSerialToISOLoose(iEmissao >= 0 ? r[iEmissao] : null),
      doc_model: iModelo >= 0 && r[iModelo] != null ? String(r[iModelo]) : '55',
      emit_cnpj: emitCnpjRaw ? String(emitCnpjRaw).replace(/\D/g, '') : null,
      emit_name: iEmitName >= 0 && r[iEmitName] ? String(r[iEmitName]).trim() : null,
      emit_uf: iEmitUf >= 0 && r[iEmitUf] ? String(r[iEmitUf]).trim() : null,
      dest_cnpj: iDestCnpj >= 0 && r[iDestCnpj] ? String(r[iDestCnpj]).replace(/\D/g, '') : null,
      dest_name: null,
      dest_uf: null,
      item: iItem >= 0 ? r[iItem] : null,
      prod_code: iProdCode >= 0 && r[iProdCode] != null ? String(r[iProdCode]) : null,
      prod_desc: iProdDesc >= 0 && r[iProdDesc] ? String(r[iProdDesc]).trim() : null,
      ncm: iNcm >= 0 && r[iNcm] != null ? String(r[iNcm]) : null,
      cfop_supplier: supplierCfop,
      cfop_entrada: toEntradaCfop(supplierCfop),
      und: iUnd >= 0 ? r[iUnd] : null,
      qty: iQty >= 0 ? Number(r[iQty]) || 0 : 0,
      unit_value: iUnit >= 0 ? Number(r[iUnit]) || 0 : 0,
      prod_value: iProdVal >= 0 ? Number(r[iProdVal]) || 0 : 0,
      cst: iCst >= 0 && r[iCst] != null ? String(r[iCst]) : null,
      destinacao: iDestinacao >= 0 && r[iDestinacao] ? String(r[iDestinacao]).trim() : null,
      data_entrada: excelSerialToISOLoose(iDataEntrada >= 0 ? r[iDataEntrada] : null),
    });
  }

  const byNf = new Map();
  for (const it of items) {
    const key = `${it.doc_number}|${it.emit_cnpj}`;
    if (!byNf.has(key)) {
      byNf.set(key, {
        doc_number: it.doc_number,
        doc_model: it.doc_model,
        issue_date: it.issue_date,
        counterparty_name: it.emit_name,
        counterparty_doc: it.emit_cnpj,
        emit_uf: it.emit_uf,
        dest_uf: it.dest_uf,
        doc_direction: 'entrada',
        cfops_supplier: new Set(),
        cfops_entrada: new Set(),
        destinacoes: new Set(),
        total_value: 0,
        item_count: 0,
        data_entrada: it.data_entrada,
        items: [],
      });
    }
    const g = byNf.get(key);
    g.total_value += it.prod_value;
    g.item_count += 1;
    if (it.cfop_supplier) g.cfops_supplier.add(it.cfop_supplier);
    if (it.cfop_entrada) g.cfops_entrada.add(it.cfop_entrada);
    if (it.destinacao) g.destinacoes.add(it.destinacao);
    if (it.data_entrada && !g.data_entrada) g.data_entrada = it.data_entrada;
    g.items.push({
      item: it.item,
      prod_code: it.prod_code,
      prod_desc: it.prod_desc,
      ncm: it.ncm,
      cfop_supplier: it.cfop_supplier,
      cfop_entrada: it.cfop_entrada,
      qty: it.qty,
      unit_value: it.unit_value,
      prod_value: it.prod_value,
      destinacao: it.destinacao,
    });
  }

  const notes = [...byNf.values()].map((n) => ({
    doc_number: n.doc_number,
    doc_model: n.doc_model,
    issue_date: n.issue_date,
    counterparty_name: n.counterparty_name,
    counterparty_doc: n.counterparty_doc,
    emit_uf: n.emit_uf,
    dest_uf: n.dest_uf,
    doc_direction: 'entrada',
    cfop: [...n.cfops_entrada][0] || null,
    cfops_entrada: [...n.cfops_entrada],
    cfops_supplier: [...n.cfops_supplier],
    destinacao: [...n.destinacoes].join(' | ') || null,
    destinacoes: [...n.destinacoes],
    total_value: Math.round(n.total_value * 100) / 100,
    item_count: n.item_count,
    data_entrada: n.data_entrada,
    // SIAT não traz ICMS/PIS/COFINS destacados — ficam null até cruzar com XML do fornecedor
    icms_value: null,
    pis_value: null,
    cofins_value: null,
    items: n.items,
  }));

  notes.sort((a, b) => String(a.issue_date).localeCompare(String(b.issue_date)) || String(a.doc_number).localeCompare(String(b.doc_number)));

  return { meta, items, notes };
}

/**
 * Filtra NF do SIAT pela data de ENTRADA (não emissão).
 * A pasta NOTAS FISCAL DE ENTRADA/MM-AAAA só deve alimentar a apuração do mês
 * com notas cuja data_entrada cai nesse mês. Notas sem data_entrada ficam de fora.
 */
export function filterNotesByDataEntrada(notes, month) {
  if (!month || !Array.isArray(notes)) return [];
  return notes.filter((n) => n.data_entrada && String(n.data_entrada).startsWith(month));
}

/** Localiza o arquivo SIAT na pasta do mês (rede ou local). */
export function findSiatFile(monthRootOrFiles) {
  const isSiatName = (name) => /\.xls/i.test(name) && /SIAT/i.test(name);

  if (Array.isArray(monthRootOrFiles)) {
    const inEntrada = monthRootOrFiles.find((f) =>
      isSiatName(f.name || f.path || '') && /NOTAS FISCAL(?:IS)? DE ENTRADA/i.test(f.path || ''),
    );
    if (inEntrada) return inEntrada;
    return monthRootOrFiles.find((f) => isSiatName(f.name || f.path || '')) || null;
  }

  const root = monthRootOrFiles;
  if (!fs.existsSync(root)) return null;

  // Pastas reais: "NOTAS FISCAL DE ENTRADA" (sing.) e "NOTAS FISCAIS DE ENTRADA"
  const entrada = fs.readdirSync(root).find((d) => /NOTAS FISCAL(?:IS)? DE ENTRADA/i.test(d));
  if (entrada) {
    const dir = path.join(root, entrada);
    const file = fs.readdirSync(dir).find((f) => isSiatName(f));
    if (file) return path.join(dir, file);
  }

  const rootFile = fs.readdirSync(root).find((f) => isSiatName(f));
  return rootFile ? path.join(root, rootFile) : null;
}

export default parseSiatEntrada;
