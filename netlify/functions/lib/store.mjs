import { getStore } from '@netlify/blobs';

const GITHUB_OWNER = 'ronaldomelofz';
const GITHUB_REPO = 'razaocontador';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const ledgerPath = (month) => `client/public/data/ledger-${month}.json`;

function githubHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function overridesStore(context) {
  if (context?.blobs) return getStore({ name: 'ledger-overrides', consistency: 'strong' });
  const siteID = process.env.SITE_ID || process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN;
  if (siteID && token) {
    return getStore({ name: 'ledger-overrides', siteID, token, consistency: 'strong' });
  }
  return getStore('ledger-overrides');
}

async function fetchStaticLedger(month, baseUrl) {
  const res = await fetch(`${baseUrl}/data/ledger-${month}.json`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Ledger não encontrado: ${month}`);
  return res.json();
}

async function fetchGithubLedger(month) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;

  const path = ledgerPath(month);
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}?ref=${GITHUB_BRANCH}`;
  const res = await fetch(url, { headers: githubHeaders(token) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub read ${res.status}`);

  const meta = await res.json();
  const data = JSON.parse(Buffer.from(meta.content, 'base64').toString('utf8'));
  return { data, sha: meta.sha };
}

async function getOverrides(month, context) {
  try {
    const store = overridesStore(context);
    return (await store.get(`month:${month}`, { type: 'json' })) || {};
  } catch (err) {
    console.warn('Blobs indisponível:', err.message);
    return {};
  }
}

async function setOverride(month, id, patch, context) {
  const store = overridesStore(context);
  const key = `month:${month}`;
  const current = (await store.get(key, { type: 'json' })) || {};
  current[String(id)] = { ...current[String(id)], ...patch, updatedAt: new Date().toISOString() };
  await store.setJSON(key, current);
}

function coaMap(ledger) {
  return new Map((ledger.chartOfAccounts || []).map((c) => [c.code, c.name]));
}

function applyOverrides(ledger, overrides) {
  if (!overrides || !Object.keys(overrides).length) return ledger;
  const names = coaMap(ledger);
  return {
    ...ledger,
    entries: ledger.entries.map((e) => {
      const o = overrides[String(e.id)];
      if (!o) return e;
      const updated = { ...e, ...o };
      if (o.debit_account) updated.debit_name = names.get(o.debit_account) || updated.debit_name;
      if (o.credit_account) updated.credit_name = names.get(o.credit_account) || updated.credit_name;
      return updated;
    }),
  };
}

function recomputeSummaryPendentes(ledger) {
  const counts = {};
  for (const e of ledger.entries) {
    if (!e.bank_account_id) continue;
    counts[e.bank_account_id] ??= 0;
    if (e.status === 'manual_review') counts[e.bank_account_id]++;
  }
  ledger.summary = (ledger.summary || []).map((s) => ({
    ...s,
    pendentes: counts[s.bank_account_id] ?? 0,
  }));
  ledger.stats = {
    ...(ledger.stats || {}),
    pending: ledger.entries.filter((e) => e.status === 'manual_review').length,
  };
}

export async function loadLedger(month, baseUrl, context) {
  const gh = await fetchGithubLedger(month);
  const base = gh?.data || await fetchStaticLedger(month, baseUrl);
  const overrides = await getOverrides(month, context);
  return { ledger: applyOverrides(base, overrides), sha: gh?.sha };
}

export async function patchEntry(month, id, payload, baseUrl, context) {
  const { ledger, sha } = await loadLedger(month, baseUrl, context);
  const idx = ledger.entries.findIndex((e) => String(e.id) === String(id));
  if (idx < 0) throw new Error('Lançamento não encontrado');

  const names = coaMap(ledger);
  const entry = { ...ledger.entries[idx] };

  if (payload.debit_account) {
    entry.debit_account = payload.debit_account;
    entry.debit_name = names.get(payload.debit_account) || entry.debit_name;
  }
  if (payload.credit_account) {
    entry.credit_account = payload.credit_account;
    entry.credit_name = names.get(payload.credit_account) || entry.credit_name;
  }
  if (payload.category) entry.category = payload.category;
  if (payload.status) entry.status = payload.status;

  ledger.entries[idx] = entry;
  ledger.generatedAt = new Date().toISOString();
  recomputeSummaryPendentes(ledger);

  const patch = {
    debit_account: entry.debit_account,
    credit_account: entry.credit_account,
    debit_name: entry.debit_name,
    credit_name: entry.credit_name,
    category: entry.category,
    status: entry.status,
  };

  let saved = false;
  try {
    await setOverride(month, id, patch, context);
    saved = true;
  } catch (err) {
    console.warn('Falha ao salvar em Blobs:', err.message);
  }

  if (process.env.GITHUB_TOKEN) {
    try {
      await saveGithubLedger(month, ledger, sha);
      saved = true;
    } catch (err) {
      console.warn('Falha ao salvar no GitHub:', err.message);
      if (!saved) throw err;
    }
  }

  if (!saved) {
    throw new Error('Persistência indisponível. Configure GITHUB_TOKEN no Netlify.');
  }

  return entry;
}

async function saveGithubLedger(month, ledger, sha) {
  const token = process.env.GITHUB_TOKEN;
  const path = ledgerPath(month);
  const body = {
    message: `Reclassificar lançamento — ${month}`,
    content: Buffer.from(JSON.stringify(ledger, null, 2)).toString('base64'),
    branch: GITHUB_BRANCH,
  };
  if (sha) body.sha = sha;

  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub save failed: ${res.status} ${err}`);
  }
}
