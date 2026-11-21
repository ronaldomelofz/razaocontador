# FISCAL-PAGAMENTOS

Aba **NF-e / NFC-e × Pagamento**: concilia saídas fiscais (mod 55/65) com formas de pagamento do XML e cruza com Cielo/Credishop + extratos.

## UI

- Tab id: `fiscalPay` em `client/src/App.jsx`
- Componente: `client/src/components/FiscalPagamentos.jsx`
- Colunas: Data · Nº documento · Tipo (NF-e/NFC-e) · Valor — forma · Correspondência · Status

## Dados

- Estático: `client/public/data/fiscal-pagamentos-YYYY-MM.json`
- API: `GET /api/fiscal-pagamentos?month=YYYY-MM`
- Rebuild local: `POST /api/fiscal-pagamentos/build` ou CLI abaixo

## Gerar

```bash
cd server
node src/engine/buildFiscalPagamentos.js --month=YYYY-MM
```

Também roda no passo 10 de `runFullPipeline.js`.

## Matching

1. Forma vem do XML (`pag.detPag.tPag` / `vPag`) — rótulos em `xmlFiscal.js` (`TPAG_LABELS`).
2. Cartão (03/04): CSV Cielo + Credishop em `OPERADORAS DE CARTÃO` (±2 dias, valor ±R$0,05).
3. PIX / depósito / transferência / espécie: `raw_transactions` do mês (±5 dias, keywords no histórico).

Só documentos de **saída** (não entradas SIAT). Cancelados ignorados.
