/** Exportação client-side para uso no Netlify (sem backend) */

function fmtDate(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportExcel(entries, month) {
  const headers = ['Data', 'Histórico', 'Conta Débito', 'Nome Débito', 'Conta Crédito', 'Nome Crédito', 'Valor', 'Categoria', 'Status', 'Banco', 'Anexos'];
  const rows = entries.map((e) => [
    fmtDate(e.entry_date),
    e.description,
    e.debit_account,
    e.debit_name || '',
    e.credit_account,
    e.credit_name || '',
    e.amount,
    e.category,
    e.status,
    e.bank_account_id || '',
    (e.attachments || []).map((a) => a.file_name).join('; '),
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';'))
    .join('\n');

  const bom = '\uFEFF';
  downloadBlob(new Blob([bom + csv], { type: 'text/csv;charset=utf-8' }), `livro_razao_${month}.csv`);
}

export function exportPdf(entries, summary, month) {
  const lines = [
    'MADEPINUS - RAZÃO - CONCILIAÇÃO',
    `Falcão & Frazão Ltda | Competência: ${month}`,
    `Gerado em: ${new Date().toLocaleString('pt-BR')}`,
    '',
    '--- RESUMO POR CONTA ---',
    ...summary.map((s) => `${s.bank_account_id}: entradas R$ ${(s.entradas || 0).toFixed(2)} | saídas R$ ${(s.saidas || 0).toFixed(2)}`),
    '',
    '--- LANÇAMENTOS ---',
    ...entries.map((e) =>
      `${fmtDate(e.entry_date)} | R$ ${e.amount.toFixed(2)} | D:${e.debit_account} C:${e.credit_account} | ${e.description} [${e.category}]`,
    ),
  ];

  downloadBlob(new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }), `livro_razao_${month}.txt`);
}
