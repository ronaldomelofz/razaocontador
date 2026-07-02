# MADEPINUS — Livro Razão Digital

Sistema de conciliação contábil automática (partidas dobradas) para **Falcão & Frazão Ltda (MADEPINUS)**.
Cruza extratos bancários, XML fiscal (NF-e/NFC-e), comprovantes e boletos do servidor de rede,
gera o Livro Razão com anexos e publica em [razaocontador.netlify.app](https://razaocontador.netlify.app/) para a contadora.

## Funcionalidades

- **Livro Razão** com partidas dobradas (débito/crédito) conforme plano de contas Alterdata (balancete Madepinus)
- **Conciliação automática** entre extratos bancários, notas fiscais (XML), boletos e comprovantes
- **Anexos por lançamento** — PDF, JPG, TIFF, TXT vinculados automaticamente por data/valor/nome
- **Exportação** Excel (CSV) e PDF para a contadora
- **Varredura do servidor** `\\192.168.1.190\f\...\ALAINE - CONTADORA\<MM-AAAA>`

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Backend local | Node.js + Express + SQLite |
| Frontend | React (Vite) |
| Hospedagem | Netlify (site estático + dados exportados) |
| Parsers | CSV/TXT/XLSX/OFX (extratos), XML NF-e/NFC-e, PDF |

## Como rodar localmente

```bash
# 1. Backend (API na porta 3001)
cd server && npm install && npm run migrate && npm run dev

# 2. Frontend (porta 5173, proxy /api → backend)
cd client && npm install && npm run dev
```

## Processar dados do servidor de rede

```bash
cd server
npm run pipeline -- --month=2026-06
```

O pipeline:
1. Varre a pasta UNC do mês (`06-2026`, `05-2026`, etc.)
2. Importa extratos (Itaú, BB, Inter, BNB, Mercado Pago)
3. Importa XMLs fiscais e concilia com lançamentos bancários
4. Vincula comprovantes/anexos a cada lançamento
5. Exporta `client/public/data/ledger-YYYY-MM.json` + anexos em `client/public/anexos/`

## Deploy no Netlify

1. Execute o pipeline localmente (acesso à rede `\\192.168.1.190` necessário)
2. Faça build: `cd client && npm run build`
3. Publique no Netlify (pasta `client/dist` ou conecte o repositório Git)

O `netlify.toml` na raiz configura build e publicação automaticamente.

**Fluxo recomendado:** processar mensalmente na máquina com acesso ao servidor → commit dos JSONs e anexos → deploy automático no Netlify.

## Estrutura

```
server/src/
  config.js           # Caminho UNC, mapeamento bancos → COA
  data/chartOfAccounts.json
  engine/
    networkScanner.js # Varre pasta de rede
    linkAttachments.js# Vincula anexos a lançamentos
    runFullPipeline.js# Pipeline completo
    classify.js       # Regras de classificação contábil
    reconcile.js      # Conciliação banco ↔ fiscal
  parsers/            # Extratos, XML, PDF
  routes/             # API REST
client/src/
  App.jsx             # Interface do contador
  utils/exportClient.js
docs/
  PLANO_DE_CONTAS.md
  REGRAS_CLASSIFICACAO.md
```

## Plano de contas

Baseado no **Balancete Contábil 04/2026** (Alterdata/PROSIS) na raiz do projeto.
Códigos COA mapeados para contas bancárias:

| Banco | Código COA |
|-------|-----------|
| BB 847-8 | 1.01.01.01.02.0001 |
| Itaú 29660-2 | 1.01.01.01.02.0002 |
| Itaú 57563-6 | 1.01.01.01.02.0010 |
| Inter 9908006-0 | 1.01.01.01.02.0004 |
| BNB 119424-3 | 1.01.01.01.02.0005 |
| Mercado Pago | 1.01.01.01.02.0008 |

## Dados processados (jun/2026)

- 586 lançamentos bancários
- 743 documentos fiscais (XML)
- 34 conciliações banco ↔ fiscal
- 47 anexos vinculados automaticamente
