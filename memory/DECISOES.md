# DECISOES

Fatos estáveis / regras de ouro. Atualizar só quando a regra mudar.

## Ambiente

| Decisão | Valor |
|---------|--------|
| Processar mês | **só local DEV** (`CAN_PROCESS_MONTHS` / Vite) |
| Netlify | **consulta** — ledger/boletos/combustível em `/data` |
| Deploy | **somente** se o usuário pedir na conversa |
| Auth Netlify | Basic Auth **obrigatória** (fail-closed sem env) — ver [[SEGURANCA]] |
| API local | Bind `127.0.0.1` — não expor pipeline na LAN |
| UNC | `\\192.168.1.190\f\ALAINE - CONTADORA` (`config.js`) |
| Anexos gitignore | `/anexos` não publica; usar `/data/comprovantes` e `/data/combustivel` |
| Índice de meses UI | `client/public/data/months.json` (pipeline grava) |

## Pipeline

| Decisão | Valor |
|---------|--------|
| Entry | `server/src/engine/runFullPipeline.js --month=YYYY-MM` |
| XML | mês + vizinhos; filtra `issue_date` |
| Companion | pasta `MM-AAAA-R` também varrida |
| Boletos | `buildBoletosFornecedores.py` no fim do full pipeline |
| Não usar | `npm run process` (legado uploads locais) para rede |

## Contábil

| Decisão | Valor |
|---------|--------|
| Pendências altas | tipicamente **itau-57563-6** (fatura cartão) |
| Combustível COA | prefixo `4.02.01.01.06` |
| DAR valores UI | só existem se houver `taxAssessmentYYYY-MM.js` |

## Memória

| Decisão | Valor |
|---------|--------|
| Hub | `memory/00-INDICE.md` |
| Volátil | stats/JSON → não colar na memória; só resumo em [[MESES]] |
| Modelo | mesmo espírito de `CLIENTES-CREDITOS/MEMORIA` |
