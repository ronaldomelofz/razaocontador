# APURACAO-DAR

Aba **Apuração de Impostos** = só DEV local. Pasta `APURAÇÃO/` gitignored.

## Mensagem da UI

> “Guias encontradas na pasta; valores ainda não lidos.”

Significa: PDFs DAR listados em `APURAÇÃO/YYYY-MM`, mas **não** há transcrição em `taxAssessmentYYYY-MM.js`.

## Onde os valores oficiais existem hoje

| Mês | Arquivo | Situação |
|-----|---------|----------|
| 2026-06 | `taxAssessment2026-06.js` | Completo (valores DAR) |
| 2026-07 | `taxAssessment2026-07.js` | Parcial (DAR ok; balancete incompleto) |
| 2026-05 / **08** | — | Guias na pasta, **valores ainda não transcritos** |
| 2026-09 | — | Vazio |

## Código

- UI: `client/src/components/TaxAssessment.jsx`
- Montagem: `server/src/engine/buildCompleteAssessment.js` (mensagem “não lidos”)
- Ingestão pasta: `ingestApuracao.js` + rede

## Próximo passo típico (ago)

OCR/ler cada `DAR NF *.pdf` / `DAR CTE *.pdf` e criar `taxAssessment2026-08.js` no mesmo formato de 06/07 — **não** exige full pipeline de banco.
