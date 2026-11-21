import json
from pathlib import Path
p = Path(r'e:\PROJETOS-CURSOR\RAZAO-CONTADOR\server\src\data\entradaDanfeOcr-2026-07.json')
data = json.loads(p.read_text(encoding='utf-8'))
for n in data['notes']:
    print('---', n['source_file'], 'p', n['page_index'])
    print('raw nf', n.get('doc_number'), 'serie', n.get('serie'), 'chave', n.get('chave_acesso'))
    print('emit', n.get('emit_name'), n.get('emit_cnpj'))
    print('dates', n.get('dates_found'))
    print('cfops', n.get('cfops'))
    print('taxes', {k: n.get(k) for k in ['base_icms','valor_icms','valor_produtos','valor_total_nf','valor_frete','valor_ipi']})
    print('merged', n.get('merged'))
    print('siat', n.get('siat'))
