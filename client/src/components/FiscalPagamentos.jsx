import { useEffect, useMemo, useState } from 'react';
import { fmtDate, fmt } from '../utils/format';

async function loadFiscalPagamentos(month) {
  try {
    const res = await fetch(`/api/fiscal-pagamentos?month=${month}`);
    if (res.ok) {
      const text = await res.text();
      if (!text.trimStart().startsWith('<')) return JSON.parse(text);
    }
  } catch { /* fallback estático */ }
  const res = await fetch(`/data/fiscal-pagamentos-${month}.json`);
  if (!res.ok) throw new Error(`Sem dados de NF-e/NFC-e × pagamento para ${month}`);
  const text = await res.text();
  if (text.trimStart().startsWith('<')) {
    throw new Error(`Sem dados de NF-e/NFC-e × pagamento para ${month}`);
  }
  return JSON.parse(text);
}

function statusLabel(s) {
  if (s === 'conciliado') return '✅ Conciliado';
  if (s === 'parcial') return '◐ Parcial';
  return '⚠️ Pendente';
}

export default function FiscalPagamentos({ month }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [formaFilter, setFormaFilter] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const d = await loadFiscalPagamentos(month);
      setData(d);
    } catch (err) {
      setData(null);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setTypeFilter('');
      setStatusFilter('');
      setFormaFilter('');
      setSearch('');
      try {
        const d = await loadFiscalPagamentos(month);
        if (!cancelled) setData(d);
      } catch (err) {
        if (!cancelled) {
          setData(null);
          setError(err.message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [month]);

  async function handleRebuild() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/fiscal-pagamentos/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Falha (${res.status})`);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const formas = useMemo(() => {
    const set = new Set();
    for (const it of data?.items || []) {
      for (const p of it.payments || []) {
        if (p.forma) set.add(p.forma);
      }
    }
    return [...set].sort();
  }, [data]);

  const filtered = useMemo(() => {
    const items = data?.items || [];
    return items.filter((it) => {
      if (typeFilter && it.doc_type !== typeFilter) return false;
      if (statusFilter && it.status !== statusFilter) return false;
      if (formaFilter && !(it.payments || []).some((p) => p.forma === formaFilter)) return false;
      if (search) {
        const hay = `${it.doc_number} ${it.counterparty || ''} ${it.payment_summary || ''}`.toLowerCase();
        if (!hay.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [data, typeFilter, statusFilter, formaFilter, search]);

  if (loading) return <p className="loading">Carregando conciliação fiscal × pagamento...</p>;

  if (error && !data) {
    return (
      <div className="section">
        <p className="error">{error}</p>
        {import.meta.env.DEV && (
          <button type="button" className="btn" disabled={busy} onClick={handleRebuild}>
            {busy ? 'Gerando…' : 'Gerar agora a partir da rede'}
          </button>
        )}
      </div>
    );
  }

  const s = data?.summary || {};

  return (
    <>
      <div className="meta-bar">
        Atualizado em {fmtDate(data.generatedAt?.slice(0, 10))} {data.generatedAt?.slice(11, 16)}
        · {s.qtd_total} documentos · {s.card_sales_indexed ?? 0} vendas cartão indexadas
        {import.meta.env.DEV && (
          <>
            {' · '}
            <button type="button" className="chip" disabled={busy} onClick={handleRebuild}>
              {busy ? 'Gerando…' : '↻ Regenerar'}
            </button>
          </>
        )}
      </div>

      <div className="cards">
        <div className="card"><span className="card-n">{s.qtd_total ?? 0}</span><span className="card-l">NF-e + NFC-e</span></div>
        <div className="card"><span className="card-n">{s.qtd_nfce ?? 0}</span><span className="card-l">NFC-e</span></div>
        <div className="card"><span className="card-n">{s.qtd_nfe ?? 0}</span><span className="card-l">NF-e</span></div>
        <div className="card ok"><span className="card-n">{s.qtd_conciliados ?? 0}</span><span className="card-l">Conciliados</span></div>
        <div className="card warn"><span className="card-n">{(s.qtd_pendentes ?? 0) + (s.qtd_parciais ?? 0)}</span><span className="card-l">Pendentes / parciais</span></div>
        <div className="card"><span className="card-n">{fmt(s.total_valor)}</span><span className="card-l">Total (R$)</span></div>
      </div>

      <div className="filters-row" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <select className="th-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">Tipo (todos)</option>
          <option value="NFC-e">NFC-e</option>
          <option value="NF-e">NF-e</option>
        </select>
        <select className="th-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Status (todos)</option>
          <option value="conciliado">Conciliado</option>
          <option value="parcial">Parcial</option>
          <option value="pendente">Pendente</option>
        </select>
        <select className="th-select" value={formaFilter} onChange={(e) => setFormaFilter(e.target.value)}>
          <option value="">Forma (todas)</option>
          {formas.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <input
          type="search"
          className="search"
          placeholder="Buscar nº, cliente, forma..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && <p className="error">{error}</p>}

      <section className="section">
        <h2>Conciliação NF-e / NFC-e × pagamento ({filtered.length})</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Nº documento</th>
              <th>Tipo</th>
              <th>Valor — forma de pagamento</th>
              <th>Correspondência</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((it) => (
              <tr key={`${it.doc_type}-${it.doc_number}-${it.date}`}>
                <td className="nowrap">
                  {fmtDate(it.date)}
                  {it.time ? <small> {it.time}</small> : null}
                </td>
                <td className="nowrap">{it.doc_number}</td>
                <td>{it.doc_type}</td>
                <td>
                  <div><strong>{fmt(it.total_value)}</strong></div>
                  {(it.payments || []).map((p, idx) => (
                    <div key={idx} style={{ fontSize: '0.85rem', color: '#334' }}>
                      {p.forma}: {fmt(p.valor)}
                    </div>
                  ))}
                  {!it.payments?.length && (
                    <div style={{ fontSize: '0.85rem' }}>{it.payment_summary || '—'}</div>
                  )}
                </td>
                <td style={{ fontSize: '0.85rem' }}>
                  {(it.payments || []).map((p, idx) => (
                    <div key={idx}>
                      {p.match_status === 'conciliado'
                        ? `✅ ${p.match_detail || p.match_type}`
                        : '—'}
                    </div>
                  ))}
                </td>
                <td>{statusLabel(it.status)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="empty-msg">Nenhum documento com os filtros atuais.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}
