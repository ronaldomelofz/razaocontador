# MESES

Competências na rede: **2026-05 … 2026-11**.  
Reprocessamento completo (novos docs) + SIAT corrigido: **05/11/2026**.

| Mês | Lanç. | OK | Pend. | % | Cartão 57563 | Outros pend. | Boletos (compr.) | Combustível | SIAT entrada |
|-----|------:|---:|------:|--:|-------------:|-------------:|------------------:|------------:|-------------:|
| 05 | 146 | 130 | 16 | 11% | 0 | 16 | 68 (40) | 14 docs · 0 val. | — |
| 06 | 586 | 314 | 272 | 46% | 258 | 14 | 71 (61) | 11/11 · R$ 3.340 | — |
| 07 | 574 | 327 | 247 | 43% | 240 | 7 | 77 (70) | 13/13 · R$ 3.779 | **23 NF · R$ 194.509** |
| 08 | 696 | 341 | 355 | 51% | ~331 | ~24 | 69 (68) | 14/14 · R$ 4.142 | — (sem XLS SIAT) |
| 09 | 465 | 273 | 192 | 41% | 178 | 14 | 64 (63) | 11/12 · R$ 2.412 | **19 NF · R$ 193.630** |
| **10** | **610** | **303** | **307** | **50%** | **286** | **21** | 58 (26) | **7/7 · R$ 1.808** | **10 NF · R$ 110.138** |
| 11 | — | — | — | — | — | — | — | pasta quase vazia | não processar |

## Outubro/2026 — revisão 06/11/2026

Novos docs Itaú (manhã 06/11):
- Extrato **cartão 57563-6** → +344 lanç. (antes ausente)
- Contas 05068-7, 31689-7, 33489-0 (extratos vazios/0 lanç.)
- Evolução de parcelas (descritivo4–7)
- Comprovantes diversos + relatórios Cielo/Credishop/Rede

Resultado: 266→**610** lanç.; pend. 21→**307** (quase só cartão). Conta corrente continua ~21 pendências.  
SIAT 10 NF · combustível 7/7 inalterados.

## Correções de código

- `findSiatFile`: pasta `NOTAS FISCAL` (sing.) e `FISCAIS`
- `parseSiatEntrada`: detecta colunas por cabeçalho (legado + compacto set/out)

## Regras

- Não deploy Netlify sem pedido explícito.
- Filtrar UI: excluir `itau-57563-6` para ver pendências de conta corrente.

## NF-e / NFC-e × pagamento

JSON `fiscal-pagamentos-YYYY-MM.json` gerado (05–10/2026). Aba UI: **NF-e / NFC-e × Pagamento**. Ver [[FISCAL-PAGAMENTOS]].

Out/2026: 560 docs · 408 conciliados · 152 pendentes · 645 vendas cartão indexadas.

Atualizado: 2026-11-21.
