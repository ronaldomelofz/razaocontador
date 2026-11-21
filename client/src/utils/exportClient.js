/** Exportação client-side para uso no Netlify (sem backend) */

function fmtDate(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

function fmtMoney(n) {
  if (n == null || Number.isNaN(Number(n))) return '';
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtLiters(n) {
  if (n == null || Number.isNaN(Number(n))) return '';
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function statusFuel(r) {
  if (r.status === 'conciliado') return 'Conciliado';
  return 'Cupom';
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

/** Relatório de gastos com combustível (cupons) → CSV para Excel */
export function exportFuelExcel(fuelDocs, month, { byBank = [] } = {}) {
  const headers = ['Data', 'Hora', 'Posto', 'Produto', 'Litros', 'Valor (R$)', 'Pagamento', 'Status', 'Arquivo'];
  const rows = fuelDocs.map((r) => [
    fmtDate(r.doc_date),
    r.doc_time || '',
    r.station || '',
    r.product || r.file_name || '',
    r.liters != null ? String(r.liters).replace('.', ',') : '',
    r.amount != null ? String(r.amount).replace('.', ',') : '',
    r.payment || '',
    statusFuel(r) + (r.note ? ` — ${r.note}` : ''),
    r.file_name || '',
  ]);

  const total = fuelDocs.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  rows.push(['', '', '', 'TOTAL', '', String(total).replace('.', ','), '', '', '']);

  if (byBank.length) {
    rows.push([]);
    rows.push(['Conta bancária', 'Abastecimentos', 'Total (R$)']);
    for (const b of byBank) {
      rows.push([b.bank, b.n, String(b.total).replace('.', ',')]);
    }
  }

  const csv = [headers, ...rows]
    .map((row) => row.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';'))
    .join('\n');

  const bom = '\uFEFF';
  downloadBlob(new Blob([bom + csv], { type: 'text/csv;charset=utf-8' }), `combustivel_${month}.csv`);
}

/** Relatório combustível → abre janela de impressão (Salvar como PDF) */
export function exportFuelPdf(fuelDocs, month, { byBank = [] } = {}) {
  const total = fuelDocs.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const totalLiters = fuelDocs.reduce((s, r) => s + (Number(r.liters) || 0), 0);

  const bodyRows = fuelDocs.map((r) => `
    <tr>
      <td>${fmtDate(r.doc_date)}</td>
      <td>${r.doc_time || '—'}</td>
      <td>${escapeHtml(r.station || '—')}</td>
      <td>${escapeHtml(r.product || r.file_name || '—')}</td>
      <td class="num">${r.liters != null ? fmtLiters(r.liters) : '—'}</td>
      <td class="num">${r.amount != null ? fmtMoney(r.amount) : '—'}</td>
      <td>${escapeHtml(r.payment || '—')}</td>
      <td>${escapeHtml(statusFuel(r))}${r.note ? `<br><small>${escapeHtml(r.note)}</small>` : ''}</td>
    </tr>
  `).join('');

  const bankRows = byBank.map((b) => `
    <tr>
      <td>${escapeHtml(b.bank)}</td>
      <td class="num">${b.n}</td>
      <td class="num">${fmtMoney(b.total)}</td>
    </tr>
  `).join('');

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Combustível ${month} — MADEPINUS</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #1a1a1a; margin: 24px; }
    h1 { font-size: 16px; margin: 0 0 4px; color: #1a5c32; }
    h2 { font-size: 13px; margin: 20px 0 8px; color: #1a5c32; }
    .meta { color: #555; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    th { background: #1a5c32; color: #fff; text-align: left; padding: 6px 8px; font-weight: 600; }
    td { border-bottom: 1px solid #ddd; padding: 5px 8px; vertical-align: top; }
    tr:nth-child(even) td { background: #f5f7f6; }
    .num { text-align: right; white-space: nowrap; }
    tfoot td { font-weight: 700; background: #e8f0eb !important; border-top: 2px solid #1a5c32; }
    small { color: #666; }
    @media print {
      body { margin: 12px; }
      a { color: inherit; text-decoration: none; }
    }
  </style>
</head>
<body>
  <h1>MADEPINUS — Relatório de gastos com combustível</h1>
  <div class="meta">
    Falcão &amp; Frazão Ltda · Competência <strong>${month}</strong><br/>
    Gerado em ${new Date().toLocaleString('pt-BR')} · ${fuelDocs.length} cupom(ns)
    · Total R$ ${fmtMoney(total)}
    ${totalLiters ? ` · ${fmtLiters(totalLiters)} L` : ''}
  </div>

  <h2>Cupons e notas — pasta COMBUSTÍVEL</h2>
  <table>
    <thead>
      <tr>
        <th>Data</th><th>Hora</th><th>Posto</th><th>Produto</th>
        <th>Litros</th><th>Valor (R$)</th><th>Pagamento</th><th>Status</th>
      </tr>
    </thead>
    <tbody>${bodyRows || '<tr><td colspan="8">Nenhum cupom neste período.</td></tr>'}</tbody>
    <tfoot>
      <tr>
        <td colspan="4">TOTAL</td>
        <td class="num">${totalLiters ? fmtLiters(totalLiters) : '—'}</td>
        <td class="num">${fmtMoney(total)}</td>
        <td colspan="2"></td>
      </tr>
    </tfoot>
  </table>

  ${byBank.length ? `
  <h2>Por conta bancária (lançamentos do razão)</h2>
  <table>
    <thead><tr><th>Conta</th><th>Abastecimentos</th><th>Total (R$)</th></tr></thead>
    <tbody>${bankRows}</tbody>
  </table>` : ''}

  <script>
    window.onload = function () {
      window.focus();
      window.print();
    };
  </script>
</body>
</html>`;

  const w = window.open('', '_blank');
  if (!w) {
    downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), `combustivel_${month}.html`);
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
