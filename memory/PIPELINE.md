# PIPELINE

## Preferir (dia a dia)

```bash
cd server
node src/engine/runFullPipeline.js --month=YYYY-MM
# ou
node src/engine/runFullPipeline.js --all
```

UI local: **+ Processar mês** → `POST /api/scan/process` (filho Node, não morre com `--watch`).

## O que o full pipeline faz

1. Varre UNC (`networkScanner`) + companion `-R`
2. Limpa SQLite do mês
3. Extratos → classifica → ledger
4. XMLs (mês + vizinhos) → fiscal
5. SIAT entradas (se houver)
6. Conciliação banco ↔ fiscal
7. Anexos + combustível (`linkFuelFolder`)
8. Exporta `ledger-YYYY-MM.json`
9. Roda `buildBoletosFornecedores.py --month=`
10. Roda `buildFiscalPagamentos.js` → `fiscal-pagamentos-YYYY-MM.json`

## Outros comandos (não confundir)

| Comando | Uso |
|---------|-----|
| `npm run process` | Só uploads locais (`runPipeline.js`) — legado |
| `python .../buildBoletosFornecedores.py --month=` | Só boletos/comprovantes |
| `node .../buildFiscalPagamentos.js --month=` | Só NF-e/NFC-e × pagamento (Cielo/Credishop/extratos) |
| `node .../refreshFuelLedger.js --month=` | Só combustível no ledger |
| `node .../reclassifyPendingMonth.js --month=` | Reaplica `classify.js` em `manual_review` (sem reimportar) |
| Tax UI Conciliar/Apurar | `processMonth.js` + apuração |

## Entry files

- `server/src/engine/runFullPipeline.js`
- `server/src/routes/scan.js`
- `server/src/engine/networkScanner.js`

Ver também [[SAIDAS-DADOS]], [[NETWORK]].
