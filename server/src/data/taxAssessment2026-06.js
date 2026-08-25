// server/src/data/taxAssessment2026-06.js
// Dados transcritos manualmente dos documentos da contabilidade (pasta local APURAÇÃO/)
// referentes à competência 06/2026: Balancete Contábil, Memória de Cálculo ICMS e
// Memória de Cálculo IRPJ/CSLL. Uso exclusivamente local — não é publicado no Netlify.
//
// IMPORTANTE: nem todos os campos dos PDFs originais puderam ser transcritos com
// segurança (algumas linhas do memorial de IRPJ/CSLL vêm em branco no documento
// original mesmo quando have valores calculados acima/abaixo — foram mantidas como
// `null` em vez de estimadas). Onde houver dúvida, o campo `raw` referencia o
// arquivo-fonte para conferência manual.

export const TAX_ASSESSMENT_2026_06 = {
  period: '2026-06',
  company: { name: 'FALCÃO & FRAZÃO LTDA', cnpj: '10.876.822/0001-94', ie: '194762769' },
  regime: 'Lucro Real (apuração mensal) — PIS/COFINS não-cumulativos',
  sourceDocs: {
    balancete: 'Balancete Contabil.pdf',
    icms: 'MEMORIA CALCULO ICMS 062026.pdf',
    irpjCsll: 'Memoria Calculo IRPJ e CSLL.pdf',
    dar: [
      'DAR NF 192874.pdf',
      'DAR NF 195423.pdf',
      'DAR NF 195424.pdf',
      'DAR NF 269037.pdf',
      'DAR NF 60606.pdf',
      'DAR NF 6683.pdf',
      'DAR NF 9493.pdf',
      'DAR NF 96162.pdf',
      'DAR NF 97281.pdf',
    ],
  },

  dars: {
    pasta: 'APURAÇÃO ICMS',
    receita: 'ICMS-Antecipacao Parcial',
    quantidade: 9,
    total: 18765.94,
    observacao: 'Soma dos valores a pagar das 9 guias DAR da memória ICMS 062026 (fretes sem DAR não entram).',
    boletos: [
      { nf: '269037', file: 'DAR NF 269037.pdf', valor: 437.83 },
      { nf: '195423', file: 'DAR NF 195423.pdf', valor: 2650.57 },
      { nf: '195424', file: 'DAR NF 195424.pdf', valor: 11176.78 },
      { nf: '6683', file: 'DAR NF 6683.pdf', valor: 278.45 },
      { nf: '192874', file: 'DAR NF 192874.pdf', valor: 613.43 },
      { nf: '60606', file: 'DAR NF 60606.pdf', valor: 1227.45 },
      { nf: '97281', file: 'DAR NF 97281.pdf', valor: 1075.39 },
      { nf: '9493', file: 'DAR NF 9493.pdf', valor: 524.83 },
      { nf: '96162', file: 'DAR NF 96162.pdf', valor: 781.21 },
    ],
  },

  // ---- Balancete Contábil 01/06/2026 a 30/06/2026 (movimento do mês) ----
  balancete: {
    receitaBrutaMes: 260790.28,
    deducoes: { cofinsSVenda: 15402.97, icmsSVenda: 57474.87, pisSVenda: 3344.07, devolucoes: 2829.06 },
    cmvMes: 129247.66,
    outrosCustosIndiretos: 160.00,
    resultadoLiquidoMes: -63225.44,
    obrigacoesFiscaisSaldoFinal: [
      { conta: 'COFINS a Recolher', saldo: 0 },
      { conta: 'CSRF a Recolher', saldo: 26.19 },
      { conta: 'ICMS a Recolher', saldo: 0 },
      { conta: 'IRRF a Recolher', saldo: 374.12 },
      { conta: 'PIS a Recolher', saldo: 0 },
      { conta: 'ICMS Antecipação Parcial a Recolher', saldo: 24613.99 },
    ],
    creditosTributariosSaldoFinal: [
      { conta: 'ICMS a Recuperar', saldo: 58293.69 },
      { conta: 'PIS a Compensar', saldo: 3644.70 },
      { conta: 'COFINS a Compensar', saldo: 16787.70 },
      { conta: 'IRPJ a Compensar', saldo: 22028.79 },
      { conta: 'CSLL a Compensar', saldo: 13217.28 },
    ],
  },

  // ---- Memória de Cálculo ICMS — jun/26 (Piauí, comércio varejista, Decreto 21.866/2023) ----
  icms: {
    mes: 'jun/26',
    entradas: [
      { cfop: '1.102', desc: 'COMPRAS COM 22,5%', vContabil: 1982.50, baseCalculo: 1982.50, aliquota: 22.5, credito: 446.06 },
      { cfop: '1.202', desc: 'DEVOLUÇÃO DE CLIENTE 22,5%', vContabil: 2865.71, baseCalculo: 2865.71, aliquota: 22.5, credito: 644.78 },
      { cfop: '1.303', desc: 'COMPRA COMUNICAÇÃO', vContabil: 105.00, baseCalculo: null, aliquota: null, credito: 0 },
      { cfop: '1.351', desc: 'FRETE S/ COMPRAS', vContabil: 1.22, baseCalculo: null, aliquota: null, credito: 0 },
      { cfop: '1.407', desc: 'COMPRAS PARA CONSUMO', vContabil: 794.91, baseCalculo: null, aliquota: null, credito: 0 },
      { cfop: '1.556', desc: 'COMPRAS PARA CONSUMO', vContabil: 958.53, baseCalculo: null, aliquota: null, credito: 0 },
      { cfop: '1.653', desc: 'COMPRA DE COMBUSTÍVEL OU LUBRIF.', vContabil: 650.00, baseCalculo: null, aliquota: null, credito: 0 },
      { cfop: '2.102', desc: 'COMPRAS — SIMPLES NACIONAL', vContabil: 1386.00, baseCalculo: null, aliquota: null, credito: 33.40 },
      { cfop: '2.102', desc: 'COMPRAS COM 4%', vContabil: 10492.16, baseCalculo: 10035.65, aliquota: 4, credito: 401.43 },
      { cfop: '2.102', desc: 'COMPRAS COM 7%', vContabil: 18270.97, baseCalculo: 18087.36, aliquota: 7, credito: 1266.12 },
      { cfop: '2.102', desc: 'COMPRAS COM 12%', vContabil: 135968.95, baseCalculo: 131689.05, aliquota: 12, credito: 15802.69 },
      { cfop: '2.352', desc: 'FRETE S/ COMPRAS', vContabil: 191.66, baseCalculo: null, aliquota: null, credito: 0 },
      { cfop: '2.353', desc: 'FRETE S/ COMPRAS', vContabil: 26582.25, baseCalculo: null, aliquota: null, credito: 0 },
      { cfop: '2.353', desc: 'FRETE S/ COMPRAS', vContabil: 2468.62, baseCalculo: 2468.62, aliquota: 7, credito: 172.80 },
      { cfop: '—', desc: 'ICMS — ANTECIPAÇÃO ENTRADAS', vContabil: null, baseCalculo: null, aliquota: null, credito: 19148.57 },
      { cfop: '—', desc: 'SALDO CREDOR ANTERIOR', vContabil: null, baseCalculo: null, aliquota: null, credito: 35314.88 },
    ],
    saidas: [
      { cfop: '5.102', desc: 'VENDAS DE MERCADORIA', vContabil: 256505.59, baseCalculo: 256505.59, aliquota: 22.5, debito: 57715.12 },
      { cfop: '5.405', desc: 'VENDAS DE MERCADORIA (ST)', vContabil: 913.63, baseCalculo: null, aliquota: null, debito: 0 },
      { cfop: '6.108', desc: 'VENDAS DE MERCADORIA (interestadual)', vContabil: 3371.06, baseCalculo: 3371.06, aliquota: 12, debito: 404.54 },
    ],
    totais: {
      entradasVContabil: 202718.48,
      entradasBaseCalculo: 167128.89,
      creditoEntradas: 18767.28,
      saidasVContabil: 260790.28,
      saidasBaseCalculo: 259876.65,
      debitoSaidas: 58119.65,
      saldoAnteriorCredor: 35314.88,
      icmsAntecipadoEntradas: 19148.57,
      totalCreditos: 73230.73, // credito entradas + antecipação + saldo anterior
      icmsApuracaoNormal: -15111.08, // negativo = saldo credor a transportar (crédito > débito)
    },
    antecipacaoTributaria: {
      base: 'Decreto Estadual 21.866/2023 (PI) — antecipação tributária em compras interestaduais para revenda',
      total: 19148.57,
      notas: [
        { data: '2026-05-27', nf: '269037', fornecedor: 'ROMETAL COMPONENTES PARA MOVEIS LTDA', valor: 3008.31, baseCalculo: 2824.70, aliqOrigem: 7, aliqEstadual: 22.5, aliqFinal: 15.5, valorAPagar: 437.83, dar: 'DAR NF 269037.pdf' },
        { data: '2026-06-16', nf: '195423', fornecedor: 'PLACAS DO BRASIL S/A', valor: 26063.91, baseCalculo: 25243.50, aliqOrigem: 12, aliqEstadual: 22.5, aliqFinal: 10.5, valorAPagar: 2650.57, dar: 'DAR NF 195423.pdf' },
        { data: '2026-06-16', nf: '195424', fornecedor: 'PLACAS DO BRASIL S/A', valor: 109905.04, baseCalculo: 106445.55, aliqOrigem: 12, aliqEstadual: 22.5, aliqFinal: 10.5, valorAPagar: 11176.78, dar: 'DAR NF 195424.pdf' },
        { data: '2026-06-16', nf: '6683', fornecedor: 'METALSUL FERRAGENS E ACESSÓRIOS LTDA', valor: 1386.00, baseCalculo: 1386.00, aliqOrigem: 12, aliqEstadual: 22.5, aliqFinal: 10.5, valorAPagar: 278.45, dar: 'DAR NF 6683.pdf', obs: 'Simples Nacional — crédito de R$ 33,40' },
        { data: '2026-06-17', nf: '53452', fornecedor: 'LUIZ CARLOS FERREIRA DA CONCEIÇÃO TRANSPORTES', valor: 161.29, baseCalculo: 161.29, aliqOrigem: 7, aliqEstadual: 22.5, aliqFinal: 15.5, valorAPagar: 25.00, dar: null, obs: 'Frete referente à NF 6683' },
        { data: '2026-06-09', nf: '192874', fornecedor: 'INDÚSTRIA QUÍMICA UMA LTDA', valor: 3957.64, baseCalculo: 3957.64, aliqOrigem: 7, aliqEstadual: 22.5, aliqFinal: 15.5, valorAPagar: 613.43, dar: 'DAR NF 192874.pdf' },
        { data: '2026-06-10', nf: '53196', fornecedor: 'LUIZ CARLOS FERREIRA DA CONCEIÇÃO TRANSPORTES', valor: 275.13, baseCalculo: 275.13, aliqOrigem: 7, aliqEstadual: 22.5, aliqFinal: 15.5, valorAPagar: 42.65, dar: null, obs: 'Frete referente à NF 192874' },
        { data: '2026-06-10', nf: '60606', fornecedor: 'LAGE RENZETTI LTDA', valor: 7919.02, baseCalculo: 7919.02, aliqOrigem: 7, aliqEstadual: 22.5, aliqFinal: 15.5, valorAPagar: 1227.45, dar: 'DAR NF 60606.pdf' },
        { data: '2026-06-16', nf: '53429', fornecedor: 'LUIZ CARLOS FERREIRA DA CONCEIÇÃO TRANSPORTES', valor: 468.60, baseCalculo: 468.60, aliqOrigem: 7, aliqEstadual: 22.5, aliqFinal: 15.5, valorAPagar: 72.63, dar: null, obs: 'Frete referente à NF 60606' },
        { data: '2026-06-09', nf: '97281', fornecedor: 'HD FERRAGENS PARA MÓVEIS LTDA', valor: 6015.08, baseCalculo: 5812.90, aliqOrigem: 4, aliqEstadual: 22.5, aliqFinal: 18.5, valorAPagar: 1075.39, dar: 'DAR NF 97281.pdf' },
        { data: '2026-06-12', nf: '53314', fornecedor: 'LUIZ CARLOS FERREIRA DA CONCEIÇÃO TRANSPORTES', valor: 802.46, baseCalculo: 802.46, aliqOrigem: 7, aliqEstadual: 22.5, aliqFinal: 15.5, valorAPagar: 124.38, dar: null, obs: 'Frete referente à NF 97281' },
        { data: '2026-06-09', nf: '9493', fornecedor: 'KITSUL COMPONENTES PARA MÓVEIS LTDA', valor: 3386.00, baseCalculo: 3386.00, aliqOrigem: 7, aliqEstadual: 22.5, aliqFinal: 15.5, valorAPagar: 524.83, dar: 'DAR NF 9493.pdf' },
        { data: '2026-05-18', nf: '96162', fornecedor: 'HD FERRAGENS PARA MÓVEIS LTDA', valor: 4477.08, baseCalculo: 4222.75, aliqOrigem: 4, aliqEstadual: 22.5, aliqFinal: 18.5, valorAPagar: 781.21, dar: 'DAR NF 96162.pdf' },
        { data: '2026-06-04', nf: '52691', fornecedor: 'LUIZ CARLOS FERREIRA DA CONCEIÇÃO TRANSPORTES', valor: 761.14, baseCalculo: 761.14, aliqOrigem: 7, aliqEstadual: 22.5, aliqFinal: 15.5, valorAPagar: 117.98, dar: null, obs: 'Frete referente à NF 96162 (data original do documento continha um erro de digitação — 04/04/2044)' },
      ],
    },
  },

  // ---- Memória de Cálculo IRPJ e CSLL — ano-calendário 2026 (Lucro Real mensal) ----
  irpjCsll: {
    monthly: {
      '2026-01': { label: 'janeiro', resultado: 'PREJUIZO', lucroPrejuizoContabilFiscal: -521.40, prejuizoAcumuladoAnterior: 0, baseCalculoAcumulada: 0, compensacaoPrejuizo30: 0, baseCalculo: 0, irpj15: 0, irpjAdicional10: 0, irpjTotal: 0, csll9: 0, irpjPago: 0, irpjPagoAcumulado: 0, csllPago: 0, csllPagoAcumulado: 0 },
      '2026-02': { label: 'fevereiro', resultado: 'PREJUIZO', lucroPrejuizoContabilFiscal: -55358.96, prejuizoAcumuladoAnterior: 521.40, baseCalculoAcumulada: 0, compensacaoPrejuizo30: 0, baseCalculo: 0, irpj15: 0, irpjAdicional10: 0, irpjTotal: 0, csll9: 0, irpjPago: 0, irpjPagoAcumulado: 0, csllPago: 0, csllPagoAcumulado: 0 },
      '2026-03': { label: 'março', resultado: 'LUCRO', lucroPrejuizoContabilFiscal: 102207.28, prejuizoAcumuladoAnterior: 55880.36, baseCalculoAcumulada: 46326.93, compensacaoPrejuizo30: 13898.08, baseCalculo: 32428.85, irpj15: 4864.33, irpjAdicional10: 1242.88, irpjTotal: 6107.21, csll9: 2918.60, irpjPago: 4864.33, irpjPagoAcumulado: 4864.33, csllPago: 2918.60, csllPagoAcumulado: 2918.60 },
      '2026-04': { label: 'abril', resultado: 'PREJUIZO', lucroPrejuizoContabilFiscal: -66450.20, prejuizoAcumuladoAnterior: 0, baseCalculoAcumulada: 0, compensacaoPrejuizo30: 0, baseCalculo: 0, irpj15: 0, irpjAdicional10: 0, irpjTotal: 0, csll9: 0, irpjPago: 0, irpjPagoAcumulado: 4864.33, csllPago: 0, csllPagoAcumulado: 2918.60 },
      '2026-05': { label: 'maio', resultado: 'PREJUIZO', lucroPrejuizoContabilFiscal: -93004.31, prejuizoAcumuladoAnterior: 66450.20, baseCalculoAcumulada: 0, compensacaoPrejuizo30: 0, baseCalculo: 0, irpj15: 0, irpjAdicional10: 0, irpjTotal: 0, csll9: 0, irpjPago: 0, irpjPagoAcumulado: 4864.33, csllPago: 0, csllPagoAcumulado: 2918.60 },
      '2026-06': { label: 'junho', resultado: 'PREJUIZO', lucroPrejuizoContabilFiscal: -63225.44, prejuizoAcumuladoAnterior: 159454.51, baseCalculoAcumulada: 0, compensacaoPrejuizo30: 0, baseCalculo: 0, irpj15: 0, irpjAdicional10: 0, irpjTotal: 0, csll9: 0, irpjPago: 0, irpjPagoAcumulado: 4864.33, csllPago: 0, csllPagoAcumulado: 2918.60 },
    },
    // Prejuízo fiscal acumulado a carregar para julho/2026 (ainda sem apuração fechada)
    prejuizoFiscalACompensarJulho: 222679.95,
    accumulated2026: {
      periodo: 'jan–jun/2026',
      receitaComVenda: 1516349.83,
      deducoes: { impostosSVenda: 445851.99, vendasCanceladas: 13152.86, recuperacaoPisCofinsDevolucao: 774.10, creditoPisCofinsEnergia: 1220.74 },
      resultadoBrutoOperacional: 1059339.82,
      custosGerais: { cmv: 750593.60, outrosCustosIndiretos: 8351.23, total: 758944.83 },
      resultadoOperacionalLiquido: 300394.99,
      despesasOperacionais: {
        pessoal: { proventos: 127347.23, encargos: 47335.35, beneficios: 30777.45, diretoria: 37296.00, total: 242756.03 },
        administracao: { servicosAdministrados: 3735.26, despesasOperacionais: 56405.86, manutencaoConsumo: 1345.80, veiculosTransportes: 30914.00, servicosPrestados: 74973.14, depreciacoesAmortizacoes: 44173.77, taxasContribuicoes: 10213.16, informatica: 5378.47, total: 227139.46 },
        financeiras: 276338.75,
        total: 476748.01,
      },
      outrasReceitas: { financeiras: 1.90, recuperacaoDespesas: 76726.78, vendaImobilizado: -28323.99, outras: 221081.54, total: 269486.23 },
      lucroPrejuizoLiquidoMensalMedio: -176353.02,
      resultado: 'PREJUIZO',
      irpjPagoAcumulado: 4864.33,
      csllPagoAcumulado: 2918.60,
      observacao: 'Como o acumulado do semestre fechou em prejuízo fiscal, os valores de IRPJ (R$ 4.864,33) e CSLL (R$ 2.918,60) pagos em março (único mês com lucro) ficam registrados como "pago a maior" — compensáveis em meses futuros com lucro (ver contas IRPJ/CSLL a Compensar no balancete).',
    },
  },
};

import { TAX_ASSESSMENT_2026_07 } from './taxAssessment2026-07.js';

export const TAX_ASSESSMENT_BY_MONTH = {
  '2026-06': TAX_ASSESSMENT_2026_06,
  '2026-07': TAX_ASSESSMENT_2026_07,
};

export function getTaxAssessment(month) {
  return TAX_ASSESSMENT_BY_MONTH[month] || null;
}

export function listTaxAssessmentMonths() {
  return Object.keys(TAX_ASSESSMENT_BY_MONTH).sort();
}
