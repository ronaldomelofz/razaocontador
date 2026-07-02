import { loadLedger, patchEntry } from './lib/store.mjs';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
};

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

function siteUrl(request) {
  const host = request.headers.get('host');
  return process.env.URL || process.env.DEPLOY_PRIME_URL || `https://${host}`;
}

export default async function handler(request, context) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/\.netlify\/functions\/api/, '').replace(/^\/api/, '') || '/';
  const month = url.searchParams.get('month');
  const baseUrl = siteUrl(request);

  try {
    if (request.method === 'GET' && path === '/ledger/chart-of-accounts') {
      const m = month || url.searchParams.get('from') || '2026-06';
      const { ledger } = await loadLedger(m, baseUrl, context);
      return json(200, ledger.chartOfAccounts || []);
    }

    if (request.method === 'GET' && path === '/ledger/summary') {
      if (!month) return json(400, { error: 'month obrigatório' });
      const { ledger } = await loadLedger(month, baseUrl, context);
      return json(200, ledger.summary || []);
    }

    if (request.method === 'GET' && (path === '/ledger' || path === '/ledger/')) {
      if (!month) return json(400, { error: 'month obrigatório' });
      const { ledger } = await loadLedger(month, baseUrl, context);
      return json(200, ledger.entries || []);
    }

    const patchMatch = path.match(/^\/ledger\/(\d+)$/);
    if (request.method === 'PATCH' && patchMatch) {
      if (!month) return json(400, { error: 'month obrigatório' });
      const payload = await request.json();
      const updated = await patchEntry(month, patchMatch[1], payload, baseUrl, context);
      return json(200, updated);
    }

    return json(404, { error: 'Rota não encontrada', path });
  } catch (err) {
    console.error(err);
    return json(500, { error: err.message || 'Erro interno' });
  }
}
