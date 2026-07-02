# Plano de Contas — Falcão & Frazão Ltda (Alterdata)
Extraído dos balancetes oficiais (Fev/2026 e Jul/2025). Usar como referência para
`server/src/engine/classify.js` e seed de `chart_of_accounts`.

## Ativo
- 1.01.01.01.01.0001 — Caixa
- 1.01.01.01.02 — Bancos Conta Movimento (subcontas por banco — confirmar mapeamento exato com contadora;
  bancos monitorados: Itaú 29660-2, Itaú 57563-6, Itaú 31689-7, Itaú 05068-7, Itaú 33489-0,
  BB 847-8, Inter 9908006-0, BNB 119424-3, Mercado Pago)
- 1.01.01.01.03.0001 — Aplicação Itaú (Auto Mais)
- 1.01.03.01.01.0001 — Duplicatas a Receber (Clientes Diversos)
- 1.01.03.01.02.0001 — Cartões a Receber — CrediShop
- 1.01.03.01.02.0003 — Cartões a Receber — Rede
- 1.01.04.01.01.0001 — Adiantamento a Fornecedores
- 1.01.04.01.05.0005 — ICMS a Recuperar
- 1.01.15.01.01.0001 — Estoque Mercadoria (Matriz)
- 1.02.03.01.01.000X — Imobilizado (Veículos, Máquinas, Terrenos etc.)

## Passivo
- 2.01.01.01.01.XXXX — Fornecedores Nacionais (1 subconta por fornecedor — ver lista completa no balancete)
- 2.01.01.02.01.0001 — Empréstimos (Cheque Especial)
- 2.01.01.03.01.0004 — ICMS a Recolher
- 2.01.01.03.01.0009 — ICMS Antecipação Parcial a Recolher
- 2.01.01.03.02.0003 — FGTS a Pagar
- 2.01.01.03.02.0005 — INSS a Pagar
- 2.01.01.03.02.0007 — Pró-labore a Pagar
- 2.01.01.15.02.0001 — Cartão de Crédito Inter a Pagar
- 2.01.01.15.02.0002 — Cartão de Crédito BB a Pagar
- 2.02.01.01.01.0001–0012 — Financiamentos/Empréstimos Longo Prazo (Itaú: veículo, giro, giro cartões, FGI, Pronampe)
- 2.02.01.03.01.0001 — Adiantamento Futuro Aumento de Capital (AFAC)
- 2.02.01.04.01.0001/0002 — Dividendos a Pagar (Ariosto / Ronaldo)

## Receitas
- 3.01.01.01.01.0001 — Receita de Venda de Mercadoria
- 3.01.02.01.01.0001/0004/0006 — (-) COFINS/ICMS/PIS s/ Venda
- 3.01.03.01.01.0001 — (-) Devoluções de Vendas
- 3.01.04.01.01.0001 — Receitas Financeiras

## Despesas
- 4.01.01.01.01.0001 — Custo da Mercadoria Vendida
- 4.02.01.01.01 — Despesa com Pessoal (salários, pró-labore, 13º, férias)
- 4.02.01.01.02 — Encargos Trabalhistas (FGTS, INSS)
- 4.02.01.01.04 — Despesas Operacionais (água, energia, telefone, aluguel)
- 4.02.01.01.06 — Manutenção e Conservação (combustível, veículos)
- 4.02.01.01.07.0001 — Assessoria Contábil
- 4.02.02.01.03 — Despesas Financeiras (tarifas, IOF, juros/multas, tarifa cartão)

## ⚠️ Pendências de mapeamento
- Confirmar com a contadora o código exato de subconta por banco em 1.01.01.01.02
  (a ordem das subcontas .0001/.0002/... variou entre os balancetes de Fev/2026 e Jul/2025).
- Completar lista de subcontas de Fornecedores Nacionais (2.01.01.01.01.XXXX) — 40+ fornecedores.
