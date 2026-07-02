import { useState } from 'react';
import AccountSearchSelect from './AccountSearchSelect';

export default function ReclassifyPanel({ entry, chartOfAccounts, onSave, onCancel }) {
  const pending = entry.debit_account === '9.9.9.99' ? 'debit' : 'credit';
  const bankSide = pending === 'debit' ? 'credit' : 'debit';
  const bankAccount = entry[`${bankSide}_account`];

  const [account, setAccount] = useState(
    pending === 'debit' && entry.debit_account !== '9.9.9.99' ? entry.debit_account
      : pending === 'credit' && entry.credit_account !== '9.9.9.99' ? entry.credit_account
        : '',
  );
  const [category, setCategory] = useState(entry.category?.includes('Não classificado') ? '' : entry.category || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const selectedLabel = chartOfAccounts.find((c) => c.code === account);

  const handleSave = async () => {
    if (!account) {
      setErr('Selecione a conta contábil.');
      return;
    }
    setSaving(true);
    setErr(null);
    const payload = {
      debit_account: pending === 'debit' ? account : bankAccount,
      credit_account: pending === 'credit' ? account : bankAccount,
      category: category || 'Reclassificado manualmente',
      status: 'matched',
    };
    try {
      await onSave(entry.id, payload);
    } catch (e) {
      setErr(e.message);
      setSaving(false);
    }
  };

  return (
    <div className="reclassify-panel" onClick={(e) => e.stopPropagation()}>
      <strong>Reclassificar lançamento</strong>
      <p className="reclassify-hint">
        Saída bancária — informe a conta de contrapartida (ex.: dividendos do sócio que usou o cartão da empresa).
      </p>

      <div className="reclassify-fields">
        <label>
          Conta do lançamento
          <AccountSearchSelect
            accounts={chartOfAccounts}
            value={account}
            onChange={setAccount}
            placeholder="Digite código ou nome — ex.: dividendo, 2.02, pró-labore"
          />
          {selectedLabel && (
            <small className="account-selected-hint">Selecionada: {selectedLabel.code} — {selectedLabel.name}</small>
          )}
        </label>
        <label>
          Categoria / histórico contábil
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Ex.: Dividendos — cartão empresa"
          />
        </label>
      </div>

      {err && <p className="error-inline">{err}</p>}

      <div className="reclassify-actions">
        <button type="button" className="btn" onClick={handleSave} disabled={saving}>
          {saving ? 'Salvando…' : 'Confirmar lançamento'}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}
