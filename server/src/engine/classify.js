// server/src/engine/classify.js
// Motor de classificação por regras (regex) — converte raw_transaction em lançamento de partidas dobradas.
// Baseado nos padrões reais identificados nos extratos Itaú/BB/Inter da MADEPINUS.
// Ajustar `RULES` conforme docs/PLANO_DE_CONTAS.md (códigos reais do Alterdata).

export const RULES = [
  // [regex, categoria, conta_contrapartida, natureza]
  // --- Sócios (Ronaldo Melo Frazão e Ariosto Falcão Martins) — antes de recebimento cliente ---
  [/PIX.*(RECEBIDO|ENVIADO).*RONALDO\s*MEL|RONALDO\s*MELO\s*FRAZ/i, 'Movimentação sócio Ronaldo Melo Frazão', '2.02.01.04.01.0002', 'societaria'],
  [/PIX.*(RECEBIDO|ENVIADO).*ARIOSTO\s*FALC/i, 'Movimentação sócio Ariosto Falcão Martins', '2.02.01.04.01.0001', 'societaria'],
  // --- Transferências entre contas próprias (CNPJ da empresa) ---
  [/10876822000194|PIX.*(RECEBIDO|ENVIADO).*FALCAO\s*&?\s*FR|PIX.*MADEPINUS/i, 'Transferência entre contas próprias', '1.01.01.01.02.0002', 'interna'],
  [/TRANSFER[ÊE]NCIA AUTOM\.?\s*RECEBIDA\s*8840/i, 'Recebimento cartão (concentrador Itaú)', '1.01.03.01.02.0003', 'operacional'],
  [/TRANSFER[ÊE]NCIA AUTOM\.?\s*RECEBIDA\s*H\s*II/i, 'Recebimento cartão (concentrador)', '1.01.03.01.02.0003', 'operacional'],
  [/TEG EX GAR/i, 'Repasse garantia cartão (TEG)', '1.01.03.01.02.0003', 'operacional'],
  [/PIX - RECEBIDO CREDI ?SHOP/i, 'Recebimento cartão (CrediShop)', '1.01.03.01.02.0001', 'operacional'],
  [/JUROS (SALDO DEVEDOR|EXCESSO|ATRASO|MORA)/i, 'Juros bancários / mora', '4.02.02.01.03', 'financeira'],
  [/^IOF\b/i, 'IOF sobre operações de crédito', '4.02.02.01.03', 'financeira'],
  [/TAR CONTR\/RENOV CTA GAR|Tarifa Pacote de Servi/i, 'Tarifa bancária', '4.02.02.01.03', 'financeira'],
  [/FIN VEIC/i, 'Financiamento de veículo - parcela', '2.02.01.01.01', 'financeira'],
  [/PARC(IAL|ELA) GIRO/i, 'Empréstimo capital de giro - parcela', '2.02.01.01.01', 'financeira'],
  [/RENEGOCIA[ÇC][ÃA]O ITAU/i, 'Renegociação de dívida - parcela', '2.02.01.01.01', 'financeira'],
  [/MULTA PARC GIRO/i, 'Multa - atraso empréstimo giro', '4.02.02.01.03', 'financeira'],
  [/BOLETO PAGO|Pagamento de Boleto/i, 'Pagamento a fornecedor (boleto)', '2.01.01.01.01', 'operacional'],
  // --- Pensão alimentícia (desconto em folha de pagamento) ---
  [/Lilia\s*Maria\s*de\s*Melo/i, 'Pensão alimentícia — desconto folha funcionário Rogério', '4.02.01.01.01.0002', 'operacional'],
  [/Viviane\s*Rodrigues\s*Leao/i, 'Pensão alimentícia — desconto folha funcionário Ronaldo Leão', '4.02.01.01.01.0002', 'operacional'],
  // --- Fornecedores conhecidos (pagamento PIX + NF entrada) ---
  [/IBYTE/i, 'Pagamento fornecedor IBYTE (compra — NF entrada)', '2.01.01.01.01', 'operacional'],
  [/Pix - Recebido|PIX RECEBIDO|Pix recebido/i, 'Recebimento cliente diverso', '1.01.03.01.01.0001', 'operacional'],
  [/Compra com Cartao|COMPRA COM CARTAO/i, 'Despesa cartão débito/crédito', '4.02.02.01.01', 'operacional'],
  [/Pix - Enviado RECEITA FEDERAL|PIX ENVIADO.*RECEITA FEDERAL/i, 'Pagamento DARF (INSS/IRRF)', '2.01.01.03.02.0005', 'imposto'],
  [/Pix - Enviado CEF MATRIZ|PIX.*CEF MATRIZ/i, 'Pagamento FGTS', '2.01.01.03.02.0003', 'imposto'],
  [/PAGAMENTOS PIX QR-CODE ESTADO DO PIAUI|ESTADO DO PIAUI|GOV PI ARREC ICMS/i, 'Pagamento ICMS', '2.01.01.03.01.0004', 'imposto'],
  [/RENDIMENTOS? REND PAGO APLIC/i, 'Rendimento aplicação financeira', '3.01.04.01.01.0001', 'financeira'],
  [/Pagamento fatura cartao/i, 'Pagamento fatura cartão', '2.01.01.15.02.0001', 'operacional'],
  [/HOME CONTABILIDADE/i, 'Honorários contábeis', '4.02.01.01.07.0001', 'operacional'],
  [/ALTERDATA/i, 'Despesa sistema ERP', '4.02.01.01.04', 'operacional'],
  [/AGUAS DE TERESINA|Agua e Esgoto/i, 'Despesa consumo (água)', '4.02.01.01.04.0001', 'operacional'],
  [/EQUATORIAL PIAUI|Energia Eletrica/i, 'Despesa consumo (energia)', '4.02.01.01.04.0006', 'operacional'],
  [/POSTO|COMBUST[ÍI]VEL/i, 'Despesa combustível', '4.02.01.01.06.0001', 'operacional'],
  [/TIM S A|Telefone/i, 'Despesa telefonia', '4.02.01.01.04.0007', 'operacional'],
  [/PIX (ENVIADO|RECEBIDO)|Pix (enviado|recebido)/i, 'Movimentação diversa via PIX ⚠️', '9.9.9.99', 'a_verificar'],
];

/**
 * Classifica um raw_transaction e retorna { debit_account, credit_account, category, status }
 * amount > 0  → entrada no banco → Débito = Banco, Crédito = contrapartida
 * amount < 0  → saída do banco   → Débito = contrapartida, Crédito = Banco
 */
export function classifyTransaction(tx, bankCoaCode) {
  const haystack = `${tx.description} ${tx.counterparty ?? ''}`;
  for (const [regex, category, counterpartAccount, natureza] of RULES) {
    if (regex.test(haystack)) {
      const [debit_account, credit_account] =
        tx.amount > 0 ? [bankCoaCode, counterpartAccount] : [counterpartAccount, bankCoaCode];
      return {
        debit_account,
        credit_account,
        category,
        status: natureza === 'a_verificar' ? 'manual_review' : 'matched',
      };
    }
  }
  return {
    debit_account: tx.amount > 0 ? bankCoaCode : '9.9.9.99',
    credit_account: tx.amount > 0 ? '9.9.9.99' : bankCoaCode,
    category: 'Não classificado ⚠️',
    status: 'manual_review',
  };
}
