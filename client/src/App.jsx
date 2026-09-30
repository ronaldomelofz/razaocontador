import { useEffect, useState, useCallback, Fragment } from 'react';
import { exportExcel, exportPdf } from './utils/exportClient';
import { fmtDate, fmt, isUnclassified, postingAccount } from './utils/format';
import { isFuelEntry } from './utils/fuel';
import ReclassifyPanel from './components/ReclassifyPanel';
import TaxAssessment from './components/TaxAssessment';
import SupplierBoletos from './components/SupplierBoletos';

const MONTHS_FALLBACK = ['2026-05', '2026-06', '2026-07'];
/** Processamento de novos meses: só no Vite local. Netlify permanece consulta. */
const CAN_PROCESS_MONTHS = import.meta.env.DEV;
const VIEWS = [
  { id: 'ledger', label: 'Livro Razão' },
  { id: 'fuel', label: 'Combustível' },
  { id: 'boletos', label: 'Boleto e pagamento diversos' },
  // Apuração: só em vite dev (não vai para o build Netlify).
  ...(import.meta.env.DEV ? [{ id: 'taxes', label: 'Apuração de Impostos' }] : []),
];

function statusLabel(s) {
  if (s === 'matched') return '✅ Conciliado';
  if (s === 'manual_review') return '⚠️ Revisão';
  if (s === 'pending') return 'Pendente';
  return s;
}

async function loadChartOfAccounts(staticCoa) {
  if (staticCoa?.length) return staticCoa;
  try {
    const res = await fetch('/api/ledger/chart-of-accounts');
    if (res.ok) return res.json();
  } catch { /* */ }
  return [];
}

async function loadData(month) {
  try {
    const [summaryRes, entriesRes, coaRes] = await Promise.all([
      fetch(`/api/ledger/summary?month=${month}`),
      fetch(`/api/ledger?month=${month}`),
      fetch(`/api/ledger/chart-of-accounts?from=${month}`),
    ]);
    if (summaryRes.ok && entriesRes.ok) {
      const staticRes = await fetch(`/data/ledger-${month}.json`);
      const meta = staticRes.ok ? await staticRes.json() : null;
      return {
        summary: await summaryRes.json(),
        entries: await entriesRes.json(),
        chartOfAccounts: coaRes.ok ? await coaRes.json() : (meta?.chartOfAccounts || []),
        fuelRecords: meta?.fuelRecords || [],
        source: 'api',
        meta,
      };
    }
  } catch { /* fallback */ }

  const staticRes = await fetch(`/data/ledger-${month}.json`);
  if (!staticRes.ok) throw new Error('Dados não disponíveis');
  const data = await staticRes.json();
  return {
    summary: data.summary || [],
    entries: data.entries || [],
    chartOfAccounts: data.chartOfAccounts || [],
    fuelRecords: data.fuelRecords || [],
    source: 'static',
    meta: data,
  };
}

export default function App() {
  const [month, setMonth] = useState('2026-07');
  const [months, setMonths] = useState(MONTHS_FALLBACK);
  const [summary, setSummary] = useState([]);
  const [entries, setEntries] = useState([]);
  const [chartOfAccounts, setChartOfAccounts] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState(null);
  const [fuelRecords, setFuelRecords] = useState([]);
  const [search, setSearch] = useState('');
  const [view, setView] = useState('ledger');
  const [showProcess, setShowProcess] = useState(false);
  const [processMonth, setProcessMonth] = useState('');
  const [networkMonths, setNetworkMonths] = useState([]);
  const [pendingMonths, setPendingMonths] = useState([]);
  const [processBusy, setProcessBusy] = useState(false);
  const [processMsg, setProcessMsg] = useState(null);
  const [processError, setProcessError] = useState(null);

  const refreshMonths = useCallback(async () => {
    const found = new Set(MONTHS_FALLBACK);
    let network = [];
    let pending = [];
    const urls = CAN_PROCESS_MONTHS
      ? ['/api/scan/months', '/api/tax-assessment/months', '/api/ledger/months']
      : ['/api/ledger/months'];
    for (const url of urls) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const data = await res.json();
        (data.months || []).forEach((m) => found.add(m));
        if (url.includes('/scan/months')) {
          network = data.network || [];
          pending = data.pending || [];
          setNetworkMonths(network);
          setPendingMonths(pending);
        }
      } catch { /* API local opcional */ }
    }
    const list = [...found].sort();
    setMonths(list);
    return { list, network, pending };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await loadData(month);
      setSummary(data.summary);
      setEntries(data.entries);
      setChartOfAccounts(await loadChartOfAccounts(data.chartOfAccounts));
      setFuelRecords(data.fuelRecords || data.meta?.fuelRecords || []);
      setMeta(data.meta || null);
      setAccountFilter('');
      setEditing(null);
      setExpanded(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    refreshMonths().then(({ list }) => {
      setMonth((cur) => (list.includes(cur) ? cur : list[list.length - 1]));
    });
  }, [refreshMonths]);

  async function openProcessDialog() {
    if (!CAN_PROCESS_MONTHS) return;
    setProcessMsg(null);
    setProcessError(null);
    const { list, network, pending } = await refreshMonths();
    const suggestion = pending[pending.length - 1]
      || network[network.length - 1]
      || '';
    setProcessMonth(suggestion);
    setShowProcess(true);
    if (!network.length && !list.length) {
      setProcessError('Não foi possível listar meses da rede. Verifique se o servidor local está rodando.');
    }
  }

  async function handleProcessMonth() {
    if (!CAN_PROCESS_MONTHS) return;
    const m = (processMonth || '').trim();
    const isAll = m === 'all' || m === '*';
    if (!isAll && !/^\d{4}-\d{2}$/.test(m)) {
      setProcessError('Informe o mês (YYYY-MM) ou selecione “Todos os meses”');
      return;
    }
    if (processBusy) return;
    setProcessBusy(true);
    setProcessMsg(null);
    setProcessError(null);
    try {
      const res = await fetch('/api/scan/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: isAll ? 'all' : m }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          data.error
          || (res.status === 500
            ? 'Servidor interrompeu o processamento (reinício ou erro interno). Tente novamente.'
            : `Falha ao processar (${res.status})`),
        );
      }
      await refreshMonths();
      if (isAll) {
        const last = data.months?.[data.months.length - 1] || networkMonths[networkMonths.length - 1];
        if (last) setMonth(last);
        const n = data.results?.length ?? data.months?.length ?? '—';
        setProcessMsg(`Todos os meses reprocessados (${n}). XMLs, extratos, anexos e boletos atualizados.`);
      } else {
        const s = data.stats || {};
        setMonth(m);
        setProcessMsg(
          `${m} processado: ${s.imported ?? '—'} lançamentos, ${s.fiscal ?? s.xmlImported ?? '—'} fiscais (XML), `
          + `${s.attachments ?? '—'} anexos, ${s.boletos ?? '—'} boletos/pagamentos.`,
        );
      }
      setShowProcess(false);
    } catch (err) {
      setProcessError(
        err.message?.includes('Failed to fetch')
          ? 'API local indisponível. Inicie o servidor (porta 3001) com acesso à pasta de rede da contadora.'
          : err.message,
      );
    } finally {
      setProcessBusy(false);
    }
  }

  const filtered = entries.filter((e) => {
    if (view === 'fuel' && !isFuelEntry(e)) return false;
    if (accountFilter && e.bank_account_id !== accountFilter) return false;
    if (statusFilter && e.status !== statusFilter) return false;
    if (search) {
      const hay = `${e.description} ${e.counterparty} ${e.category} ${e.debit_account} ${e.credit_account}`.toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const fuelDocs = fuelRecords.filter((r) => {
    if (r.is_fuel === false) return false;
    if (accountFilter && r.bank_account_id && r.bank_account_id !== accountFilter) return false;
    if (search) {
      const hay = `${r.file_name} ${r.station} ${r.doc_date}`.toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  });
  const fuelDocsTotal = fuelDocs.reduce((s, r) => s + (r.amount || 0), 0);
  const fuelDocsLinked = fuelDocs.filter((r) => r.status === 'conciliado').length;
  const fuelEntries = entries.filter(isFuelEntry);
  const fuelTotal = fuelEntries.reduce((s, e) => s + (e.amount || 0), 0);
  const fuelByBank = fuelEntries.reduce((acc, e) => {
    const b = e.bank_account_id || '—';
    acc[b] ??= { bank: b, total: 0, n: 0 };
    acc[b].total += e.amount || 0;
    acc[b].n += 1;
    return acc;
  }, {});

  const handleAccountClick = (accountId) => {
    setAccountFilter((prev) => (prev === accountId ? '' : accountId));
    setExpanded(null);
    setEditing(null);
    document.getElementById('livro-razao')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSaveReclassify = async (entryId, payload) => {
    const res = await fetch(`/api/ledger/${entryId}?month=${month}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao salvar reclassificação');
    }
    await refresh();
    setEditing(null);
  };

  const handleRowClick = (e) => {
    if (isUnclassified(e)) {
      setEditing(editing === e.id ? null : e.id);
      setExpanded(null);
    } else {
      setExpanded(expanded === e.id ? null : e.id);
      setEditing(null);
    }
  };

  const pending = entries.filter((e) => e.status === 'manual_review').length;
  const withAttach = entries.filter((e) => e.attachments?.length > 0).length;
  const colSpan = 10;

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>MADEPINUS - RAZÃO - CONCILIAÇÃO</h1>
        </div>
        <div className="header-actions">
          <button type="button" onClick={() => exportExcel(filtered, month)} className="btn">⬇ Excel</button>
          <button type="button" onClick={() => exportPdf(filtered, summary, month)} className="btn">⬇ PDF</button>
        </div>
      </header>

      {CAN_PROCESS_MONTHS && showProcess && (
        <div className="modal-backdrop" role="presentation" onClick={() => !processBusy && setShowProcess(false)}>
          <div
            className="modal-panel"
            role="dialog"
            aria-labelledby="process-month-title"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h2 id="process-month-title">Processar mês</h2>
            <p className="modal-hint">
              Varre todas as pastas e subpastas da contadora (incluindo XML e meses vizinhos),
              importa extratos, NF-e, anexos e combustível, classifica, concilia, gera boletos/pagamentos
              e atualiza o Livro Razão.
            </p>
            <label className="modal-label" htmlFor="process-month-input">
              Competência (YYYY-MM) ou todos
            </label>
            <div className="modal-row">
              <input
                id="process-month-input"
                type="text"
                className="search"
                placeholder="2026-08"
                value={processMonth}
                onChange={(ev) => setProcessMonth(ev.target.value)}
                disabled={processBusy}
                list="network-months-list"
              />
              <datalist id="network-months-list">
                <option value="all">Todos os meses na rede</option>
                {networkMonths.map((m) => (
                  <option key={m} value={m}>
                    {pendingMonths.includes(m) ? `${m} (pendente)` : m}
                  </option>
                ))}
              </datalist>
            </div>
            <div className="modal-row">
              <button
                type="button"
                className="btn-action secondary"
                disabled={processBusy}
                onClick={() => setProcessMonth('all')}
              >
                Todos os meses
              </button>
            </div>
            {processMonth === 'all' && (
              <p className="modal-hint">
                Reprocessa {networkMonths.length || 'todos os'} mês(es) da rede — pode demorar vários minutos.
              </p>
            )}
            {pendingMonths.length > 0 && processMonth !== 'all' && (
              <p className="modal-hint">
                Pendentes na rede: {pendingMonths.join(', ')}
              </p>
            )}
            {processMsg && <div className="process-msg">{processMsg}</div>}
            {processError && <div className="process-msg error">{processError}</div>}
            <div className="modal-actions">
              <button
                type="button"
                className="btn-action secondary"
                disabled={processBusy}
                onClick={() => setShowProcess(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-action"
                disabled={processBusy}
                onClick={handleProcessMonth}
              >
                {processBusy ? 'Processando…' : 'Processar'}
              </button>
            </div>
            {processBusy && (
              <p className="modal-hint">Isso pode levar alguns minutos. Não feche esta janela.</p>
            )}
          </div>
        </div>
      )}

      {CAN_PROCESS_MONTHS && processMsg && !showProcess && (
        <div className="process-msg" style={{ marginBottom: 12 }}>
          {processMsg}
          <button
            type="button"
            className="btn-sm"
            style={{ marginLeft: 12 }}
            onClick={() => setProcessMsg(null)}
          >
            ✕
          </button>
        </div>
      )}

      <div className="toolbar">
        {view !== 'taxes' && (
          <div className="month-tabs">
            {months.map((m) => (
              <button key={m} type="button" className={m === month ? 'tab active' : 'tab'} onClick={() => setMonth(m)}>
                {m}
              </button>
            ))}
            {CAN_PROCESS_MONTHS && (
              <button
                type="button"
                className="tab tab-process"
                onClick={openProcessDialog}
                title="Processar novo mês a partir da pasta da contadora"
              >
                + Processar mês
              </button>
            )}
          </div>
        )}
        <div className="view-tabs">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              className={view === v.id ? 'tab tab-view active' : 'tab tab-view'}
              onClick={() => { setView(v.id); setAccountFilter(''); setEditing(null); setExpanded(null); }}
            >
              {v.label}
            </button>
          ))}
        </div>
        {view !== 'taxes' && view !== 'boletos' && accountFilter && (
          <button type="button" className="chip" onClick={() => setAccountFilter('')}>
            Conta: {accountFilter} ✕
          </button>
        )}
        {view !== 'taxes' && view !== 'boletos' && (
          <input
            type="search"
            placeholder="Buscar histórico, conta, categoria..."
            value={search}
            onChange={(ev) => setSearch(ev.target.value)}
            className="search"
          />
        )}
      </div>

      {view === 'taxes' ? (
        <TaxAssessment />
      ) : view === 'boletos' ? (
        <SupplierBoletos month={month} />
      ) : (
        <>
      {meta && (
        <div className="meta-bar">
          Atualizado em {fmtDate(meta.generatedAt?.slice(0, 10))} {meta.generatedAt?.slice(11, 16)}
          · {meta.stats?.imported} lançamentos · {meta.stats?.attachments} anexos
          {meta.stats?.fuelDocuments != null && ` · ${meta.stats.fuelDocuments} cupons combustível`}
        </div>
      )}

      <div className="cards">
        {view === 'fuel' ? (
          <>
            <div className="card"><span className="card-n">{fuelDocs.length || fuelEntries.length}</span><span className="card-l">Documentos / abastecimentos</span></div>
            <div className="card warn"><span className="card-n">{fmt(fuelDocsTotal || fuelTotal)}</span><span className="card-l">Total combustível</span></div>
            <div className="card ok"><span className="card-n">{fuelDocsLinked}</span><span className="card-l">Cupons conciliados</span></div>
            <div className="card"><span className="card-n">{fuelDocs.length ? fuelDocs.length - fuelDocsLinked : 0}</span><span className="card-l">Só documento</span></div>
          </>
        ) : (
          <>
            <div className="card"><span className="card-n">{entries.length}</span><span className="card-l">Lançamentos</span></div>
            <div className="card warn"><span className="card-n">{pending}</span><span className="card-l">Pendentes</span></div>
            <div className="card ok"><span className="card-n">{withAttach}</span><span className="card-l">Com anexos</span></div>
            <div className="card"><span className="card-n">{summary.length}</span><span className="card-l">Contas bancárias</span></div>
          </>
        )}
      </div>

      {loading && <p className="loading">Carregando dados...</p>}
      {error && <p className="error">{error}</p>}

      {!loading && !error && (
        <>
          {view === 'fuel' ? (
            <>
              <section className="section">
                <h2>Cupons e notas — pasta COMBUSTÍVEL ({fuelDocs.length})</h2>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Data</th><th>Hora</th><th>Posto</th><th>Produto</th><th>Litros</th><th>Valor</th><th>Pagamento</th><th>Status</th><th>Cupom</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fuelDocs.map((r) => (
                      <tr key={r.id} className={r.is_fuel === false ? 'row-warn' : ''}>
                        <td className="nowrap">{fmtDate(r.doc_date)}</td>
                        <td>{r.doc_time || '—'}</td>
                        <td>{r.station || '—'}</td>
                        <td>{r.product || r.file_name}</td>
                        <td className="num">{r.liters != null ? r.liters.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—'}</td>
                        <td className="num">{r.amount != null ? fmt(r.amount) : '—'}</td>
                        <td>{r.payment || '—'}</td>
                        <td>
                          {r.status === 'conciliado' ? '✅ Conciliado' : '📄 Cupom'}
                          {r.note && <small> · {r.note}</small>}
                        </td>
                        <td>
                          {r.url ? (
                            <a href={r.url} target="_blank" rel="noreferrer" className="attach-link">📄 Abrir</a>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                    {fuelDocs.length === 0 && (
                      <tr><td colSpan={9} className="empty-msg">Nenhum documento na pasta COMBUSTÍVEL. Execute o pipeline com acesso à rede.</td></tr>
                    )}
                  </tbody>
                </table>
              </section>
              <section className="section">
                <h2>Combustível por conta bancária</h2>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Conta</th><th>Abastecimentos</th><th>Total (R$)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.values(fuelByBank).map((row) => (
                      <tr
                        key={row.bank}
                        className={accountFilter === row.bank ? 'row-selected' : 'row-clickable'}
                        onClick={() => handleAccountClick(row.bank)}
                        title="Clique para filtrar abastecimentos desta conta"
                      >
                        <td className="account-link">{row.bank}</td>
                        <td>{row.n}</td>
                        <td className="num">{fmt(row.total)}</td>
                      </tr>
                    ))}
                    {fuelEntries.length === 0 && (
                      <tr><td colSpan={3} className="empty-msg">Nenhum lançamento bancário de combustível neste mês.</td></tr>
                    )}
                  </tbody>
                </table>
              </section>
            </>
          ) : (
            <section className="section">
              <h2>Resumo por conta bancária</h2>
              <table className="table">
                <thead>
                  <tr>
                    <th>Conta</th><th>Entradas (R$)</th><th>Saídas (R$)</th><th>Lanç.</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((s) => (
                    <tr
                      key={s.bank_account_id}
                      className={accountFilter === s.bank_account_id ? 'row-selected' : 'row-clickable'}
                      onClick={() => handleAccountClick(s.bank_account_id)}
                      title="Clique para ver os lançamentos desta conta"
                    >
                      <td className="account-link">{s.bank_account_id}</td>
                      <td className="num">{fmt(s.entradas)}</td>
                      <td className="num">{fmt(s.saidas)}</td>
                      <td>{s.n}</td>
                      <td>{s.pendentes > 0 ? `⚠️ ${s.pendentes}` : '✅'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section className="section" id="livro-razao">
            <h2>
              {view === 'fuel' ? 'Gastos com combustível' : 'Livro Razão'} — {filtered.length} lançamento{filtered.length !== 1 ? 's' : ''}
              {accountFilter && <span className="filter-hint"> · {accountFilter}</span>}
            </h2>
            <table className="table ledger">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Histórico</th>
                  <th>Débito</th>
                  <th>Crédito</th>
                  <th>Valor</th>
                  <th>Categoria</th>
                  <th>Conta do Lançamento</th>
                  <th className="th-filter">
                    <span>Status</span>
                    <select
                      value={statusFilter}
                      onChange={(ev) => setStatusFilter(ev.target.value)}
                      className="th-select"
                      onClick={(ev) => ev.stopPropagation()}
                      aria-label="Filtrar por status"
                    >
                      <option value="">Todos</option>
                      <option value="matched">✅ Conciliado</option>
                      <option value="manual_review">⚠️ Revisão</option>
                      <option value="pending">Pendente</option>
                    </select>
                  </th>
                  <th>Anexos</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => {
                  const unclass = isUnclassified(e);
                  const posted = postingAccount(e);
                  return (
                    <Fragment key={e.id}>
                      <tr
                        className={unclass ? 'row-warn' : ''}
                        onClick={() => handleRowClick(e)}
                      >
                        <td className="nowrap">{fmtDate(e.entry_date)}</td>
                        <td className="desc">
                          {e.description}
                          {e.counterparty && <small> · {e.counterparty}</small>}
                        </td>
                        <td className="account" title={e.debit_name}>
                          <code>{e.debit_account}</code>
                          {e.debit_name && <small>{e.debit_name}</small>}
                        </td>
                        <td className="account" title={e.credit_name}>
                          <code>{e.credit_account}</code>
                          {e.credit_name && <small>{e.credit_name}</small>}
                        </td>
                        <td className="num">{fmt(e.amount)}</td>
                        <td>{e.category}</td>
                        <td className={unclass ? 'cell-pending' : ''}>
                          {unclass ? (
                            <span className="pending-account">⚠️ A definir</span>
                          ) : (
                            <>
                              <code>{posted?.code}</code>
                              {posted?.name && <small>{posted.name}</small>}
                            </>
                          )}
                        </td>
                        <td>{statusLabel(e.status)}</td>
                        <td>
                          {e.attachments?.length > 0 ? (
                            <span className="badge">
                              {e.attachments.length} 📎
                              {e.attachments.some((a) => /DANFE/i.test(a.file_name)) && ' 🧾'}
                            </span>
                          ) : e.category?.includes('cliente') ? '⚠️ sem NF' : '—'}
                        </td>
                        <td className="actions-cell">
                          {unclass && (
                            <button
                              type="button"
                              className="btn-sm"
                              onClick={(ev) => { ev.stopPropagation(); setEditing(e.id); setExpanded(null); }}
                            >
                              Classificar
                            </button>
                          )}
                        </td>
                      </tr>
                      {editing === e.id && (
                        <tr className="edit-row">
                          <td colSpan={colSpan}>
                            <ReclassifyPanel
                              entry={e}
                              chartOfAccounts={chartOfAccounts}
                              onSave={handleSaveReclassify}
                              onCancel={() => setEditing(null)}
                            />
                          </td>
                        </tr>
                      )}
                      {expanded === e.id && e.attachments?.length > 0 && (
                        <tr className="attach-row">
                          <td colSpan={colSpan}>
                            <div className="attach-list">
                              <strong>Documentos vinculados:</strong>
                              {e.attachments.map((a) => (
                                <a
                                  key={a.id || a.file_name}
                                  href={a.url || `/anexos/${month}/${a.file_name}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="attach-link"
                                >
                                  📄 {a.file_name}
                                  <small> ({a.match_type}, {(a.match_score * 100).toFixed(0)}%)</small>
                                </a>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </section>
        </>
      )}
        </>
      )}

      <footer className="footer">
        <a href="https://razaocontador.netlify.app/">razaocontador.netlify.app</a>
        · Plano de contas Alterdata (Balancete Madepinus)
      </footer>
    </div>
  );
}
