import { useEffect, useState, useCallback, Fragment } from 'react';
import { exportExcel, exportPdf } from './utils/exportClient';
import { fmtDate, fmt, isUnclassified, postingAccount } from './utils/format';
import { isFuelEntry } from './utils/fuel';
import ReclassifyPanel from './components/ReclassifyPanel';

const MONTHS = ['2026-05', '2026-06'];
const VIEWS = [
  { id: 'ledger', label: 'Livro Razão' },
  { id: 'fuel', label: 'Combustível' },
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
    source: 'static',
    meta: data,
  };
}

export default function App() {
  const [month, setMonth] = useState('2026-06');
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
  const [search, setSearch] = useState('');
  const [view, setView] = useState('ledger');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await loadData(month);
      setSummary(data.summary);
      setEntries(data.entries);
      setChartOfAccounts(await loadChartOfAccounts(data.chartOfAccounts));
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

      <div className="toolbar">
        <div className="month-tabs">
          {MONTHS.map((m) => (
            <button key={m} type="button" className={m === month ? 'tab active' : 'tab'} onClick={() => setMonth(m)}>
              {m}
            </button>
          ))}
        </div>
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
        {accountFilter && (
          <button type="button" className="chip" onClick={() => setAccountFilter('')}>
            Conta: {accountFilter} ✕
          </button>
        )}
        <input
          type="search"
          placeholder="Buscar histórico, conta, categoria..."
          value={search}
          onChange={(ev) => setSearch(ev.target.value)}
          className="search"
        />
      </div>

      {meta && (
        <div className="meta-bar">
          Atualizado em {fmtDate(meta.generatedAt?.slice(0, 10))} {meta.generatedAt?.slice(11, 16)}
          · {meta.stats?.imported} lançamentos · {meta.stats?.attachments} anexos
        </div>
      )}

      <div className="cards">
        {view === 'fuel' ? (
          <>
            <div className="card"><span className="card-n">{fuelEntries.length}</span><span className="card-l">Abastecimentos</span></div>
            <div className="card warn"><span className="card-n">{fmt(fuelTotal)}</span><span className="card-l">Total combustível</span></div>
            <div className="card"><span className="card-n">{fuelEntries.length ? fmt(fuelTotal / fuelEntries.length) : '0,00'}</span><span className="card-l">Média por abastecimento</span></div>
            <div className="card ok"><span className="card-n">{Object.keys(fuelByBank).length}</span><span className="card-l">Contas bancárias</span></div>
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
                    <tr><td colSpan={3} className="empty-msg">Nenhum gasto com combustível neste mês.</td></tr>
                  )}
                </tbody>
              </table>
            </section>
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

      <footer className="footer">
        <a href="https://razaocontador.netlify.app/">razaocontador.netlify.app</a>
        · Plano de contas Alterdata (Balancete Madepinus)
      </footer>
    </div>
  );
}
