# COA-BANCOS

Plano de contas Alterdata (balancete Abr/2026): `docs/PLANO_DE_CONTAS.md`, `server/src/data/chartOfAccounts.json`.

## Mapa de pastas → conta (`config.js`)

| Pasta rede | bank_account_id | COA |
|------------|-----------------|-----|
| BANCO DO BRASIL | bb-847-8 | 1.01.01.01.02.0001 |
| BANCO INTER | inter-9908006-0 | …0004 |
| BANCO BNB | bnb-119424-3 | …0005 |
| BANCO MERCADO PAGO | mercadopago | …0008 |
| Itaú 29660-2 | itau-29660-2 | …0002 |
| Itaú 57563-6 | itau-57563-6 | …0010 |
| Itaú 31689-7 / 05068-7 / 33489-0 | respectivos | ver `ITAU_ACCOUNT_MAP` |

Despesa combustível (heurística): prefixo `4.02.01.01.06`.

Pendências altas costumam concentrar em **itau-57563-6** (fatura cartão).
