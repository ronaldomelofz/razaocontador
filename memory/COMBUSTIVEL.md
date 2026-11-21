# COMBUSTIVEL

## Fluxo

1. Pasta UNC `COMBUSTÍVEL` sob o mês
2. `linkFuelFolder.js` copia para `/data/combustivel/YYYY-MM/` (+ legado anexos local)
3. Enrichers OCR: `fuelOcr2026-06` … `08`, **`09`**, **`10`**
4. Match com lançamentos (conta combustível / POSTO) por data+valor
5. Registrar mês novo em `FUEL_ENRICHERS_BY_MONTH` (`linkFuelFolder.js`)

## Agosto/2026

- 14 cupons com **valor preenchido** (NFC-e texto + OCR digitalizados)
- Total ≈ R$ 4.142,14 (há duplicatas NFC-e ↔ digitalizado na pasta)
- Script: `server/src/scripts/ocrFuelMonth.py`, refresh: `refreshFuelLedger.js`

## Setembro/2026

- 12 digitalizados · **11/12 com valor** · total **R$ 2.411,89** · **2 conciliados**
- 1 sem valor: `Digitalizado_20260928-0718.pdf`
- `fuelOcr2026-09.js`

## Outubro/2026

- 7 digitalizados · **7/7 com valor** · total **R$ 1.807,83**
- 0 conciliados ao extrato (ainda)
- `fuelOcr2026-10.js` (OCR + limpeza de posto/data)

## Exportação (local + Netlify)

- Aba **Combustível**: Excel (`combustivel_YYYY-MM.csv`) e PDF/imprimir (janela de impressão do navegador)
- Client-side em `client/src/utils/exportClient.js` — sem API

## Não fazer

- Não re-OCR todos os meses se só um cupom mudou.
- Não publicar só em `/anexos/` (gitignore).
