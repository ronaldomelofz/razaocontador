// server/src/scripts/computeIcmsApuracao.js
// Calcula ICMS normal (saídas) e ICMS antecipação a partir do DB + SIAT/OCR.
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const DATA = path.resolve(__dirname, '../data');
const ALIQ_PI = 22.5;

const dbCandidates = [
  path.join(ROOT, 'server/data/madepinus.db'),
  path.join(DATA, 'madepinus.db'),
];
const dbPath = dbCandidates.find((p) => fs.existsSync(p));
if (!dbPath) {
  console.error('DB não encontrado', dbCandidates);
  process.exit(1);
}
const db = new Database(dbPath, { readonly: true });

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function cfopAgg(month) {
  return db
    .prepare(
      `SELECT REPLACE(cfop,'.','') as cfop,
        COUNT(*) as n,
        ROUND(SUM(COALESCE(total_value,0)),2) as total,
        ROUND(SUM(COALESCE(icms_value,0)),2) as icms
       FROM fiscal_documents
       WHERE issue_date LIKE ?
       GROUP BY REPLACE(cfop,'.','')
       ORDER BY total DESC`,
    )
    .all(`${month}%`);
}

/** Alíquotas conhecidas por fornecedor (memória ICMS jun/26 + OCR confiável). */
const SUPPLIER_ALIQ = [
  { match: /PLACAS\s+DO\s+BRASIL/i, aliq: 12 },
  { match: /HD\s+FERRAGENS/i, aliq: 4 },
  { match: /LAGE\s+RENZETTI/i, aliq: 7 },
  { match: /ROMETAL/i, aliq: 7 },
  { match: /TABONE/i, aliq: 7 },
  { match: /AFO\s+MOVEIS/i, aliq: 12 },
  { match: /METALSUL/i, aliq: 12, sn: true },
  { match: /KITSUL/i, aliq: 7 },
  { match: /INDUSTRIA\s+QUIMICA\s+UMA|QU[IÍ]MICA\s+UMA/i, aliq: 7 },
  { match: /CRUZEIRO\s+PAPEIS/i, aliq: 7 },
];

/** Alíquota interestadual típica por UF de origem (quando OCR/histórico não lê). */
function guessAliqOrigem(uf, fornecedor) {
  for (const s of SUPPLIER_ALIQ) {
    if (fornecedor && s.match.test(fornecedor)) return s.aliq;
  }
  if (!uf || uf === 'PI') return null;
  // Sul/Sudeste → Norte/Nordeste: em geral 7%; Centro-Oeste/Nordeste frequentemente 12%
  const uf7 = new Set(['PR', 'SC', 'RS', 'SP', 'RJ', 'MG']);
  if (uf7.has(uf)) return 7;
  if (uf === 'ES') return 12; // Placas do Brasil e similares na memória usam 12%
  return 12;
}

function loadJson(name) {
  const p = path.join(DATA, name);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function antecipFromBase(base, aliqOrigem) {
  if (base == null || aliqOrigem == null) return null;
  const aliqFinal = round2(ALIQ_PI - aliqOrigem);
  if (aliqFinal <= 0) return { aliqFinal: 0, valorAPagar: 0 };
  // Equivalente: base*22,5% - ICMS destacado (quando ICMS = base*aliqOrigem)
  return {
    aliqFinal,
    valorAPagar: round2(base * (aliqFinal / 100)),
    icmsInterno: round2(base * (ALIQ_PI / 100)),
    icmsDestacado: round2(base * (aliqOrigem / 100)),
  };
}

export function computeMonth(month) {
  const rows = cfopAgg(month);
  const saidaCfops = rows.filter((r) => {
    const c = String(r.cfop || '');
    return c.startsWith('5') || c === '6108' || c === '6102' || c === '6101';
  });

  // Vendas internas típicas varejo: 5102 @ 22,5%; ST 5405; interestadual 6108
  const s5102 = rows.find((r) => r.cfop === '5102') || { total: 0, icms: 0, n: 0 };
  const s5405 = rows.find((r) => r.cfop === '5405') || { total: 0, icms: 0, n: 0 };
  const s6108 = rows.find((r) => r.cfop === '6108') || { total: 0, icms: 0, n: 0 };

  // Débito oficial preferindo XML icms_value; se zero, calcula base*22.5%
  const debito5102 =
    s5102.icms > 0 ? round2(s5102.icms) : round2(s5102.total * (ALIQ_PI / 100));
  const debito6108 = s6108.icms > 0 ? round2(s6108.icms) : round2(s6108.total * 0.12);

  const icmsNormal = {
    fonte: 'fiscal_documents (XMLs de saída)',
    saidas: [
      {
        cfop: '5.102',
        desc: 'VENDAS DE MERCADORIA',
        n: s5102.n,
        vContabil: s5102.total,
        baseCalculo: s5102.total,
        aliquota: ALIQ_PI,
        debito: debito5102,
      },
      {
        cfop: '5.405',
        desc: 'VENDAS DE MERCADORIA (ST)',
        n: s5405.n,
        vContabil: s5405.total,
        baseCalculo: null,
        aliquota: null,
        debito: 0,
      },
      {
        cfop: '6.108',
        desc: 'VENDAS INTERESTADUAIS',
        n: s6108.n,
        vContabil: s6108.total,
        baseCalculo: s6108.total || null,
        aliquota: s6108.total ? 12 : null,
        debito: debito6108,
      },
    ],
    debitoSaidas: round2(debito5102 + debito6108),
    receitaBruta: round2(s5102.total + s5405.total + s6108.total),
    allCfops: rows,
  };

  // Antecipação: SIAT (UF≠PI, revenda) + OCR quando houver base/alíquota
  // Só NF com data_entrada no mês da pasta NOTAS FISCAL DE ENTRADA
  const siat = loadJson(`entradaSiat-${month}.json`);
  const ocr = loadJson(`entradaDanfeOcr-${month}.json`);
  const ocrByNf = new Map();
  for (const page of ocr?.notes || []) {
    const m = page.merged || {};
    if (m.doc_number) ocrByNf.set(String(m.doc_number), m);
  }

  const siatNotes = (siat?.notes || []).filter(
    (n) => n.data_entrada && String(n.data_entrada).startsWith(month),
  );

  const notas = [];
  for (const n of siatNotes) {
    const uf = n.emit_uf;
    if (!uf || uf === 'PI') continue;
    // só comercialização / revenda (antecipação parcial art. 78 RICMS-PI)
    const dest = String(n.destinacao || '').toUpperCase();
    if (dest && !/REVENDA|COMERC|MERCADOR/.test(dest) && /CONSUMO|ATIVO|USO/.test(dest)) {
      continue;
    }
    const o = ocrByNf.get(String(n.doc_number)) || {};
    // Art. 79 RICMS-PI: base = valor da operação do remetente (SIAT VLR PROD)
    let base = n.total_value;
    // Só troca pela base OCR se estiver próxima do valor da operação (±15%)
    if (o.base_icms != null && o.base_icms > 0 && base > 0) {
      if (Math.abs(o.base_icms - base) / base <= 0.15) base = o.base_icms;
    }
    let aliqOrigem = null;
    let fonteAliq = null;
    // 1) alíquota OCR confiável
    if (o.aliquota_icms != null && o.aliquota_icms > 0 && o.aliquota_icms < ALIQ_PI) {
      aliqOrigem = o.aliquota_icms;
      fonteAliq = 'ocr';
    }
    // 2) deriva de ICMS destacado / base (se base OCR ≈ operação)
    if (aliqOrigem == null && o.valor_icms != null && o.valor_icms > 0 && base > 0) {
      const ocrBase =
        o.base_icms != null && Math.abs((o.base_icms || 0) - base) / base <= 0.15
          ? o.base_icms
          : base;
      const der = round2((100 * o.valor_icms) / ocrBase);
      if (der > 0 && der < ALIQ_PI) {
        aliqOrigem = der;
        fonteAliq = 'ocr_derivada';
      }
    }
    // 3) histórico fornecedor / UF
    if (aliqOrigem == null || aliqOrigem <= 0 || aliqOrigem >= ALIQ_PI) {
      aliqOrigem = guessAliqOrigem(uf, n.counterparty_name);
      fonteAliq = SUPPLIER_ALIQ.some((s) => s.match.test(n.counterparty_name || ''))
        ? 'historico_fornecedor'
        : 'heuristica_uf';
    }
    // Validação: alíquotas interestaduais típicas 4, 7, 12
    const allowed = [4, 7, 12];
    if (!allowed.includes(aliqOrigem)) {
      // arredonda para a mais próxima permitida se perto
      const nearest = allowed.reduce((a, b) =>
        Math.abs(b - aliqOrigem) < Math.abs(a - aliqOrigem) ? b : a,
      );
      if (Math.abs(nearest - aliqOrigem) <= 1.5) aliqOrigem = nearest;
    }

    const calc = antecipFromBase(base, aliqOrigem);
    // Preferência: se OCR já calculou antecipação válida, usa
    let valorAPagar = calc?.valorAPagar ?? null;
    if (o.icms_antecipacao_estimada != null && o.icms_antecipacao_estimada > 0) {
      valorAPagar = o.icms_antecipacao_estimada;
      fonteAliq = fonteAliq + '+ocr_antecip';
    }

    notas.push({
      data: n.data_entrada || n.issue_date,
      dataEntrada: n.data_entrada,
      dataEmissao: n.issue_date,
      nf: n.doc_number,
      fornecedor: n.counterparty_name,
      uf,
      destinacao: n.destinacao,
      valor: n.total_value,
      baseCalculo: base,
      aliqOrigem,
      aliqEstadual: ALIQ_PI,
      aliqFinal: calc?.aliqFinal ?? null,
      icmsDestacado: o.valor_icms ?? calc?.icmsDestacado ?? null,
      icmsInternoPI: calc?.icmsInterno ?? null,
      valorAPagar,
      fonteAliq,
      confianca: o.tax_confidence || (fonteAliq.startsWith('heuristica') ? 'estimada' : 'media'),
      formula: 'base × (22,5% − alíq. origem)  ≡  (base × 22,5%) − ICMS destacado',
    });
  }

  const totalAntecip = round2(notas.reduce((s, n) => s + (n.valorAPagar || 0), 0));
  const totalConfiancaAlta = round2(
    notas
      .filter((n) => n.confianca === 'high' || n.fonteAliq.includes('ocr'))
      .reduce((s, n) => s + (n.valorAPagar || 0), 0),
  );

  return {
    period: month,
    aliqInternaPI: ALIQ_PI,
    baseLegal:
      'Decreto 21.866/2023 (RICMS-PI) arts. 78–82 — antecipação parcial em compras interestaduais para comercialização; alíquota interna geral 22,5% (art. 21, I, c).',
    formulaAntecipacao:
      'ICMS antecipação = (base × 22,5%) − ICMS destacado na NF de entrada = base × (22,5% − alíq. interestadual de origem)',
    filtroSiat: 'data_entrada no mês da pasta NOTAS FISCAL DE ENTRADA',
    siatNotasNoMes: siatNotes.length,
    icmsNormal,
    antecipacao: {
      total: totalAntecip,
      totalComOcrPreferencial: totalConfiancaAlta,
      notas: notas.sort((a, b) => String(a.data).localeCompare(String(b.data))),
      observacao:
        'Só NF com data_entrada no mês da pasta NOTAS FISCAL DE ENTRADA. Alíquota: OCR > histórico fornecedor > heurística UF. Conferir com Memória ICMS / DAR.',
    },
  };
}

const isCli = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isCli) {
  const months = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const list = months.length ? months : ['2026-06', '2026-07'];
  const out = {};
  for (const m of list) {
    out[m] = computeMonth(m);
    console.log('\n========', m, '========');
    console.log(
      'ICMS NORMAL (débito saídas):',
      out[m].icmsNormal.debitoSaidas,
      '| receita',
      out[m].icmsNormal.receitaBruta,
    );
    console.log('  5102', out[m].icmsNormal.saidas[0]);
    console.log('  5405', out[m].icmsNormal.saidas[1]);
    console.log('  6108', out[m].icmsNormal.saidas[2]);
    console.log('ICMS ANTECIPAÇÃO:', out[m].antecipacao.total, '| notas', out[m].antecipacao.notas.length);
    for (const n of out[m].antecipacao.notas) {
      console.log(
        `  NF ${n.nf} ${n.uf} base=${n.baseCalculo} aliq=${n.aliqOrigem}% → pagar=${n.valorAPagar} [${n.fonteAliq}/${n.confianca}]`,
      );
    }
  }

  const outPath = path.join(DATA, 'icmsApuracaoCalculada.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
  console.log('\nGravado', outPath);
}
