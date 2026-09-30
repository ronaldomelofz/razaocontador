import { useEffect, useState } from 'react';
import { fmtDate, fmt } from '../utils/format';

async function loadBoletos(month) {
  try {
    const res = await fetch(`/api/boletos-fornecedores?month=${month}`);
    if (res.ok) {
      const text = await res.text();
      if (!text.trimStart().startsWith('<')) return JSON.parse(text);
    }
  } catch { /* fallback estático (Netlify) */ }
  const res = await fetch(`/data/boletos-fornecedores-${month}.json`);
  if (!res.ok) throw new Error(`Sem dados de pagamentos para ${month}`);
  const text = await res.text();
  if (text.trimStart().startsWith('<')) {
    throw new Error(`Sem dados de pagamentos para ${month}`);
  }
  return JSON.parse(text);
}

function formaLabel(forma) {
  const map = {
    boleto: 'Boleto',
    pix: 'PIX',
    sispag: 'SISPAG',
    ted: 'TED/DOC',
    conta_consumo: 'Conta',
    imposto: 'Imposto',
  };
  return map[forma] || forma || '—';
}

function tipoLabel(tipo) {
  const map = {
    fornecedor: 'Fornecedor',
    consumo: 'Consumo/serviço',
    transferencia: 'Transferência própria',
    pessoal: 'Pessoal/sócio',
    imposto: 'Imposto',
    seguro: 'Seguro',
    pix_diversos: 'PIX diversos',
    outros: 'Outros',
  };
  return map[tipo] || tipo || '—';
}

function statusLabel(r) {
  if (r.status === 'conciliado') return '✅ Conciliado';
  if (r.status === 'transferencia') return '↔ Transferência';
  if (r.comprovante) return '📄 Comprovante';
  return '⚠️ Sem título';
}

export default function SupplierBoletos({ month }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bankFilter, setBankFilter] = useState('');
  const [formaFilter, setFormaFilter] = useState('');
  const [onlyComprovante, setOnlyComprovante] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setBankFilter('');
      setFormaFilter('');
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

  if (loading) return <p className="loading">Carregando pagamentos...</p>;
  if (error) return <p className="error">{error}</p>;
  if (!data) return null;

  const items = data.items || [];
  const s = data.summary || {};

  let rows = items;
  if (bankFilter) rows = rows.filter((i) => i.banco_curto === bankFilter);
  if (formaFilter) rows = rows.filter((i) => i.forma === formaFilter);
  if (onlyComprovante) rows = rows.filter((i) => i.comprovante?.url);

  const sumOrig = rows.reduce((a, i) => a + (i.valor_original || 0), 0);
  const sumJuros = rows.reduce((a, i) => a + (i.juros_multa || 0), 0);
  const sumTot = rows.reduce((a, i) => a + (i.valor_total || 0), 0);
  const withComp = rows.filter((i) => i.comprovante?.url).length;

  return (
    <>
      <div className="cards">
        <div className="card">
          <span className="card-n">{s.qtd_total ?? items.length}</span>
          <span className="card-l">Pagamentos / PIX</span>
        </div>
        <div className="card ok">
          <span className="card-n">{s.qtd_com_comprovante ?? 0}</span>
          <span className="card-l">Com comprovante</span>
        </div>
        <div className="card warn">
          <span className="card-n">{fmt(s.total_juros_multa ?? 0)}</span>
          <span className="card-l">Juros / multa</span>
        </div>
        <div className="card">
          <span className="card-n">{fmt(s.total_pago_geral ?? 0)}</span>
          <span className="card-l">Total geral</span>
        </div>
      </div>

      {s.por_banco && Object.keys(s.por_banco).length > 0 && (
        <div className="meta-bar">
          Banco:{' '}
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
          {s.por_forma && Object.entries(s.por_forma).map(([f, v]) => (
            <button
              key={`f-${f}`}
              type="button"
              className={formaFilter === f ? 'chip active' : 'chip'}
              onClick={() => setFormaFilter((cur) => (cur === f ? '' : f))}
            >
              {formaLabel(f)}: {v.qtd}
            </button>
          ))}
          <button
            type="button"
            className={onlyComprovante ? 'chip active' : 'chip'}
            onClick={() => setOnlyComprovante((v) => !v)}
          >
            Só com comprovante
          </button>
          {(bankFilter || formaFilter || onlyComprovante) && (
            <button
              type="button"
              className="chip"
              onClick={() => { setBankFilter(''); setFormaFilter(''); setOnlyComprovante(false); }}
            >
              Limpar ✕
            </button>
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
        <h2>
          Boleto e pagamento diversos — {month}
          {bankFilter ? ` · ${bankFilter}` : ''}
          {formaFilter ? ` · ${formaLabel(formaFilter)}` : ''}
          {' '}({rows.length}{onlyComprovante ? ` · ${withComp} comprovantes` : ''})
        </h2>
        <table className="table">
          <thead>
            <tr>
              <th>Pagamento</th>
              <th>Banco</th>
              <th>Forma</th>
              <th>Tipo</th>
              <th>Beneficiário</th>
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
            {rows.map((r) => (
              <tr key={r.bank_id || `${r.data_pagamento}-${r.titulo}-${r.valor_total}-${r.forma}`}>
                <td className="nowrap">{fmtDate(r.data_pagamento)}</td>
                <td className="banco-cell">
                  <div>{r.banco_curto || r.banco || '—'}</div>
                  {r.comprovante?.agencia && (
                    <div className="boleto-obs">Ag {r.comprovante.agencia} · Cc {r.comprovante.conta}</div>
                  )}
                </td>
                <td className="nowrap">{formaLabel(r.forma)}</td>
                <td className="nowrap">{tipoLabel(r.tipo)}</td>
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
                <td>{statusLabel(r)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={12} className="empty-msg">
                  Nenhum pagamento neste filtro.
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="boletos-total">
                <td colSpan={7}>Totais ({rows.length})</td>
                <td className="num">{fmt(sumOrig)}</td>
                <td className="num">{fmt(sumJuros)}</td>
                <td className="num">{fmt(sumTot)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </section>
    </>
  );
}
