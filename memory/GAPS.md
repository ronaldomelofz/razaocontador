# GAPS

Fila permanente (atualizar ao resolver).

## Aberto

0. **Deps** — `xlsx` sem patch no npm; `vite`/`exceljs`/`qs` na allowlist CI — ver [[SEGURANCA]]
1. **DAR ago/mai** — pasta tem guias; sem `taxAssessment` → valores “—” ([[APURACAO-DAR]])
2. **manual_review** concentrado em **itau-57563-6** (06–09) — fatura cartão
3. **Set/2026** — 14 pendências não-cartão; 1 cupom sem valor (`…0718.pdf`)
4. **Combustível** — cupons com valor sem vínculo ao extrato (vários meses)
5. **Boletos out** — 26/58 comprovantes; `sem_titulo` alto
6. **Mai combustível** — 14 docs sem OCR de valor
7. **Ago SIAT** — sem XLS na pasta (só digitalizados)
8. **2026-11** — pasta quase vazia; não processar
9. **Anexos DANFE** — `/anexos` não publica no Netlify

## Fechado recentemente

- Reprocessamento **05–10** com docs novos (05/11/2026)
- Parser SIAT multi-layout + pasta `NOTAS FISCAL` · out **10 NF / R$ 110k**
- SIAT jul/set importados · combustível 06/07 com cupons a mais
- Deploy só sob pedido
