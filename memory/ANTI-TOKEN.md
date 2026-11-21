# ANTI-TOKEN

Checklist antes de gastar contexto:

1. Li `memory/00-INDICE.md`?
2. A pergunta é de **um mês**? → só arquivos daquele mês.
3. É path de rede? → [[NETWORK]] (não `walk` a UNC).
4. É “o que falta”? → [[GAPS]] + [[MESES]].
5. É deploy/produção? → [[LOCAL-VS-NETLIFY]].
6. É combustível/boletos/DAR? → nota específica, não o pipeline inteiro.

## Proibido por padrão

- `Get-ChildItem -Recurse` na UNC sem necessidade
- Reprocessar `--all` para inspecionar um campo
- Relistar `engine/` ou inventar segunda fonte de NETWORK
- Assumir que `/anexos` existe no Netlify
- **Deploy Netlify** sem pedido explícito do usuário nesta conversa

## Depois de mudar um fato permanente

Edite a nota correspondente neste vault (uma frase basta).
