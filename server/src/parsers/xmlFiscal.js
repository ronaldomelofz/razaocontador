// server/src/parsers/xmlFiscal.js
// Parser de XML de NF-e (modelo 55) e NFC-e (modelo 65).
// Também aceita o relatório consolidado do Alterdata (XLSX "FATURAMENTO FISCAL") via parseAlterdataFaturamento.

import fs from 'node:fs';
import { XMLParser } from 'fast-xml-parser';
import xlsx from 'xlsx';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

const COMPANY_CNPJ = '10876822000194';

function cleanCnpj(v) {
  return String(v ?? '').replace(/\D/g, '');
}

export function parseNFeXML(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const json = parser.parse(raw);
  const infNFe = json?.nfeProc?.NFe?.infNFe ?? json?.NFe?.infNFe;
  if (!infNFe) return null;

  const ide = infNFe.ide;
  const emit = infNFe.emit;
  const dest = infNFe.dest;
  const total = infNFe.total?.ICMSTot;
  const det = Array.isArray(infNFe.det) ? infNFe.det[0] : infNFe.det;
  const cfop = det?.prod?.CFOP;

  const emitCnpj = cleanCnpj(emit?.CNPJ || emit?.CPF);
  const destCnpj = cleanCnpj(dest?.CNPJ || dest?.CPF);
  let doc_direction = 'saida';
  let counterparty_name = dest?.xNome ?? null;
  let counterparty_doc = dest?.CNPJ ?? dest?.CPF ?? null;
  if (destCnpj === COMPANY_CNPJ) {
    doc_direction = 'entrada';
    counterparty_name = emit?.xNome ?? null;
    counterparty_doc = emit?.CNPJ ?? emit?.CPF ?? null;
  } else if (emitCnpj === COMPANY_CNPJ) {
    doc_direction = 'saida';
    counterparty_name = dest?.xNome ?? null;
    counterparty_doc = dest?.CNPJ ?? dest?.CPF ?? null;
  }

  return {
    doc_number: ide?.nNF != null ? String(parseInt(ide.nNF, 10)) : null,
    doc_model: ide?.mod != null ? String(parseInt(String(ide.mod).split('.')[0], 10)) : null,
    cfop: cfop ? String(cfop) : null,
    issue_date: ide?.dhEmi ? ide.dhEmi.slice(0, 10) : null,
    counterparty_name,
    counterparty_doc,
    doc_direction,
    total_value: total?.vNF ? Number(total.vNF) : null,
    icms_value: total?.vICMS ? Number(total.vICMS) : null,
    pis_value: total?.vPIS ? Number(total.vPIS) : null,
    cofins_value: total?.vCOFINS ? Number(total.vCOFINS) : null,
    cancelled: false,
    payment_method: null, // preencher a partir de infNFe.pag se disponível
  };
}

/** Relatório consolidado Alterdata "FATURAMENTO FISCAL MMYYYY.xlsx" — usar quando XML individual não estiver disponível */
export function parseAlterdataFaturamento(filePath) {
  const wb = xlsx.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: null });
  const money = (v) => (v ? Number(String(v).replace('R$', '').replace(/\./g, '').replace(',', '.').trim()) : null);

  return rows
    .filter((r) => r['Número Nota Fiscal'])
    .map((r) => ({
      doc_number: String(r['Número Nota Fiscal']),
      doc_model: String(r['Modelo']),
      cfop: r['CFOP'] ? String(r['CFOP']) : null,
      issue_date: r['Emissão Eletrônica'] ? String(r['Emissão Eletrônica']).slice(0, 10).split('/').reverse().join('-') : null,
      counterparty_name: r['Nome da pessoa'] ?? null,
      counterparty_doc: null,
      total_value: money(r['Valor Total Geral']),
      icms_value: money(r['Valor ICMS']),
      pis_value: money(r['Valor PIS']),
      cofins_value: money(r['Valor Cofins']),
      cancelled: !!r['Docum. Cancelado'],
      payment_method: null,
    }));
}

/** CFOPs que NÃO devem entrar na base de receita de vendas (remessa, retorno, devolução) */
export const NON_SALE_CFOPS = new Set(['5551', '5552', '5922', '5923', '5929', '5949']);

export function isSaleDocument(doc) {
  return !doc.cancelled && !NON_SALE_CFOPS.has(doc.cfop);
}
