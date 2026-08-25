// server/src/engine/buildCompleteAssessment.js
// Monta a apuração do mês: documentos oficiais + cálculo (XML/SIAT) + conciliação.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { dbPath, netlifyDataRoot } from '../config.js';
import { getTaxAssessment, listTaxAssessmentMonths } from '../data/taxAssessment2026-06.js';
import { inventoryLocalApuracao, ingestApuracaoFromNetwork } from './ingestApuracao.js';
import { listNetworkMonths } from './networkScanner.js';
import { computeMonth } from '../scripts/computeIcmsApuracao.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../data');
const COMPANY = { name: 'FALCÃO & FRAZÃO LTDA', cnpj: '10.876.822/0001-94', ie: '194762769' };

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function loadJsonIfExists(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function listLedgerMonths() {
  if (!fs.existsSync(netlifyDataRoot)) return [];
  return fs.readdirSync(netlifyDataRoot)
    .filter((f) => /^ledger-\d{4}-\d{2}\.json$/.test(f))
    .map((f) => f.slice('ledger-'.length, -'.json'.length))
    .sort();
}

export function listAllAssessmentMonths() {
  const fromData = fs.existsSync(DATA_DIR)
    ? fs.readdirSync(DATA_DIR)
      .filter((f) => /^entradaSiat-\d{4}-\d{2}\.json$/.test(f) || /^entradaDanfeOcr-\d{4}-\d{2}\.json$/.test(f))
      .map((f) => f.replace(/^entradaSiat-|^entradaDanfeOcr-/, '').replace(/\.json$/, ''))
    : [];
  return [...new Set([
    ...listTaxAssessmentMonths(),
    ...listLedgerMonths(),
    ...listNetworkMonths(),
    ...fromData,
  ])].sort();
}

function reconStats(month) {
  try {
    if (!fs.existsSync(dbPath)) return null;
    const db = new Database(dbPath, { readonly: true });
    const row = db.prepare(`
      SELECT
        COUNT(*) AS lancamentos,
        SUM(CASE WHEN status = 'matched' THEN 1 ELSE 0 END) AS conciliados,
        SUM(CASE WHEN status = 'manual_review' THEN 1 ELSE 0 END) AS revisao,
        SUM(CASE WHEN status NOT IN ('matched') THEN 1 ELSE 0 END) AS abertos
      FROM ledger_entries
      WHERE entry_date LIKE ?
    `).get(`${month}%`);
    const fiscal = db.prepare(`
      SELECT
        COUNT(*) AS docs,
        SUM(CASE WHEN doc_direction = 'entrada' THEN 1 ELSE 0 END) AS entradas,
        SUM(CASE WHEN doc_direction IS NULL OR doc_direction = 'saida' THEN 1 ELSE 0 END) AS saidas
      FROM fiscal_documents
      WHERE issue_date LIKE ?
    `).get(`${month}%`);
    const recon = db.prepare(`
      SELECT COUNT(*) AS n
      FROM reconciliations
      WHERE raw_transaction_id IN (SELECT id FROM raw_transactions WHERE tx_date LIKE ?)
    `).get(`${month}%`);
    db.close();
    const lancamentos = row?.lancamentos || 0;
    const conciliados = row?.conciliados || 0;
    return {
      lancamentos,
      conciliados,
      revisao: row?.revisao || 0,
      abertos: row?.abertos || 0,
      percentual: lancamentos ? round2((100 * conciliados) / lancamentos) : 0,
      fiscalDocs: fiscal?.docs || 0,
      fiscalEntradas: fiscal?.entradas || 0,
      fiscalSaidas: fiscal?.saidas || 0,
      matchesBancoFiscal: recon?.n || 0,
    };
  } catch {
    return null;
  }
}

function darsFromOfficial(official, inventory) {
  if (official?.dars) return official.dars;
  const files = inventory?.dars || [];
  const notas = official?.icms?.antecipacaoTributaria?.notas || [];
  const boletos = files.map((f) => {
    const nf = String(f.name).match(/(\d+)/)?.[1] || null;
    const nota = notas.find((n) => n.dar === f.name || String(n.nf) === nf);
    return {
      nf,
      file: f.name,
      valor: nota?.valorDar ?? nota?.valorAPagar ?? null,
    };
  });
  const withVal = boletos.filter((b) => b.valor != null);
  const total = withVal.length ? round2(withVal.reduce((s, b) => s + b.valor, 0)) : null;
  if (!files.length && !total) return null;
  return {
    pasta: 'APURAÇÃO ICMS',
    quantidade: files.length || boletos.length,
    total,
    boletos,
    observacao: total != null
      ? 'Soma dos valores das guias DAR (memória oficial ou Total a Recolher do boleto).'
      : 'Guias encontradas na pasta; valores ainda não lidos.',
  };
}

function completenessOf(official, inventory, computed, siat) {
  const hasBalanceteOficial = Boolean(
    official?.balancete
    && official.balancete.resultadoLiquidoMes != null
    && !official.partial
    && !official.balancete.observacao,
  );
  const items = {
    balancete: hasBalanceteOficial || Boolean(inventory?.balancete),
    memoriaIcms: Boolean(official?.icms?.entradas?.length) || Boolean(inventory?.icms),
    memoriaPisCofins: Boolean(official?.pisCofins) || Boolean(inventory?.pis),
    memoriaIrpjCsll: Boolean(official?.irpjCsll) || Boolean(inventory?.irpj),
    dars: (official?.dars?.quantidade || inventory?.dars?.length || 0) > 0,
    siat: Boolean(siat),
    xmlSaidas: Boolean(computed?.icmsNormal?.receitaBruta),
  };
  const missing = Object.entries({
    balancete: items.balancete,
    memoria_icms: items.memoriaIcms,
    memoria_pis_cofins: items.memoriaPisCofins,
    memoria_irpj_csll: items.memoriaIrpjCsll,
    dar: items.dars,
  }).filter(([, ok]) => !ok).map(([k]) => k);
  return { items, missing, partial: missing.length > 0 };
}

export function buildCompleteAssessment(month, { ingest = false } = {}) {
  if (ingest) {
    try { ingestApuracaoFromNetwork(month); } catch { /* rede indisponível */ }
  }

  const official = getTaxAssessment(month);
  const inventory = inventoryLocalApuracao(month);
  let computed = null;
  try { computed = computeMonth(month); } catch { computed = null; }

  const siat = loadJsonIfExists(path.join(DATA_DIR, `entradaSiat-${month}.json`));
  const ocr = loadJsonIfExists(path.join(DATA_DIR, `entradaDanfeOcr-${month}.json`));
  const complete = completenessOf(official, inventory, computed, siat);
  const dars = darsFromOfficial(official, inventory);

  const base = official || {
    period: month,
    company: COMPANY,
    regime: 'Lucro Real (apuração mensal) — PIS/COFINS não-cumulativos',
    sourceDocs: {
      balancete: inventory.balancete?.name || null,
      icms: inventory.icms?.name || null,
      pisCofins: inventory.pis?.name || null,
      irpjCsll: inventory.irpj?.name || null,
      dar: (inventory.dars || []).map((f) => f.name),
    },
  };

  if (!official && computed) {
    base.balancete = {
      receitaBrutaMes: computed.icmsNormal.receitaBruta,
      deducoes: { icmsSVenda: computed.icmsNormal.debitoSaidas },
      resultadoLiquidoMes: null,
      observacao: 'Sem Balancete oficial. Receita/ICMS estimados pelos XMLs de saída.',
    };
    base.icms = {
      mes: month.slice(5) === '07' ? 'jul/26' : month,
      status: 'calculado a partir dos XMLs de saída e SIAT (sem memória oficial completa)',
      entradas: [],
      saidas: computed.icmsNormal.saidas,
      totais: {
        saidasVContabil: computed.icmsNormal.receitaBruta,
        saidasBaseCalculo: computed.icmsNormal.saidas[0]?.baseCalculo ?? null,
        debitoSaidas: computed.icmsNormal.debitoSaidas,
        icmsAntecipadoEntradas: computed.antecipacao.total,
        icmsApuracaoNormal: null,
      },
      antecipacaoTributaria: {
        base: computed.baseLegal,
        formula: computed.formulaAntecipacao,
        total: computed.antecipacao.total,
        observacao: computed.antecipacao.observacao,
        notas: computed.antecipacao.notas,
      },
    };
  }

  return {
    ...base,
    period: month,
    partial: complete.partial,
    missing: complete.missing,
    completeness: complete.items,
    dars: dars || base.dars || null,
    computed: computed
      ? {
        icmsNormal: computed.icmsNormal,
        antecipacao: {
          total: computed.antecipacao.total,
          notas: computed.antecipacao.notas.length,
        },
        confronto: official?.icms?.totais
          ? {
            debitoSaidasOficial: official.icms.totais.debitoSaidas,
            debitoSaidasCalculado: computed.icmsNormal.debitoSaidas,
            antecipacaoOficial: official.icms.totais.icmsAntecipadoEntradas,
            antecipacaoCalculada: computed.antecipacao.total,
            diffDebito: official.icms.totais.debitoSaidas != null
              ? round2(computed.icmsNormal.debitoSaidas - official.icms.totais.debitoSaidas)
              : null,
            diffAntecipacao: official.icms.totais.icmsAntecipadoEntradas != null
              ? round2(computed.antecipacao.total - official.icms.totais.icmsAntecipadoEntradas)
              : null,
          }
          : null,
      }
      : null,
    reconciliation: reconStats(month),
    apuracaoFiles: {
      icms: inventory.icms?.name || base.sourceDocs?.icms || null,
      pisCofins: inventory.pis?.name || base.sourceDocs?.pisCofins || null,
      irpjCsll: inventory.irpj?.name || base.sourceDocs?.irpjCsll || null,
      balancete: inventory.balancete?.name || base.sourceDocs?.balancete || null,
      dars: (inventory.dars || []).map((f) => f.name),
    },
    siatAvailable: Boolean(siat),
    ocrAvailable: Boolean(ocr),
  };
}
