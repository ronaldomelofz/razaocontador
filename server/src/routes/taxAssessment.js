// server/src/routes/taxAssessment.js
// Rota exclusiva do servidor Express LOCAL (server/src/index.js).
// O deploy do Netlify usa netlify/functions/api.mjs, que não importa este arquivo —
// portanto a aba "Apuração de Impostos" nunca chega à produção por essa via.
// Como reforço extra, o front-end também só renderiza a aba quando import.meta.env.DEV.
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TAX_APURACAO_DIR } from '../config.js';
import { getTaxAssessment, listTaxAssessmentMonths } from '../data/taxAssessment2026-06.js';
import { buildCompleteAssessment, listAllAssessmentMonths } from '../engine/buildCompleteAssessment.js';
import { ingestApuracaoFromNetwork } from '../engine/ingestApuracao.js';
import { runApurar } from '../engine/processMonth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../data');

const router = express.Router();

function loadJsonIfExists(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function loadEntradaSiat(month) {
  return loadJsonIfExists(path.join(DATA_DIR, `entradaSiat-${month}.json`));
}

function loadEntradaDanfeOcr(month) {
  return loadJsonIfExists(path.join(DATA_DIR, `entradaDanfeOcr-${month}.json`));
}

function listMonthsByPrefix(prefix) {
  if (!fs.existsSync(DATA_DIR)) return [];
  const re = new RegExp(`^${prefix}-\\d{4}-\\d{2}\\.json$`);
  return fs.readdirSync(DATA_DIR)
    .filter((f) => re.test(f))
    .map((f) => f.slice(prefix.length + 1, -'.json'.length))
    .sort();
}

function listEntradaMonths() {
  return [...new Set([
    ...listMonthsByPrefix('entradaSiat'),
    ...listMonthsByPrefix('entradaDanfeOcr'),
  ])].sort();
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function rebuildSiatSummary(notes, prev = {}) {
  const summary = {
    notes: notes.length,
    totalProdutos: 0,
    filter: 'data_entrada',
    excluidasSemDataEntrada: prev.excluidasSemDataEntrada,
    excluidasOutroMesEntrada: prev.excluidasOutroMesEntrada,
    byCfopEntrada: {},
    byUf: {},
    byDestinacao: {},
  };
  for (const n of notes) {
    summary.totalProdutos += n.total_value || 0;
    for (const c of n.cfops_entrada || [n.cfop].filter(Boolean)) {
      summary.byCfopEntrada[c] ??= { n: 0, total: 0 };
      summary.byCfopEntrada[c].n += 1;
      summary.byCfopEntrada[c].total += n.total_value || 0;
    }
    const uf = n.emit_uf || '?';
    summary.byUf[uf] ??= { n: 0, total: 0 };
    summary.byUf[uf].n += 1;
    summary.byUf[uf].total += n.total_value || 0;
    const dest = n.destinacao || '(sem destinação)';
    summary.byDestinacao[dest] ??= { n: 0, total: 0 };
    summary.byDestinacao[dest].n += 1;
    summary.byDestinacao[dest].total += n.total_value || 0;
  }
  summary.totalProdutos = round2(summary.totalProdutos);
  for (const map of [summary.byCfopEntrada, summary.byUf, summary.byDestinacao]) {
    for (const k of Object.keys(map)) map[k].total = round2(map[k].total);
  }
  return summary;
}

/** Junta SIAT + OCR DANFE: impostos/chave do OCR; identidade do SIAT quando houver match.
 *  Só considera NF do SIAT com data_entrada no mês (pasta NOTAS FISCAL DE ENTRADA).
 */
function buildEntradasCombined(month) {
  const siatRaw = loadEntradaSiat(month);
  const ocr = loadEntradaDanfeOcr(month);
  if (!siatRaw && !ocr) return null;

  // Se o JSON ainda tiver notas sem filtro (legado), aplica data_entrada do mês
  const siatNotes = (siatRaw?.notes || []).filter(
    (n) => n.data_entrada && String(n.data_entrada).startsWith(month),
  );
  const siat = siatRaw
    ? {
        ...siatRaw,
        filter: 'data_entrada',
        notes: siatNotes,
        summary: rebuildSiatSummary(siatNotes, siatRaw.summary),
      }
    : null;

  const allowedNf = new Set(siatNotes.map((n) => String(n.doc_number)));

  const ocrByNf = new Map();
  const ocrUnmatched = [];
  for (const page of ocr?.notes || ocr?.pages || []) {
    const m = page.merged || {};
    const nf = String(m.doc_number || page.doc_number || '');
    if (page.siat_match && nf && allowedNf.has(nf)) {
      const prev = ocrByNf.get(nf);
      const better = !prev
        || ((m.tax_confidence === 'high') && prev.merged?.tax_confidence !== 'high')
        || (m.valor_icms != null && prev.merged?.valor_icms == null);
      if (better) ocrByNf.set(nf, { ...page, merged: m });
    } else if (!page.siat_match) {
      // OCR avulso: só se data da pasta/mês (issue_date ou merged) bater
      const d = m.issue_date || page.issue_date || '';
      if (d.startsWith(month) || (m.data_entrada && String(m.data_entrada).startsWith(month))) {
        ocrUnmatched.push({ ...page, merged: m });
      }
    }
  }

  const notes = [];
  for (const n of siat?.notes || []) {
    const o = ocrByNf.get(String(n.doc_number));
    const m = o?.merged || {};
    notes.push({
      ...n,
      chave_acesso: m.chave_acesso || o?.chave_acesso || null,
      base_icms: m.base_icms ?? null,
      valor_icms: m.valor_icms ?? null,
      aliquota_icms: m.aliquota_icms ?? null,
      base_icms_st: m.base_icms_st ?? null,
      valor_icms_st: m.valor_icms_st ?? null,
      valor_ipi: m.valor_ipi ?? null,
      valor_frete: m.valor_frete ?? null,
      valor_total_nf: m.valor_total_nf ?? n.total_value,
      icms_antecipacao_estimada: m.icms_antecipacao_estimada ?? null,
      tax_confidence: m.tax_confidence || null,
      ocr_source: o?.source_file || null,
      has_ocr: Boolean(o),
    });
  }

  const withIcms = notes.filter((n) => n.valor_icms != null);
  const withAntecip = notes.filter((n) => n.icms_antecipacao_estimada != null);
  return {
    period: month,
    source: [siat?.source, ocr ? 'OCR DANFE (Tesseract)' : null].filter(Boolean).join(' + '),
    generatedAt: ocr?.generatedAt || siat?.generatedAt,
    siatSummary: siat?.summary || null,
    ocrSummary: ocr?.summary || null,
    summary: {
      notes: notes.length,
      withOcr: notes.filter((n) => n.has_ocr).length,
      withIcms: withIcms.length,
      totalProdutos: round2(notes.reduce((s, n) => s + (n.total_value || 0), 0)),
      totalIcms: round2(withIcms.reduce((s, n) => s + (n.valor_icms || 0), 0)),
      totalIcmsAntecipacaoEstimada: round2(
        withAntecip.reduce((s, n) => s + (n.icms_antecipacao_estimada || 0), 0),
      ),
      byUf: siat?.summary?.byUf || {},
      byCfopEntrada: siat?.summary?.byCfopEntrada || {},
    },
    notes: notes.sort((a, b) => String(a.data_entrada || a.issue_date || '').localeCompare(String(b.data_entrada || b.issue_date || ''))
      || String(a.doc_number || '').localeCompare(String(b.doc_number || ''), undefined, { numeric: true })),
  };
}

router.get('/months', (_req, res) => {
  const assessment = listTaxAssessmentMonths();
  const entradas = listEntradaMonths();
  const months = listAllAssessmentMonths();
  res.json({ months, assessment, entradas });
});

// POST /api/tax-assessment/apurar  { month: '2026-07' }
router.post('/apurar', (req, res) => {
  const month = req.body?.month || req.query.month;
  if (!month) return res.status(400).json({ error: 'Informe month (YYYY-MM)' });
  try {
    const result = runApurar(month);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Falha ao apurar' });
  }
});

router.get('/entradas', (req, res) => {
  const month = req.query.month;
  if (!month) return res.status(400).json({ error: 'Informe ?month=YYYY-MM' });
  const data = buildEntradasCombined(month) || loadEntradaSiat(month);
  if (!data) {
    return res.status(404).json({
      error: `Notas de entrada ainda não importadas para ${month}.`,
      hint: 'Rode: node server/src/scripts/importSiatEntrada.js --month=YYYY-MM e/ou python server/src/scripts/ocrDanfeEntrada.py --month=YYYY-MM',
      availableMonths: listEntradaMonths(),
    });
  }
  res.json(data);
});

router.get('/', (req, res) => {
  const month = req.query.month;
  if (!month) return res.status(400).json({ error: 'Informe ?month=YYYY-MM' });
  if (req.query.ingest === '1') {
    try { ingestApuracaoFromNetwork(month); } catch { /* rede */ }
  }
  const data = buildCompleteAssessment(month);
  const entradas = buildEntradasCombined(month) || loadEntradaSiat(month);
  if (!data && !entradas) {
    return res.status(404).json({
      error: `Apuração de impostos ainda não disponível para ${month}.`,
      hint: 'Copie os documentos (Balancete, Memórias de Cálculo, DAR) enviados pela contabilidade para a pasta local APURAÇÃO e peça para transcrevê-los. Notas de entrada: importe o SIAT e rode o OCR dos DANFEs.',
      availableMonths: listAllAssessmentMonths(),
    });
  }
  res.json({
    ...data,
    entradasSiat: entradas || null,
    entradasDanfeOcr: loadEntradaDanfeOcr(month),
  });
});

function findApuracaoFile(filename) {
  const direct = path.join(TAX_APURACAO_DIR, filename);
  if (fs.existsSync(direct)) return direct;
  if (!fs.existsSync(TAX_APURACAO_DIR)) return null;
  for (const ent of fs.readdirSync(TAX_APURACAO_DIR, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const nested = path.join(TAX_APURACAO_DIR, ent.name, filename);
    if (fs.existsSync(nested)) return nested;
  }
  return null;
}

// Serve os PDFs originais (Balancete, Memórias, DAR) só localmente, para conferência.
router.get('/docs/:filename', (req, res) => {
  const filename = decodeURIComponent(req.params.filename);
  if (filename.includes('..') || path.isAbsolute(filename)) {
    return res.status(400).json({ error: 'Nome de arquivo inválido' });
  }
  const filePath = findApuracaoFile(filename);
  if (!filePath) {
    return res.status(404).json({ error: `Arquivo não encontrado: ${filename}` });
  }
  res.sendFile(filePath);
});

export default router;
