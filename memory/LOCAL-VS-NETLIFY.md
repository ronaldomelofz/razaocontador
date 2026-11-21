# LOCAL-VS-NETLIFY

## Local (DEV)

- Vite `import.meta.env.DEV` → botão **+ Processar mês**, aba **Apuração de Impostos**
- Express `:3001`: scan, pipeline, tax-assessment, boletos API, SQLite
- Pasta `APURAÇÃO/` (gitignored) + UNC

## Netlify (produção)

- Só consulta: ledger/boletos/combustível/comprovantes/`fiscal-pagamentos` em `/data/...`
- Aba **NF-e / NFC-e × Pagamento** é estática (sem rebuild no Netlify)
- Functions: GET ledger/summary/COA + PATCH reclassificação
- **Sem** processar rede, **sem** aba Apuração
- **Basic Auth obrigatória** (fail-closed) — ver [[SEGURANCA]]
- Headers: CSP / X-Frame-Options / `Cache-Control: private, no-store` em `/data`

## Deploy

**Só quando o usuário pedir.** Não publicar de ofício.

1. Gerar JSON localmente (`pipeline` / boletos / fuel)
2. Pipeline grava também `client/public/data/months.json` (lista competências com lançamentos)
3. Commit `client/public/data/**` (inclui `months.json`)
4. `git push` e/ou `netlify deploy --prod --build`  
   (auto-deploy Git já falhou antes — CLI garante)

UI Netlify lê **`/data/months.json`** (não depende mais do fallback `2026-05…07`).
API: `GET /api/ledger/months` também existe na function Netlify.

## Ignorado no Git (não vai ao Netlify via clone)

- `client/public/anexos/`
- `APURAÇÃO/`
- `server/data/*.db`, `attachments/`, `uploads/`
- `tmp_ocr_work/`

Combustível versionável: [[COMBUSTIVEL]] → `/data/combustivel/YYYY-MM/`.
