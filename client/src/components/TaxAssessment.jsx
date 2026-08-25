import { useEffect, useState } from 'react';
import { fmt, fmtDate } from '../utils/format';

function Money({ v }) {
  if (v == null) return <span>—</span>;
  return <span className={v < 0 ? 'neg' : ''}>{fmt(v)}</span>;
}

async function loadMonths() {
  try {
    const res = await fetch('/api/tax-assessment/months');
    if (!res.ok) return [];
    const data = await res.json();
    return data.months || [];
  } catch {
    return [];
  }
}

async function loadAssessment(month) {
  let res;
  try {
    res = await fetch(`/api/tax-assessment?month=${month}`);
  } catch {
    throw new Error('Servidor local indisponível. Na pasta server, rode: npm run dev');
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error('Servidor local indisponível ou resposta inválida. Na pasta server, rode: npm run dev');
  }
  if (!res.ok) throw new Error(data?.error || 'Falha ao carregar apuração');
  if (!data) throw new Error('Servidor local indisponível. Na pasta server, rode: npm run dev');
  return data;
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error('Resposta inválida do servidor');
  }
  if (!res.ok) throw new Error(data?.error || `Falha em ${url}`);
  return data;
}

function formatProcessResult(action, result) {
  const s = result.summary || {};
  if (action === 'conciliar') {
    return `Conciliação ${result.month}: ${s.novasConcilicoes || 0} novos cruzamentos banco↔NF · ${s.anexosVinculados || 0} anexos · ${s.combustivelVinculados || 0} cupons combustível · ${s.lancamentosConciliados || 0} conciliados / ${s.lancamentosEmRevisao || 0} em revisão.`;
  }
  const missing = (s.missing || []).length ? ` Faltam: ${s.missing.join(', ')}.` : '';
  return `Apuração ${result.month}: ${s.docsCopiados || 0} docs copiados · SIAT ${s.siatNotas || 0} NF · ICMS saídas ${s.icmsDebitoSaidas != null ? s.icmsDebitoSaidas.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—'} · antecipação ${s.icmsAntecipacao != null ? s.icmsAntecipacao.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—'} · DARs ${s.darsTotal != null ? s.darsTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—'}.${missing}`;
}

const NEEDS = [
  {
    title: 'ICMS — antecipação tributária (Decreto 21.866/2023-PI)',
    detail: 'O OCR dos DANFEs digitalizados já extrai base/ICMS/alíquota quando a leitura é confiável. Scans ruins ficam sem ICMS — complete com a "Memória de Cálculo ICMS" da contadora ou XMLs dos fornecedores.',
  },
  {
    title: 'PIS/COFINS não-cumulativo',
    detail: 'O regime dá crédito sobre insumos/energia/frete. O balancete mostra o valor final já apurado, mas não o memorial de quais lançamentos geraram crédito — preciso continuar recebendo esse valor pronto (balancete ou memória específica).',
  },
  {
    title: 'IRPJ/CSLL (Lucro Real mensal)',
    detail: 'Depende do resultado contábil fiscal (DRE) + adições/exclusões + compensação de prejuízo fiscal (30%), que só a contabilidade fecha. Preciso da "Memória de Cálculo IRPJ e CSLL" atualizada a cada mês fechado.',
  },
  {
    title: 'Atualização mensal',
    detail: 'SIAT: importSiatEntrada.js. DANFEs: ocrDanfeEntrada.py. Apuração oficial: Balancete + Memórias + DAR na pasta APURAÇÃO.',
  },
];

function EntradasSiatSection({ entradas }) {
  if (!entradas) {
    return (
      <section className="section info-box">
        <h2>Notas fiscais de entrada (SIAT + OCR)</h2>
        <p style={{ fontSize: '0.8125rem', color: '#5a6a7e' }}>
          Ainda não importadas para este mês. Com a pasta de rede acessível, rode
          <code> node server/src/scripts/importSiatEntrada.js --month=YYYY-MM</code>
          {' '}e{' '}
          <code> python server/src/scripts/ocrDanfeEntrada.py --month=YYYY-MM</code>.
        </p>
      </section>
    );
  }
  const { summary, notes, source, generatedAt } = entradas;
  const antecipNotes = notes.filter((n) => n.icms_antecipacao_estimada != null && n.icms_antecipacao_estimada > 0);
  return (
    <section className="section">
      <h2>Notas fiscais de entrada — SIAT + OCR ({summary.notes} NF · {fmt(summary.totalProdutos)})</h2>
      <p style={{ fontSize: '0.8125rem', color: '#5a6a7e', marginBottom: 8 }}>
        Fonte: {source} · filtro: <strong>data de entrada</strong> no mês
        · gerado em {fmtDate(generatedAt?.slice(0, 10))} {generatedAt?.slice(11, 16)}
        · OCR com ICMS: {summary.withIcms || 0}/{summary.notes}
        {summary.totalIcms ? ` · ICMS destacado OCR ${fmt(summary.totalIcms)}` : ''}
        {summary.totalIcmsAntecipacaoEstimada
          ? ` · antecipação estimada ${fmt(summary.totalIcmsAntecipacaoEstimada)}`
          : ''}
        {(summary.excluidasSemDataEntrada || summary.excluidasOutroMesEntrada) ? (
          <> · excluídas do SIAT: {summary.excluidasSemDataEntrada || 0} sem data entrada
            {summary.excluidasOutroMesEntrada ? `, ${summary.excluidasOutroMesEntrada} outro mês` : ''}
          </>
        ) : null}
      </p>
      <div className="cards" style={{ marginBottom: 12 }}>
        <div className="card">
          <span className="card-n">{summary.withOcr || 0}</span>
          <span className="card-l">NF com OCR DANFE</span>
        </div>
        <div className="card ok">
          <span className="card-n">{summary.withIcms || 0}</span>
          <span className="card-l">NF com ICMS lido</span>
        </div>
        <div className="card">
          <span className="card-n">{fmt(summary.totalIcms || 0)}</span>
          <span className="card-l">ICMS destacado (OCR)</span>
        </div>
        <div className="card warn">
          <span className="card-n">{fmt(summary.totalIcmsAntecipacaoEstimada || 0)}</span>
          <span className="card-l">Antecipação estimada</span>
        </div>
        {Object.entries(summary.byUf || {}).map(([uf, v]) => (
          <div className="card" key={uf}>
            <span className="card-n">{fmt(v.total)}</span>
            <span className="card-l">{uf} · {v.n} NF</span>
          </div>
        ))}
      </div>
      <table className="table" style={{ marginBottom: 12 }}>
        <thead>
          <tr>
            <th>CFOP entrada</th>
            <th className="num">Notas</th>
            <th className="num">Total produtos</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(summary.byCfopEntrada || {}).sort((a, b) => b[1].total - a[1].total).map(([cfop, v]) => (
            <tr key={cfop}>
              <td>{cfop}</td>
              <td className="num">{v.n}</td>
              <td className="num">{fmt(v.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {antecipNotes.length > 0 && (
        <>
          <h3 style={{ fontSize: '0.95rem', margin: '12px 0 8px' }}>
            ICMS antecipação estimada (OCR · UF ≠ PI) — {fmt(summary.totalIcmsAntecipacaoEstimada)}
          </h3>
          <table className="table" style={{ marginBottom: 12 }}>
            <thead>
              <tr>
                <th>Emissão</th>
                <th>NF</th>
                <th>UF</th>
                <th>Fornecedor</th>
                <th className="num">Base ICMS</th>
                <th className="num">Alíq. origem</th>
                <th className="num">ICMS NF</th>
                <th className="num">Antecip. est.</th>
                <th>Conf.</th>
              </tr>
            </thead>
            <tbody>
              {antecipNotes.map((n) => (
                <tr key={`ant-${n.doc_number}-${n.counterparty_doc}`}>
                  <td className="nowrap">{fmtDate(n.issue_date)}</td>
                  <td>{n.doc_number}</td>
                  <td>{n.emit_uf || '—'}</td>
                  <td className="desc">{n.counterparty_name}</td>
                  <td className="num">{n.base_icms != null ? fmt(n.base_icms) : '—'}</td>
                  <td className="num">{n.aliquota_icms != null ? `${n.aliquota_icms}%` : '—'}</td>
                  <td className="num">{n.valor_icms != null ? fmt(n.valor_icms) : '—'}</td>
                  <td className="num">{fmt(n.icms_antecipacao_estimada)}</td>
                  <td>{n.tax_confidence || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <table className="table">
        <thead>
          <tr>
            <th>Entrada</th>
            <th>Emissão</th>
            <th>NF</th>
            <th>UF</th>
            <th>Fornecedor</th>
            <th>CFOP entrada</th>
            <th>Destinação</th>
            <th className="num">Vlr. produtos</th>
            <th className="num">Base ICMS</th>
            <th className="num">ICMS</th>
            <th className="num">Alíq.</th>
            <th>OCR</th>
            <th>Chave</th>
          </tr>
        </thead>
        <tbody>
          {notes.map((n) => (
            <tr key={`${n.doc_number}-${n.counterparty_doc}-${n.ocr_source || ''}`}>
              <td className="nowrap">{fmtDate(n.data_entrada)}</td>
              <td className="nowrap">{fmtDate(n.issue_date)}</td>
              <td>{n.doc_number}</td>
              <td>{n.emit_uf || '—'}</td>
              <td className="desc">{n.counterparty_name}{n.only_ocr ? <small> (só OCR)</small> : null}</td>
              <td>{(n.cfops_entrada || [n.cfop]).filter(Boolean).join(', ') || '—'}</td>
              <td>{n.destinacao || '—'}</td>
              <td className="num">{fmt(n.total_value)}</td>
              <td className="num">{n.base_icms != null ? fmt(n.base_icms) : '—'}</td>
              <td className="num">{n.valor_icms != null ? fmt(n.valor_icms) : '—'}</td>
              <td className="num">{n.aliquota_icms != null ? `${n.aliquota_icms}%` : '—'}</td>
              <td>{n.has_ocr ? (n.tax_confidence || 'ok') : '—'}</td>
              <td className="desc" style={{ fontSize: '0.7rem', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }} title={n.chave_acesso || ''}>
                {n.chave_acesso ? `${n.chave_acesso.slice(0, 10)}…` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default function TaxAssessment() {
  const [months, setMonths] = useState([]);
  const [month, setMonth] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [processMsg, setProcessMsg] = useState(null);
  const [processError, setProcessError] = useState(null);

  useEffect(() => {
    loadMonths().then((list) => {
      setMonths(list);
      setMonth(list[list.length - 1] || '2026-06');
    });
  }, []);

  useEffect(() => {
    if (!month) return;
    setLoading(true);
    setError(null);
    loadAssessment(month)
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [month]);

  async function runAction(action) {
    if (!month || busy) return;
    setBusy(action);
    setProcessMsg(null);
    setProcessError(null);
    try {
      const result = action === 'conciliar'
        ? await postJson('/api/reconciliation/run', { month })
        : await postJson('/api/tax-assessment/apurar', { month });
      setProcessMsg(formatProcessResult(action, result));
      if (action === 'apurar' && result.assessment) {
        setData((prev) => ({
          ...result.assessment,
          entradasSiat: prev?.entradasSiat ?? null,
          entradasDanfeOcr: prev?.entradasDanfeOcr ?? null,
        }));
      }
      const refreshed = await loadAssessment(month);
      setData(refreshed);
    } catch (err) {
      setProcessError(err.message);
    } finally {
      setBusy(null);
    }
  }

  if (!month) return <p className="loading">Carregando...</p>;

  return (
    <div className="tax-assessment">
      <div className="toolbar">
        <div className="month-tabs">
          {months.map((m) => (
            <button key={m} type="button" className={m === month ? 'tab active' : 'tab'} onClick={() => setMonth(m)}>
              {m}
            </button>
          ))}
        </div>
        <div className="process-actions">
          <button
            type="button"
            className="btn-action secondary"
            disabled={Boolean(busy)}
            onClick={() => runAction('conciliar')}
            title="Cruza banco ↔ NF, vincula anexos e cupons de combustível"
          >
            {busy === 'conciliar' ? 'Conciliando…' : 'Conciliar'}
          </button>
          <button
            type="button"
            className="btn-action"
            disabled={Boolean(busy)}
            onClick={() => runAction('apurar')}
            title="Lê memórias/DAR da rede, importa SIAT e calcula ICMS"
          >
            {busy === 'apurar' ? 'Apurando…' : 'Apurar'}
          </button>
        </div>
        <span className="dev-only-badge">🔒 Aba visível só no ambiente local — não é publicada no Netlify</span>
      </div>

      {processMsg && <div className="process-msg">{processMsg}</div>}
      {processError && <div className="process-msg error">{processError}</div>}

      {loading && <p className="loading">Carregando apuração...</p>}
      {error && (
        <div className="error">
          <p>{error}</p>
          <p style={{ marginTop: 8, fontSize: '0.8125rem' }}>
            Use o botão <strong>Apurar</strong> para ler os documentos da pasta de rede, ou copie-os para
            <code> APURAÇÃO</code> e peça para eu transcrevê-los.
          </p>
        </div>
      )}

      {!loading && !error && data && (
        <>
          <div className="meta-bar">
            {data.company?.name} · CNPJ {data.company?.cnpj}
            {data.regime ? ` · Regime: ${data.regime}` : ''} · Competência {data.period}
            {data.partial ? ' · apuração parcial' : ' · apuração com documentos oficiais'}
          </div>

          {data.completeness && (
            <div className="cards" style={{ marginBottom: 12 }}>
              {[
                ['Balancete', data.completeness.balancete],
                ['Memória ICMS', data.completeness.memoriaIcms],
                ['PIS/COFINS', data.completeness.memoriaPisCofins],
                ['IRPJ/CSLL', data.completeness.memoriaIrpjCsll],
                ['DARs', data.completeness.dars],
                ['SIAT', data.completeness.siat],
                ['XML saídas', data.completeness.xmlSaidas],
              ].map(([label, ok]) => (
                <div className={`card ${ok ? 'ok' : 'warn'}`} key={label}>
                  <span className="card-n">{ok ? '✓' : '—'}</span>
                  <span className="card-l">{label}</span>
                </div>
              ))}
            </div>
          )}

          {data.reconciliation && (
            <div className="cards" style={{ marginBottom: 12 }}>
              <div className="card"><span className="card-n">{data.reconciliation.lancamentos}</span><span className="card-l">Lançamentos</span></div>
              <div className="card ok"><span className="card-n">{data.reconciliation.conciliados}</span><span className="card-l">Conciliados ({data.reconciliation.percentual}%)</span></div>
              <div className="card warn"><span className="card-n">{data.reconciliation.revisao}</span><span className="card-l">Em revisão</span></div>
              <div className="card"><span className="card-n">{data.reconciliation.matchesBancoFiscal}</span><span className="card-l">Banco ↔ NF</span></div>
            </div>
          )}

          {data.computed?.confronto && (
            <section className="section">
              <h2>Confronto: memória oficial × cálculo (XML/SIAT)</h2>
              <table className="table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="num">Oficial</th>
                    <th className="num">Calculado</th>
                    <th className="num">Diferença</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>ICMS débito sobre vendas</td>
                    <td className="num">{fmt(data.computed.confronto.debitoSaidasOficial)}</td>
                    <td className="num">{fmt(data.computed.confronto.debitoSaidasCalculado)}</td>
                    <td className="num"><Money v={data.computed.confronto.diffDebito} /></td>
                  </tr>
                  <tr>
                    <td>ICMS antecipação</td>
                    <td className="num">{fmt(data.computed.confronto.antecipacaoOficial)}</td>
                    <td className="num">{fmt(data.computed.confronto.antecipacaoCalculada)}</td>
                    <td className="num"><Money v={data.computed.confronto.diffAntecipacao} /></td>
                  </tr>
                </tbody>
              </table>
            </section>
          )}

          {data.dars?.boletos?.length > 0 && (
            <section className="section">
              <h2>Boletos DAR — total {data.dars.total != null ? fmt(data.dars.total) : '—'} ({data.dars.quantidade} guias)</h2>
              {data.dars.observacao && (
                <p style={{ fontSize: '0.8125rem', color: '#5a6a7e', marginBottom: 8 }}>{data.dars.observacao}</p>
              )}
              <table className="table">
                <thead>
                  <tr>
                    <th>NF</th>
                    <th>Arquivo</th>
                    <th className="num">Valor</th>
                    <th>Guia</th>
                  </tr>
                </thead>
                <tbody>
                  {data.dars.boletos.map((b) => (
                    <tr key={b.file || b.nf}>
                      <td>{b.nf || '—'}</td>
                      <td>{b.file}</td>
                      <td className="num">{b.valor != null ? fmt(b.valor) : '—'}</td>
                      <td>
                        {b.file ? (
                          <a href={`/api/tax-assessment/docs/${encodeURIComponent(b.file)}`} target="_blank" rel="noreferrer" className="attach-link">Abrir</a>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                  {data.dars.total != null && (
                    <tr className="row-total">
                      <td colSpan={2}>TOTAL BOLETOS DAR</td>
                      <td className="num">{fmt(data.dars.total)}</td>
                      <td></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>
          )}

          {data.partial && (
            <div className="error" style={{ marginBottom: 16 }}>
              Apuração parcial de {data.period}. Ainda faltam:{' '}
              {(data.missing || ['balancete', 'memoria_icms', 'memoria_irpj_csll']).join(', ')}.
            </div>
          )}

          {data.balancete && (
            <div className="cards">
              <div className="card"><span className="card-n">{fmt(data.balancete.receitaBrutaMes)}</span><span className="card-l">Receita bruta do mês</span></div>
              <div className={`card ${data.balancete.resultadoLiquidoMes < 0 ? 'warn' : 'ok'}`}>
                <span className="card-n"><Money v={data.balancete.resultadoLiquidoMes} /></span>
                <span className="card-l">Resultado líquido do mês</span>
              </div>
              <div className="card"><span className="card-n">{fmt(data.icms?.totais?.icmsAntecipadoEntradas)}</span><span className="card-l">ICMS antecipação (memória)</span></div>
              <div className="card warn"><span className="card-n">{fmt(data.dars?.total ?? 0)}</span><span className="card-l">Total boletos DAR ({data.dars?.quantidade || 0})</span></div>
              <div className="card ok"><span className="card-n"><Money v={data.icms?.totais?.icmsApuracaoNormal} /></span><span className="card-l">ICMS apuração normal (saldo)</span></div>
            </div>
          )}

          {data.entradasSiat && (
            <div className="cards">
              <div className="card"><span className="card-n">{data.entradasSiat.summary.notes}</span><span className="card-l">NF entrada (SIAT+OCR)</span></div>
              <div className="card ok"><span className="card-n">{fmt(data.entradasSiat.summary.totalProdutos)}</span><span className="card-l">Total produtos entrada</span></div>
              <div className="card"><span className="card-n">{data.entradasSiat.summary.withIcms || 0}</span><span className="card-l">NF com ICMS (OCR)</span></div>
              <div className="card warn"><span className="card-n">{fmt(data.entradasSiat.summary.totalIcmsAntecipacaoEstimada || 0)}</span><span className="card-l">Antecipação estimada</span></div>
            </div>
          )}

          <section className="section info-box">
            <h2>O que mais preciso para manter isso atualizado</h2>
            <ul className="needs-list">
              {NEEDS.map((n) => (
                <li key={n.title}><strong>{n.title}:</strong> {n.detail}</li>
              ))}
            </ul>
          </section>

          <EntradasSiatSection entradas={data.entradasSiat} />

          {/* ---------------- ICMS ---------------- */}
          {data.icms && (
          <section className="section">
            <h2>
              ICMS — apuração normal ({data.icms.mes})
              {data.calculated ? ' · calculado' : ''}
            </h2>
            {data.icms.status && (
              <p style={{ fontSize: '0.8125rem', color: '#5a6a7e', marginBottom: 8 }}>{data.icms.status}</p>
            )}
            {data.icms.entradas?.length > 0 && (
            <table className="table">
              <thead>
                <tr><th>CFOP</th><th>Descrição</th><th className="num">V. contábil</th><th className="num">Base cálc.</th><th className="num">Alíq. %</th><th className="num">Crédito</th></tr>
              </thead>
              <tbody>
                {data.icms.entradas.map((r, i) => (
                  <tr key={i}>
                    <td>{r.cfop}</td><td>{r.desc}</td>
                    <td className="num">{r.vContabil != null ? fmt(r.vContabil) : '—'}</td>
                    <td className="num">{r.baseCalculo != null ? fmt(r.baseCalculo) : '—'}</td>
                    <td className="num">{r.aliquota != null ? r.aliquota : '—'}</td>
                    <td className="num">{fmt(r.credito)}</td>
                  </tr>
                ))}
                <tr className="row-total">
                  <td colSpan={2}>TOTAL ENTRADAS</td>
                  <td className="num">{data.icms.totais.entradasVContabil != null ? fmt(data.icms.totais.entradasVContabil) : '—'}</td>
                  <td className="num">{data.icms.totais.entradasBaseCalculo != null ? fmt(data.icms.totais.entradasBaseCalculo) : '—'}</td>
                  <td></td>
                  <td className="num">{data.icms.totais.creditoEntradas != null ? fmt(data.icms.totais.creditoEntradas) : '—'}</td>
                </tr>
              </tbody>
            </table>
            )}

            <table className="table" style={{ marginTop: 12 }}>
              <thead>
                <tr><th>CFOP</th><th>Descrição</th><th className="num">V. contábil</th><th className="num">Base cálc.</th><th className="num">Alíq. %</th><th className="num">Débito</th></tr>
              </thead>
              <tbody>
                {data.icms.saidas.map((r, i) => (
                  <tr key={i}>
                    <td>{r.cfop}</td><td>{r.desc}</td>
                    <td className="num">{r.vContabil != null ? fmt(r.vContabil) : '—'}</td>
                    <td className="num">{r.baseCalculo != null ? fmt(r.baseCalculo) : '—'}</td>
                    <td className="num">{r.aliquota != null ? r.aliquota : '—'}</td>
                    <td className="num">{fmt(r.debito)}</td>
                  </tr>
                ))}
                <tr className="row-total">
                  <td colSpan={2}>TOTAL SAÍDAS (ICMS normal / sobre vendas)</td>
                  <td className="num">{fmt(data.icms.totais.saidasVContabil)}</td>
                  <td className="num">{fmt(data.icms.totais.saidasBaseCalculo)}</td>
                  <td></td>
                  <td className="num">{fmt(data.icms.totais.debitoSaidas)}</td>
                </tr>
              </tbody>
            </table>

            {data.icms.totais.icmsApuracaoNormal != null ? (
            <div className="meta-bar" style={{ marginTop: 12 }}>
              Créditos ({fmt((data.icms.totais.creditoEntradas || 0) + (data.icms.totais.saldoAnteriorCredor || 0) + (data.icms.totais.icmsAntecipadoEntradas || 0))})
              {' '}× Débitos ({fmt(data.icms.totais.debitoSaidas)}) ={' '}
              <strong>{data.icms.totais.icmsApuracaoNormal < 0 ? 'saldo credor a transportar' : 'ICMS a pagar'}: {fmt(Math.abs(data.icms.totais.icmsApuracaoNormal))}</strong>
            </div>
            ) : (
            <div className="meta-bar" style={{ marginTop: 12 }}>
              <strong>ICMS normal (débito sobre vendas): {fmt(data.icms.totais.debitoSaidas)}</strong>
              {' · '}créditos de entrada e saldo anterior ainda dependem da Memória oficial.
            </div>
            )}
          </section>
          )}

          {data.icms?.antecipacaoTributaria && (
          <section className="section">
            <h2>ICMS — antecipação tributária (compras interestaduais) — total {fmt(data.icms.antecipacaoTributaria.total)}</h2>
            <p style={{ fontSize: '0.8125rem', color: '#5a6a7e', marginBottom: 8 }}>
              {data.icms.antecipacaoTributaria.base}
              {data.icms.antecipacaoTributaria.formula ? (
                <>
                  <br />
                  Fórmula: {data.icms.antecipacaoTributaria.formula}
                </>
              ) : null}
            </p>
            {data.icms.antecipacaoTributaria.observacao && (
              <p style={{ fontSize: '0.8125rem', color: '#8a5a00', marginBottom: 8 }}>{data.icms.antecipacaoTributaria.observacao}</p>
            )}
            <table className="table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>NF</th>
                  <th>UF</th>
                  <th>Fornecedor</th>
                  <th className="num">Base</th>
                  <th className="num">Alíq. origem</th>
                  <th className="num">Alíq. final</th>
                  <th className="num">ICMS NF</th>
                  <th className="num">ICMS PI 22,5%</th>
                  <th className="num">A pagar</th>
                  <th className="num">DAR</th>
                  <th>Fonte</th>
                  <th>Comprovante</th>
                </tr>
              </thead>
              <tbody>
                {data.icms.antecipacaoTributaria.notas.map((n, i) => (
                  <tr key={i}>
                    <td className="nowrap">{fmtDate(n.data)}</td>
                    <td>{n.nf}</td>
                    <td>{n.uf || '—'}</td>
                    <td className="desc">{n.fornecedor}{n.obs && <small> — {n.obs}</small>}</td>
                    <td className="num">{n.baseCalculo != null ? fmt(n.baseCalculo) : (n.valor != null ? fmt(n.valor) : '—')}</td>
                    <td className="num">{n.aliqOrigem != null ? `${n.aliqOrigem}%` : '—'}</td>
                    <td className="num">{n.aliqFinal != null ? `${n.aliqFinal}%` : '—'}</td>
                    <td className="num">{n.icmsDestacado != null ? fmt(n.icmsDestacado) : '—'}</td>
                    <td className="num">{n.icmsInternoPI != null ? fmt(n.icmsInternoPI) : '—'}</td>
                    <td className="num">{fmt(n.valorAPagar)}</td>
                    <td className="num">{n.valorDar != null ? fmt(n.valorDar) : '—'}</td>
                    <td style={{ fontSize: '0.7rem' }}>{n.fonte || n.confianca || '—'}</td>
                    <td>
                      {n.dar ? (
                        <a href={`/api/tax-assessment/docs/${encodeURIComponent(n.dar)}`} target="_blank" rel="noreferrer" className="attach-link">DAR</a>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
                <tr className="row-total">
                  <td colSpan={9}>TOTAL</td>
                  <td className="num">{fmt(data.icms.antecipacaoTributaria.total)}</td>
                  <td className="num">{data.dars?.total != null ? fmt(data.dars.total) : '—'}</td>
                  <td colSpan={2}></td>
                </tr>
              </tbody>
            </table>
          </section>
          )}

          {/* ---------------- PIS/COFINS ---------------- */}
          {data.pisCofins ? (
          <section className="section">
            <h2>PIS / COFINS (não-cumulativo) — {data.pisCofins.mes}</h2>
            {data.pisCofins.status && (
              <p style={{ fontSize: '0.8125rem', color: '#5a6a7e', marginBottom: 8 }}>{data.pisCofins.status}</p>
            )}
            <table className="table">
              <thead>
                <tr>
                  <th>Créditos</th>
                  <th className="num">Receita</th>
                  <th className="num">Redução</th>
                  <th className="num">Base</th>
                  <th className="num">PIS 1,65%</th>
                  <th className="num">COFINS 7,60%</th>
                </tr>
              </thead>
              <tbody>
                {data.pisCofins.creditos.map((r, i) => (
                  <tr key={i}>
                    <td>{r.desc}</td>
                    <td className="num">{fmt(r.receita)}</td>
                    <td className="num">{fmt(r.reducao)}</td>
                    <td className="num">{fmt(r.base)}</td>
                    <td className="num">{fmt(r.pis)}</td>
                    <td className="num">{fmt(r.cofins)}</td>
                  </tr>
                ))}
                <tr className="row-total">
                  <td>TOTAL CRÉDITOS</td>
                  <td className="num">{fmt(data.pisCofins.totais.creditosReceita)}</td>
                  <td className="num">{fmt(data.pisCofins.totais.creditosReducao)}</td>
                  <td className="num">{fmt(data.pisCofins.totais.creditosBase)}</td>
                  <td className="num">{fmt(data.pisCofins.totais.creditoPis)}</td>
                  <td className="num">{fmt(data.pisCofins.totais.creditoCofins)}</td>
                </tr>
              </tbody>
            </table>
            <table className="table" style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th>Débitos</th>
                  <th className="num">Receita</th>
                  <th className="num">Redução</th>
                  <th className="num">Base</th>
                  <th className="num">PIS 1,65%</th>
                  <th className="num">COFINS 7,60%</th>
                </tr>
              </thead>
              <tbody>
                {data.pisCofins.debitos.map((r, i) => (
                  <tr key={i}>
                    <td>{r.desc}</td>
                    <td className="num">{fmt(r.receita)}</td>
                    <td className="num">{fmt(r.reducao)}</td>
                    <td className="num">{fmt(r.base)}</td>
                    <td className="num">{fmt(r.pis)}</td>
                    <td className="num">{fmt(r.cofins)}</td>
                  </tr>
                ))}
                <tr className="row-total">
                  <td>TOTAL DÉBITOS</td>
                  <td className="num">{fmt(data.pisCofins.totais.debitosReceita)}</td>
                  <td className="num">{fmt(data.pisCofins.totais.debitosReducao)}</td>
                  <td className="num">{fmt(data.pisCofins.totais.debitosBase)}</td>
                  <td className="num">{fmt(data.pisCofins.totais.debitoPis)}</td>
                  <td className="num">{fmt(data.pisCofins.totais.debitoCofins)}</td>
                </tr>
              </tbody>
            </table>
            <table className="table" style={{ marginTop: 12 }}>
              <thead><tr><th>Apuração</th><th className="num">PIS</th><th className="num">COFINS</th></tr></thead>
              <tbody>
                <tr>
                  <td>Saldo do mês (débito − crédito)</td>
                  <td className="num">{fmt(data.pisCofins.totais.saldoMesPis)}</td>
                  <td className="num">{fmt(data.pisCofins.totais.saldoMesCofins)}</td>
                </tr>
                <tr>
                  <td>(−) Crédito mês anterior</td>
                  <td className="num">{fmt(data.pisCofins.totais.creditoAnteriorPis)}</td>
                  <td className="num">{fmt(data.pisCofins.totais.creditoAnteriorCofins)}</td>
                </tr>
                <tr className="row-total">
                  <td>Saldo após compensações (negativo = credor a transportar)</td>
                  <td className="num"><Money v={data.pisCofins.totais.saldoAposCompensacaoPis} /></td>
                  <td className="num"><Money v={data.pisCofins.totais.saldoAposCompensacaoCofins} /></td>
                </tr>
              </tbody>
            </table>
            {data.pisCofins.observacao && (
              <p style={{ fontSize: '0.8125rem', color: '#5a6a7e', marginTop: 8 }}>{data.pisCofins.observacao}</p>
            )}
          </section>
          ) : data.balancete?.deducoes?.cofinsSVenda != null && (
          <section className="section">
            <h2>PIS / COFINS (não-cumulativo)</h2>
            <table className="table">
              <thead><tr><th>Item</th><th className="num">Valor</th></tr></thead>
              <tbody>
                <tr><td>COFINS s/ venda (débito do mês)</td><td className="num">{fmt(data.balancete.deducoes.cofinsSVenda)}</td></tr>
                <tr><td>PIS s/ venda (débito do mês)</td><td className="num">{fmt(data.balancete.deducoes.pisSVenda)}</td></tr>
                {(data.balancete.obrigacoesFiscaisSaldoFinal || []).filter((o) => /PIS|COFINS/i.test(o.conta)).map((o) => (
                  <tr key={o.conta}><td>{o.conta} (saldo final)</td><td className="num">{fmt(o.saldo)}</td></tr>
                ))}
                {(data.balancete.creditosTributariosSaldoFinal || []).filter((o) => /PIS|COFINS/i.test(o.conta)).map((o) => (
                  <tr key={o.conta}><td>{o.conta} (saldo final)</td><td className="num">{fmt(o.saldo)}</td></tr>
                ))}
              </tbody>
            </table>
          </section>
          )}

          {/* ---------------- IRPJ / CSLL ---------------- */}
          {data.irpjCsll && (
          <section className="section">
            <h2>IRPJ / CSLL — Lucro Real mensal (2026)</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Mês</th><th className="num">Resultado contábil-fiscal</th><th className="num">Prej. acum. anterior</th>
                  <th className="num">Base de cálculo</th><th className="num">IRPJ (15%+10%)</th><th className="num">CSLL (9%)</th><th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.irpjCsll.monthly).map(([m, r]) => (
                  <tr key={m} className={r.resultado === 'PREJUIZO' ? 'row-warn' : ''}>
                    <td className="nowrap">{r.label}/2026</td>
                    <td className="num"><Money v={r.lucroPrejuizoContabilFiscal} /></td>
                    <td className="num">{fmt(r.prejuizoAcumuladoAnterior)}</td>
                    <td className="num">{fmt(r.baseCalculo)}</td>
                    <td className="num">{fmt(r.irpjTotal)}</td>
                    <td className="num">{fmt(r.csll9)}</td>
                    <td>{r.resultado === 'LUCRO' ? '✅ Lucro' : '⚠️ Prejuízo'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="meta-bar" style={{ marginTop: 12 }}>
              Prejuízo fiscal acumulado a compensar em julho/2026 (ainda sem fechamento): <strong>{fmt(data.irpjCsll.prejuizoFiscalACompensarJulho)}</strong>
            </div>

            <h3 style={{ margin: '16px 0 8px', fontSize: '0.875rem', color: '#1a4d2e' }}>Acumulado {data.irpjCsll.accumulated2026.periodo}</h3>
            <table className="table">
              <tbody>
                <tr><td>Receita com vendas</td><td className="num">{fmt(data.irpjCsll.accumulated2026.receitaComVenda)}</td></tr>
                <tr><td>Resultado operacional líquido</td><td className="num">{fmt(data.irpjCsll.accumulated2026.resultadoOperacionalLiquido)}</td></tr>
                <tr><td>Despesas operacionais</td><td className="num">{fmt(data.irpjCsll.accumulated2026.despesasOperacionais.total)}</td></tr>
                <tr><td><strong>Lucro/Prejuízo líquido do período</strong></td><td className="num"><strong><Money v={data.irpjCsll.accumulated2026.lucroPrejuizoLiquidoMensalMedio} /></strong></td></tr>
                <tr><td>IRPJ pago acumulado</td><td className="num">{fmt(data.irpjCsll.accumulated2026.irpjPagoAcumulado)}</td></tr>
                <tr><td>CSLL pago acumulado</td><td className="num">{fmt(data.irpjCsll.accumulated2026.csllPagoAcumulado)}</td></tr>
              </tbody>
            </table>
            <p style={{ fontSize: '0.8125rem', color: '#5a6a7e', marginTop: 8 }}>{data.irpjCsll.accumulated2026.observacao}</p>
          </section>
          )}

          {/* ---------------- Balancete: créditos e obrigações ---------------- */}
          {data.balancete?.obrigacoesFiscaisSaldoFinal && (
          <section className="section">
            <h2>Situação de créditos e obrigações tributárias (saldo em {fmtDate(`${data.period}-30`)})</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <table className="table">
                <thead><tr><th colSpan={2}>Obrigações a recolher</th></tr></thead>
                <tbody>
                  {data.balancete.obrigacoesFiscaisSaldoFinal.map((o) => (
                    <tr key={o.conta}><td>{o.conta}</td><td className="num">{fmt(o.saldo)}</td></tr>
                  ))}
                  {data.dars?.total != null && (
                    <tr className="row-total">
                      <td>
                        Total boletos DAR na pasta ({data.dars.quantidade} guias
                        {data.dars.vencimento ? ` · venc. ${fmtDate(data.dars.vencimento)}` : ''})
                      </td>
                      <td className="num">{fmt(data.dars.total)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
              <table className="table">
                <thead><tr><th colSpan={2}>Créditos a compensar/recuperar</th></tr></thead>
                <tbody>
                  {(data.balancete.creditosTributariosSaldoFinal || []).map((o) => (
                    <tr key={o.conta}><td>{o.conta}</td><td className="num">{fmt(o.saldo)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.dars?.observacao && (
              <p style={{ fontSize: '0.8125rem', color: '#5a6a7e', marginTop: 8 }}>{data.dars.observacao}</p>
            )}
          </section>
          )}

          {data.sourceDocs && (
          <section className="section">
            <h2>Documentos-fonte</h2>
            <div className="attach-list source-docs">
              {[
                { label: 'Balancete', file: data.sourceDocs.balancete },
                { label: 'Memória ICMS', file: data.sourceDocs.icms },
                { label: 'Memória PIS/COFINS', file: data.sourceDocs.pisCofins },
                { label: 'Memória IRPJ/CSLL', file: data.sourceDocs.irpjCsll },
                ...(data.sourceDocs.dar || []).map((file) => ({ label: 'DAR', file })),
              ].filter((d) => d.file).map((d) => (
                <a
                  key={d.file}
                  className="attach-link source-doc-link"
                  target="_blank"
                  rel="noreferrer"
                  href={`/api/tax-assessment/docs/${encodeURIComponent(d.file)}`}
                >
                  <span className="source-doc-label">{d.label}</span>
                  <span className="source-doc-file">{d.file}</span>
                </a>
              ))}
            </div>
          </section>
          )}
        </>
      )}
    </div>
  );
}
