# SAIDAS-DADOS

Raiz versionável: `client/public/data/`

| Artefato | Path |
|----------|------|
| Índice de meses (Netlify UI) | `months.json` |
| Ledger | `ledger-YYYY-MM.json` |
| Boletos/PIX/pagamentos | `boletos-fornecedores-YYYY-MM.json` |
| NF-e/NFC-e × pagamento | `fiscal-pagamentos-YYYY-MM.json` |
| Comprovantes (boletos) | `comprovantes/YYYY-MM/*.pdf` |
| Cupons combustível | `combustivel/YYYY-MM/*.pdf` |
| Módulo Express boletos | `server/src/data/boletosFornecedores.js` |
| OCR combustível | `server/src/data/fuelOcrYYYY-MM.js` |
| Tax oficial | `server/src/data/taxAssessmentYYYY-MM.js` |
| SIAT | `server/src/data/entradaSiat-YYYY-MM.json` |

SQLite local: `server/src/data/madepinus.db` (não versionar).

URLs públicas:

- Comprovante boleto: `/data/comprovantes/...`
- Cupom combustível: `/data/combustivel/...` (não depender de `/anexos/`)
