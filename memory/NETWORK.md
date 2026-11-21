# NETWORK

## Valor atual (fonte de verdade)

```
\\192.168.1.190\f\ALAINE - CONTADORA
```

Definido em `server/src/config.js` (`NETWORK_BASE`), override: env `NETWORK_PATH`.

## Estrutura na rede

- Competência: pasta `MM-AAAA` (ex.: `08-2026`)
- Companion: `MM-AAAA-R` (também varrida)
- Subpastas típicas: `BANCO DO BRASIL`, `BANCO ITAU`, `BANCO INTER`, `XML MM-AAAA`, `COMBUSTÍVEL`, `NOTAS FISCAL DE ENTRADA`, `APURAÇÃO…`, `COMPROVANTES`, etc.

## XML cruzado

Dumps Alterdata podem cobrir intervalo entre meses. O pipeline usa `collectXmlFilesForMonth` (mês + vizinhos) e filtra por `issue_date`.

## Não fazer

- Não reexplorar “qual o path da contadora” se `config.js` e o `networkRoot` do ledger do mês já batem.
- Ledgers antigos (05–07, 09) podem ainda citar path longo `GOOGLE DRIVE\...\ALAINE` — path curto atual é o correto pós-migração.
