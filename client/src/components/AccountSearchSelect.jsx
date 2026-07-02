import { useEffect, useMemo, useRef, useState } from 'react';

function normalize(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function matchesAccount(account, query) {
  if (!query) return true;
  const q = normalize(query);
  const hay = `${account.code} ${account.name}`;
  const norm = normalize(hay);
  return q.split(/\s+/).every((token) => norm.includes(token));
}

export default function AccountSearchSelect({ accounts, value, onChange, placeholder = 'Digite código ou nome da conta…' }) {
  const selected = accounts.find((a) => a.code === value);
  const [query, setQuery] = useState(selected ? `${selected.code} — ${selected.name}` : '');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef(null);

  const filtered = useMemo(() => {
    const list = accounts.filter((a) => matchesAccount(a, query));
    return list.slice(0, 30);
  }, [accounts, query]);

  useEffect(() => {
    const selectedNow = accounts.find((a) => a.code === value);
    if (selectedNow && !open) {
      setQuery(`${selectedNow.code} — ${selectedNow.name}`);
    }
  }, [value, accounts, open]);

  useEffect(() => {
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const pick = (account) => {
    onChange(account.code);
    setQuery(`${account.code} — ${account.name}`);
    setOpen(false);
    setHighlight(0);
  };

  const onInputChange = (e) => {
    const v = e.target.value;
    setQuery(v);
    setOpen(true);
    setHighlight(0);
    const sel = accounts.find((a) => a.code === value);
    const selLabel = sel ? `${sel.code} — ${sel.name}` : '';
    if (!v || v !== selLabel) onChange('');
  };

  const onKeyDown = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter' && filtered[highlight]) {
      e.preventDefault();
      pick(filtered[highlight]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="account-search" ref={wrapRef}>
      <input
        type="text"
        className="account-search-input"
        value={query}
        onChange={onInputChange}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
      />
      {open && (
        <ul className="account-search-list" role="listbox">
          {filtered.length === 0 ? (
            <li className="account-search-empty">Nenhuma conta encontrada</li>
          ) : (
            filtered.map((a, i) => (
              <li
                key={a.code}
                role="option"
                aria-selected={value === a.code}
                className={i === highlight ? 'account-search-item active' : 'account-search-item'}
                onMouseDown={(e) => { e.preventDefault(); pick(a); }}
                onMouseEnter={() => setHighlight(i)}
              >
                <code>{a.code}</code>
                <span>{a.name}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
