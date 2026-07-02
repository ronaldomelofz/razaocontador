function unauthorized() {
  return new Response('Acesso restrito. Informe usuário e senha.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="MADEPINUS Razão"' },
  });
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

export default async (request, context) => {
  const expectedUser = Netlify.env.get('BASIC_AUTH_USER');
  const expectedPass = Netlify.env.get('BASIC_AUTH_PASSWORD');

  if (!expectedUser || !expectedPass) {
    return context.next();
  }

  const creds = parseBasicAuth(request.headers.get('Authorization'));
  if (creds?.user === expectedUser && creds?.pass === expectedPass) {
    return context.next();
  }

  return unauthorized();
};

export const config = { path: '/*' };
