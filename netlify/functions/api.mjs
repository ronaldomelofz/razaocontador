import { loadLedger, patchEntry, listPublishedMonths } from './lib/store.mjs';

function corsHeaders(request) {
  const origin = request.headers.get('Origin');
  const host = request.headers.get('host') || '';
  const site = process.env.URL || process.env.DEPLOY_PRIME_URL || `https://${host}`;
  let allow = site;
  try {
    const siteOrigin = new URL(site).origin;
    if (origin && origin === siteOrigin) allow = origin;
    else allow = siteOrigin;
  } catch {
    allow = `https://${host}`;
  }
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };
}

function json(status, body, request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
  });
}

function siteUrl(request) {
  const host = request.headers.get('host');
  return process.env.URL || process.env.DEPLOY_PRIME_URL || `https://${host}`;
}

function validMonth(month) {
  return typeof month === 'string' && /^\d{4}-\d{2}$/.test(month);
}

/** Só campos de reclassificação — evita prototype pollution / overposting */
function sanitizePatch(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
  const out = {};
  for (const key of ['debit_account', 'credit_account', 'category', 'status']) {
    if (payload[key] == null) continue;
    const v = String(payload[key]).slice(0, 200);
    if (key === 'status' && !['matched', 'manual_review', 'pending'].includes(v)) continue;
    out[key] = v;
  }
  return out;
}

export default async function handler(request, context) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/\.netlify\/functions\/api/, '').replace(/^\/api/, '') || '/';
  const month = url.searchParams.get('month');
  const baseUrl = siteUrl(request);

  try {
    if (request.method === 'GET' && path === '/ledger/months') {
      const months = await listPublishedMonths(baseUrl);
      return json(200, { months }, request);
    }

    if (request.method === 'GET' && path === '/ledger/chart-of-accounts') {
      const m = month || url.searchParams.get('from') || '2026-06';
      if (!validMonth(m)) return json(400, { error: 'month inválido' }, request);
      const { ledger } = await loadLedger(m, baseUrl, context);
      return json(200, ledger.chartOfAccounts || [], request);
    }

    if (request.method === 'GET' && path === '/ledger/summary') {
      if (!validMonth(month)) return json(400, { error: 'month obrigatório (YYYY-MM)' }, request);
      const { ledger } = await loadLedger(month, baseUrl, context);
      return json(200, ledger.summary || [], request);
    }

    if (request.method === 'GET' && (path === '/ledger' || path === '/ledger/')) {
      if (!validMonth(month)) return json(400, { error: 'month obrigatório (YYYY-MM)' }, request);
      const { ledger } = await loadLedger(month, baseUrl, context);
      return json(200, ledger.entries || [], request);
    }

    const patchMatch = path.match(/^\/ledger\/(\d+)$/);
    if (request.method === 'PATCH' && patchMatch) {
      if (!validMonth(month)) return json(400, { error: 'month obrigatório (YYYY-MM)' }, request);
      const raw = await request.json().catch(() => ({}));
      const payload = sanitizePatch(raw);
      if (!Object.keys(payload).length) {
        return json(400, { error: 'Nenhum campo permitido para patch' }, request);
      }
      const updated = await patchEntry(month, patchMatch[1], payload, baseUrl, context);
      return json(200, updated, request);
    }

    return json(404, { error: 'Rota não encontrada' }, request);
  } catch (err) {
    console.error(err);
    return json(500, { error: 'Erro interno' }, request);
  }
}
