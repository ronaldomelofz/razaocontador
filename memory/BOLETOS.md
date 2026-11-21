# BOLETOS

Aba UI: **Boleto e pagamento diversos** (`SupplierBoletos.jsx`).

## Geração

`server/src/scripts/buildBoletosFornecedores.py --month=YYYY-MM`

- Lê `ledger-YYYY-MM.json`
- Cruza Contas a Pagar (quando há)
- `link_comprovantes`: PDFs em `BANCO DO BRASIL/COMPROVANTES` e `BANCO ITAU/COMPROVANTES` na [[NETWORK]]
- Escreve `boletos-fornecedores-YYYY-MM.json` + fatias em `comprovantes/YYYY-MM/`

## Agosto/2026

- 69 itens · **68 com comprovante** (falta típica: conta consumo TIM)
- Chamado automaticamente no fim do [[PIPELINE]]

## Frontend

- Preferir API local; fallback `/data/...json`
- Não parsear HTML do Vite como JSON (já tratado)
