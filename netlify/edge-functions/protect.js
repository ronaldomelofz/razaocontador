/**
 * Basic Auth em todas as rotas do site (inclui /data e /api).
 * Fail-closed: sem BASIC_AUTH_USER/PASSWORD → 503 (não publica dados financeiros).
 * Override explícito só com ALLOW_PUBLIC=1 (nunca use em produção Madepinus).
 */
function unauthorized() {
  return new Response('Acesso restrito. Informe usuário e senha.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="MADEPINUS Razão"',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function misconfigured() {
  return new Response(
    'Site bloqueado: configure BASIC_AUTH_USER e BASIC_AUTH_PASSWORD no Netlify (ou ALLOW_PUBLIC=1 só para teste).',
    {
      status: 503,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  );
}

function parseBasicAuth(header) {
  if (!header?.startsWith('Basic ')) return null;
  try {
    const decoded = atob(header.slice(6));
    const sep = decoded.indexOf(':');
    if (sep < 0) return null;
    return { user: decoded.slice(0, sep), pass: decoded.slice(sep + 1) };
  } catch {
    return null;
  }
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const enc = new TextEncoder();
  const ba = enc.encode(a);
  const bb = enc.encode(b);
  if (ba.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ba.length; i++) diff |= ba[i] ^ bb[i];
  return diff === 0;
}

export default async (request, context) => {
  const expectedUser = Netlify.env.get('BASIC_AUTH_USER');
  const expectedPass = Netlify.env.get('BASIC_AUTH_PASSWORD');
  const allowPublic = Netlify.env.get('ALLOW_PUBLIC') === '1';

  if (!expectedUser || !expectedPass) {
    if (allowPublic) return context.next();
    return misconfigured();
  }

  const creds = parseBasicAuth(request.headers.get('Authorization'));
  if (
    creds
    && timingSafeEqual(creds.user, expectedUser)
    && timingSafeEqual(creds.pass, expectedPass)
  ) {
    return context.next();
  }

  return unauthorized();
};

export const config = { path: '/*' };
