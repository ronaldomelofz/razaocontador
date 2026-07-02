# Regras de Classificação — Padrões identificados nos extratos reais

| Padrão (regex) | Categoria | Natureza |
|---|---|---|
| `TRANSFERÊNCIA AUTOM. RECEBIDA 8840...` | Recebimento cartão (concentrador Itaú) | Operacional |
| `TEG EX GAR` | Repasse garantia cartão | Operacional |
| `PIX - Recebido CREDI SHOP` | Recebimento cartão CrediShop (BB) | Operacional |
| `JUROS SALDO DEVEDOR/EXCESSO/ATRASO/MORA` | Juros bancários | Financeira |
| `IOF` | IOF sobre crédito | Financeira |
| `TAR CONTR/RENOV CTA GAR` / `Tarifa Pacote` | Tarifa bancária | Financeira |
| `FIN VEIC` | Financiamento veículo | Financeira |
| `PARCIAL/PARCELA GIRO` | Empréstimo capital de giro | Financeira |
| `RENEGOCIAÇÃO ITAU` | Renegociação de dívida | Financeira |
| `BOLETO PAGO` / `Pagamento de Boleto` | Pagamento a fornecedor | Operacional |
| `RECEITA FEDERAL` | DARF (INSS/IRRF) | Imposto |
| `CEF MATRIZ` | FGTS | Imposto |
| `ESTADO DO PIAUI` / `GOV PI ARREC ICMS` | ICMS | Imposto |
| `PIX ENVIADO MADEPINUS` | Transferência entre contas próprias | Interna |
| `PIX (ENVIADO\|RECEBIDO) RONALDO` | Movimentação com sócio | Societária |
| `RENDIMENTOS REND PAGO APLIC` | Rendimento aplicação | Financeira |

## Casos especiais (CFOP fiscal)
- **5551** — Remessa de bem/ativo → NÃO é venda; não soma na base ICMS/PIS/COFINS de vendas.
- **5922** — Retorno → excluir da base de vendas; verificar natureza da operação original.
- **5929** — Devolução de venda → já tratado como dedução no balancete (conta 3.01.03.01.01).

## Itens que caem em "manual_review" (⚠️)
- PIX enviado/recebido sem padrão reconhecido (contraparte não identificada nas regras).
- Qualquer lançamento cujo valor não bate com nenhum documento fiscal na janela de conciliação (±3 dias).

## Como adicionar uma regra nova
Editar `server/src/engine/classify.js`, array `RULES`, no formato:
```js
[/REGEX/i, 'Categoria legível', 'código.conta.contábil', 'natureza']
```
Regras são avaliadas em ordem — a primeira que casar vence. Colocar regras mais específicas primeiro.
