-- Plano de contas (código Alterdata real, preencher via docs/PLANO_DE_CONTAS.md)
CREATE TABLE IF NOT EXISTS chart_of_accounts (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('ativo','passivo','receita','despesa','patrimonio'))
);

-- Contas bancárias monitoradas
CREATE TABLE IF NOT EXISTS bank_accounts (
  id TEXT PRIMARY KEY,          -- ex: 'itau-29660-2'
  bank TEXT NOT NULL,
  agency TEXT,
  account_number TEXT,
  coa_code TEXT REFERENCES chart_of_accounts(code),
  active INTEGER DEFAULT 1
);

-- Fonte bruta (arquivo original) — rastreabilidade
CREATE TABLE IF NOT EXISTS source_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,
  kind TEXT NOT NULL,           -- 'extrato' | 'xml_nfe' | 'boleto' | 'alterdata' | 'fatura_cartao'
  bank_account_id TEXT,
  competence_month TEXT,        -- 'YYYY-MM'
  imported_at TEXT DEFAULT CURRENT_TIMESTAMP,
  hash TEXT UNIQUE              -- evita reimportação duplicada
);

-- Lançamentos brutos extraídos (antes de classificar)
CREATE TABLE IF NOT EXISTS raw_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_file_id INTEGER REFERENCES source_files(id),
  bank_account_id TEXT REFERENCES bank_accounts(id),
  tx_date TEXT NOT NULL,
  description TEXT NOT NULL,
  counterparty TEXT,
  counterparty_doc TEXT,        -- CPF/CNPJ
  amount REAL NOT NULL,         -- positivo = entrada, negativo = saída
  external_ref TEXT,            -- número do documento/boleto do banco
  raw_json TEXT                 -- payload original para auditoria
);

-- Lançamentos contábeis (partidas dobradas), gerados a partir de raw_transactions
CREATE TABLE IF NOT EXISTS ledger_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  raw_transaction_id INTEGER REFERENCES raw_transactions(id),
  entry_date TEXT NOT NULL,
  description TEXT NOT NULL,
  debit_account TEXT REFERENCES chart_of_accounts(code),
  credit_account TEXT REFERENCES chart_of_accounts(code),
  amount REAL NOT NULL,
  category TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('matched','pending','manual_review')),
  match_confidence REAL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Documentos fiscais (NF-e/NFC-e)
CREATE TABLE IF NOT EXISTS fiscal_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_file_id INTEGER REFERENCES source_files(id),
  doc_number TEXT,
  doc_model TEXT,               -- '55' NFe | '65' NFCe
  cfop TEXT,
  issue_date TEXT,
  counterparty_name TEXT,
  counterparty_doc TEXT,
  total_value REAL,
  icms_value REAL,
  pis_value REAL,
  cofins_value REAL,
  cancelled INTEGER DEFAULT 0,
  payment_method TEXT,
  ledger_entry_id INTEGER REFERENCES ledger_entries(id)
);

-- Conciliação: liga lançamento bancário a documento fiscal / boleto
CREATE TABLE IF NOT EXISTS reconciliations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  raw_transaction_id INTEGER REFERENCES raw_transactions(id),
  fiscal_document_id INTEGER REFERENCES fiscal_documents(id),
  match_type TEXT,              -- 'exact' | 'fuzzy' | 'manual'
  match_score REAL,
  confirmed INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_raw_tx_date ON raw_transactions(tx_date);
CREATE INDEX IF NOT EXISTS idx_ledger_date ON ledger_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_fiscal_date ON fiscal_documents(issue_date);

-- Anexos de documentos (comprovantes, NF, cupons) vinculados a lançamentos
CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ledger_entry_id INTEGER REFERENCES ledger_entries(id),
  raw_transaction_id INTEGER REFERENCES raw_transactions(id),
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER,
  match_type TEXT DEFAULT 'fuzzy',
  match_score REAL DEFAULT 0.5,
  copied_path TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_attach_ledger ON attachments(ledger_entry_id);
CREATE INDEX IF NOT EXISTS idx_attach_raw ON attachments(raw_transaction_id);
