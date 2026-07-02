import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

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
  const [listRect, setListRect] = useState(null);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const filtered = useMemo(() => {
    const list = accounts.filter((a) => matchesAccount(a, query));
    return list.slice(0, 80);
  }, [accounts, query]);

  const updateListRect = () => {
    if (!inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    setListRect({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  };

  useEffect(() => {
    if (!open) return undefined;
    updateListRect();
    window.addEventListener('resize', updateListRect);
    window.addEventListener('scroll', updateListRect, true);
    return () => {
      window.removeEventListener('resize', updateListRect);
      window.removeEventListener('scroll', updateListRect, true);
    };
  }, [open, query]);

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
        ref={inputRef}
        type="text"
        className="account-search-input"
        value={query}
        onChange={onInputChange}
        onFocus={() => { setOpen(true); updateListRect(); }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
      />
      {open && listRect && createPortal(
        <ul
          className="account-search-list account-search-list--portal"
          role="listbox"
          style={{ top: listRect.top, left: listRect.left, width: listRect.width }}
        >
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
        </ul>,
        document.body,
      )}
    </div>
  );
}
