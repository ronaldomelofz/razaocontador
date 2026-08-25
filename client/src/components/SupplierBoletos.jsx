import { useEffect, useState } from 'react';
import { fmtDate, fmt } from '../utils/format';

async function loadBoletos(month) {
  try {
    const res = await fetch(`/api/boletos-fornecedores?month=${month}`);
    if (res.ok) return res.json();
  } catch { /* fallback estático (Netlify) */ }
  const res = await fetch(`/data/boletos-fornecedores-${month}.json`);
  if (!res.ok) throw new Error(`Sem dados de boletos para ${month}`);
  return res.json();
}

function formaLabel(forma) {
  if (forma === 'boleto') return 'Boleto';
  if (forma === 'pix') return 'PIX';
  if (forma === 'sispag') return 'SISPAG';
  if (forma === 'ted') return 'TED/DOC';
  return forma || '—';
}

export default function SupplierBoletos({ month }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showOutros, setShowOutros] = useState(false);
  const [bankFilter, setBankFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setBankFilter('');
      try {
        const d = await loadBoletos(month);
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

  if (loading) return <p className="loading">Carregando boletos...</p>;
  if (error) return <p className="error">{error}</p>;
  if (!data) return null;

  const items = data.items || [];
  const fornecedoresAll = items.filter((i) => i.tipo === 'fornecedor');
  const banks = [...new Set(fornecedoresAll.map((i) => i.banco_curto).filter(Boolean))].sort();
  const fornecedores = bankFilter
    ? fornecedoresAll.filter((i) => i.banco_curto === bankFilter)
    : fornecedoresAll;
  const outros = items.filter((i) => i.tipo !== 'fornecedor');
  const s = data.summary || {};

  const sumOrig = fornecedores.reduce((a, i) => a + (i.valor_original || 0), 0);
  const sumJuros = fornecedores.reduce((a, i) => a + (i.juros_multa || 0), 0);
  const sumTot = fornecedores.reduce((a, i) => a + (i.valor_total || 0), 0);

  return (
    <>
      <div className="cards">
        <div className="card">
          <span className="card-n">{s.qtd_fornecedor ?? fornecedoresAll.length}</span>
          <span className="card-l">Pagamentos fornecedor</span>
        </div>
        <div className="card ok">
          <span className="card-n">{s.qtd_conciliados ?? 0}</span>
          <span className="card-l">Conciliados c/ título</span>
        </div>
        <div className="card warn">
          <span className="card-n">{fmt(s.total_juros_multa ?? sumJuros)}</span>
          <span className="card-l">Juros / multa</span>
        </div>
        <div className="card">
          <span className="card-n">{fmt(s.total_pago_fornecedor ?? sumTot)}</span>
          <span className="card-l">Total pago</span>
        </div>
      </div>

      {s.por_banco && Object.keys(s.por_banco).length > 0 && (
        <div className="meta-bar">
          Por banco:{' '}
          {Object.entries(s.por_banco).map(([b, v]) => (
            <button
              key={b}
              type="button"
              className={bankFilter === b ? 'chip active' : 'chip'}
              onClick={() => setBankFilter((cur) => (cur === b ? '' : b))}
            >
              {b}: {v.qtd} · R$ {fmt(v.total)}
            </button>
          ))}
          {bankFilter && (
            <button type="button" className="chip" onClick={() => setBankFilter('')}>Limpar filtro ✕</button>
          )}
        </div>
      )}

      {(data.notes?.length > 0) && (
        <div className="meta-bar boletos-notes">
          {data.notes.map((n) => (
            <div key={n}>{n}</div>
          ))}
        </div>
      )}

      <section className="section">
        <h2>Pagamentos a fornecedores — {month}{bankFilter ? ` · ${bankFilter}` : ''}</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Pagamento</th>
              <th>Banco</th>
              <th>Forma</th>
              <th>Fornecedor</th>
              <th>Título / NF</th>
              <th>Vencimento</th>
              <th className="num">Valor original</th>
              <th className="num">Juros / multa</th>
              <th className="num">Valor total</th>
              <th>Comprovante</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {fornecedores.map((r) => (
              <tr key={r.bank_id || `${r.data_pagamento}-${r.titulo}-${r.valor_total}-${r.forma}`}>
                <td className="nowrap">{fmtDate(r.data_pagamento)}</td>
                <td className="banco-cell">
                  <div>{r.banco_curto || r.banco || '—'}</div>
                  {r.comprovante?.agencia && (
                    <div className="boleto-obs">Ag {r.comprovante.agencia} · Cc {r.comprovante.conta}</div>
                  )}
                </td>
                <td className="nowrap">{formaLabel(r.forma)}</td>
                <td>
                  {r.fornecedor}
                  {r.obs && <div className="boleto-obs">{r.obs}</div>}
                </td>
                <td className="nowrap">{r.titulo || '—'}</td>
                <td className="nowrap">{fmtDate(r.vencimento)}</td>
                <td className="num">{r.valor_original != null ? fmt(r.valor_original) : '—'}</td>
                <td className={`num ${(r.juros_multa || 0) > 0 ? 'juros-pos' : ''}`}>
                  {r.juros_multa != null ? fmt(r.juros_multa) : '—'}
                </td>
                <td className="num">{fmt(r.valor_total)}</td>
                <td>
                  {r.comprovante?.url ? (
                    <a href={r.comprovante.url} target="_blank" rel="noreferrer" className="attach-link">
                      📄 Abrir
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  {r.status === 'conciliado' ? '✅ Conciliado' : '⚠️ Sem título'}
                </td>
              </tr>
            ))}
            {fornecedores.length === 0 && (
              <tr><td colSpan={11} className="empty-msg">Nenhum pagamento a fornecedor neste mês{bankFilter ? ' neste banco' : ''}.</td></tr>
            )}
          </tbody>
          {fornecedores.length > 0 && (
            <tfoot>
              <tr className="boletos-total">
                <td colSpan={6}>Totais</td>
                <td className="num">{fmt(sumOrig)}</td>
                <td className="num">{fmt(sumJuros)}</td>
                <td className="num">{fmt(sumTot)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </section>

      {outros.length > 0 && (
        <section className="section">
          <h2>
            <button type="button" className="linkish" onClick={() => setShowOutros((v) => !v)}>
              {showOutros ? '▾' : '▸'} Outros boletos (consumo / aluguel / pessoal / serviços) — {outros.length}
            </button>
          </h2>
          {showOutros && (
            <table className="table">
              <thead>
                <tr>
                  <th>Pagamento</th>
                  <th>Banco</th>
                  <th>Forma</th>
                  <th>Beneficiário</th>
                  <th className="num">Valor</th>
                  <th>Comprovante</th>
                  <th>Obs</th>
                </tr>
              </thead>
              <tbody>
                {outros.map((r) => (
                  <tr key={r.bank_id || `${r.data_pagamento}-${r.valor_total}`}>
                    <td className="nowrap">{fmtDate(r.data_pagamento)}</td>
                    <td>{r.banco_curto || r.banco || '—'}</td>
                    <td>{formaLabel(r.forma)}</td>
                    <td>{r.fornecedor}</td>
                    <td className="num">{fmt(r.valor_total)}</td>
                    <td>
                      {r.comprovante?.url ? (
                        <a href={r.comprovante.url} target="_blank" rel="noreferrer" className="attach-link">
                          📄 Abrir
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{r.obs || '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="boletos-total">
                  <td colSpan={4}>Total outros</td>
                  <td className="num">{fmt(outros.reduce((a, i) => a + (i.valor_total || 0), 0))}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          )}
        </section>
      )}

      {banks.length === 0 && null}
    </>
  );
}
