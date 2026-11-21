# 00 — Hub RAZAO-CONTADOR (estilo Obsidian)

Vault leve para Livro Razão **MADEPINUS** (Falcão & Frazão Ltda).  
Objetivo: decisões precisas + menos tokens — **não reexplorar** o que já está aqui.

> Modelo espelhado de `CLIENTES-CREDITOS/MEMORIA/00-HUB.md`: hub → nota do tema → só então código/UNC.

## Como o agente deve usar

1. Abrir **esta nota** + a nota do tema **antes** de varrer o monorepo.
2. `.cursor/rules/madepinus-memory.mdc` = regras curtas always-on.
3. Atualizar só **fatos estáveis** (path, comando, status de mês) — não dumps de JSON.
4. **Deploy Netlify** só quando o usuário pedir explicitamente nesta conversa.

## Mapa

| Tema | Nota | Quando abrir |
|------|------|----------------|
| Rede UNC / contadora | [[NETWORK]] | path, pastas, companion `-R` |
| Local vs Netlify | [[LOCAL-VS-NETLIFY]] | processar × consultar × deploy |
| Comandos de pipeline | [[PIPELINE]] | processar mês / full |
| Onde ficam JSON/PDFs | [[SAIDAS-DADOS]] | ledger, boletos, combustível |
| Status por competência | [[MESES]] | o que já foi apurado |
| Combustível / OCR | [[COMBUSTIVEL]] | cupons, export Excel/PDF |
| Boletos e comprovantes | [[BOLETOS]] | aba pagamentos |
| NF-e/NFC-e × pagamento | [[FISCAL-PAGAMENTOS]] | aba conciliação fiscal × formas |
| Apuração / DAR | [[APURACAO-DAR]] | guias “valores não lidos” |
| Plano de contas / bancos | [[COA-BANCOS]] | pasta → conta |
| Lacunas e fila | [[GAPS]] | o que falta |
| Economia de tokens | [[ANTI-TOKEN]] | checklist anti-reexploração |
| Decisões estáveis | [[DECISOES]] | regras de ouro do projeto |
| Segurança / defesa | [[SEGURANCA]] | Basic Auth, headers, deps, fail-closed |

## Stack em uma linha

`client` (React/Vite) + `server` (Express/SQLite/pipeline UNC) → `client/public/data` → Netlify estático (+ functions).

## Sites

| Ambiente | URL |
|----------|-----|
| Local | http://localhost:5173/ (+ API :3001) |
| Produção | https://razaocontador.netlify.app (Basic Auth) |

## Rede canônica

```
\\192.168.1.190\f\ALAINE - CONTADORA\<MM-AAAA>
```

## Processar mês (preferir)

```bash
cd server
node src/engine/runFullPipeline.js --month=YYYY-MM
```

Ver [[PIPELINE]]. Após processar: atualizar [[MESES]] e `months.json` (automático no pipeline).
