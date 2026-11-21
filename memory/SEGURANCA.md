# SEGURANCA

Defesa do Razão Contador contra exploração automatizada (incl. LLMs que monitoram CVEs).

## Princípios

1. **Fail-closed** no Netlify: sem `BASIC_AUTH_USER`/`BASIC_AUTH_PASSWORD` → site **503** (não público).
2. **Processar = só localhost** (`127.0.0.1:3001`); Netlify = consulta.
3. **Deploy** só com pedido explícito do usuário.
4. **Patch rápido**: Dependabot semanal + **npm audit no CI a cada push/PR**.
5. Dados financeiros em `/data` com `Cache-Control: private, no-store`.

## Por que audit no CI (necessário sim)

Ameaças automatizadas (LLMs) monitoram advisories e geram exploits antes do patch humano.  
`npm audit` a cada push **não substitui** Basic Auth/headers, mas **detecta CVE nova na árvore de deps** na mesma hora do commit — antes do deploy.

| Artefato | Função |
|----------|--------|
| `.github/workflows/npm-audit.yml` | Roda em todo push/PR |
| `scripts/ci-npm-audit.mjs` | Audita `client` + `server` |
| `.github/npm-audit-allowlist.yml` | Riscos aceitos sem patch (ex.: `xlsx`) — CVE **nova** fora da lista → CI vermelho |

Local: `node scripts/ci-npm-audit.mjs`

## Controles ativos

| Camada | Controle |
|--------|----------|
| Edge | `netlify/edge-functions/protect.js` — Basic Auth + comparação timing-safe |
| Headers | CSP, X-Frame-Options DENY, nosniff, COOP (`netlify.toml`) |
| API Netlify | CORS same-origin; PATCH só campos whitelist; erros genéricos |
| API local | Bind `127.0.0.1`; CORS só Vite; upload com basename + ext allowlist |
| Git | `.env*`, DB, `APURAÇÃO/`, anexos ignorados |
| Deps | Dependabot + **CI npm audit** (allowlist) |

## Variáveis Netlify (obrigatórias em prod)

- `BASIC_AUTH_USER`
- `BASIC_AUTH_PASSWORD` (forte, única)
- `GITHUB_TOKEN` (só se PATCH persistir no GitHub)
- **Não** definir `ALLOW_PUBLIC=1` em produção

## Checklist após advisory / update

1. Ler advisory → impacto em `xlsx` / `exceljs` / `react-router` / Express?
2. `cd client && npm audit` · `cd server && npm audit`
3. Atualizar patch/minor; testar pipeline local do mês corrente
4. Só então pedir deploy

## Riscos residuais (conhecidos)

- `xlsx` (SheetJS) sem fix no npm público — só ficheiros UNC confiáveis; na allowlist CI
- `vite`/`esbuild` (dev) — allowlist; upgrade major quando estável
- `exceljs`→`uuid` / `express`→`qs` — allowlist até major seguro
- Basic Auth não é 2FA — senha forte + não partilhar
- Ledger JSON versionado contém dados financeiros — acesso ao Git = acesso aos dados

Ver [[LOCAL-VS-NETLIFY]], [[DECISOES]].
