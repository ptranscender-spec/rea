export class ErroApi extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}

async function chamar(metodo, url, corpo) {
  const opcoes = { method: metodo, credentials: 'same-origin', headers: {} };
  if (corpo instanceof FormData) opcoes.body = corpo;
  else if (corpo !== undefined) { opcoes.headers['Content-Type'] = 'application/json'; opcoes.body = JSON.stringify(corpo); }
  let r;
  try { r = await fetch(url, opcoes); } catch { throw new ErroApi(0, 'Sem conexão com o servidor.'); }
  const dados = (r.headers.get('content-type') || '').includes('json') ? await r.json() : null;
  if (!r.ok) {
    if (r.status === 401 && !url.startsWith('/api/auth')) window.dispatchEvent(new Event('jn-sessao-expirada'));
    throw new ErroApi(r.status, dados?.erro || 'Algo deu errado.');
  }
  return dados;
}

export const api = {
  get: (url, params) => {
    const qs = params ? new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v !== undefined && v !== null)).toString() : '';
    return chamar('GET', qs ? `${url}?${qs}` : url);
  },
  post: (url, corpo) => chamar('POST', url, corpo ?? {}),
  put: (url, corpo) => chamar('PUT', url, corpo),
  patch: (url, corpo) => chamar('PATCH', url, corpo),
  del: (url) => chamar('DELETE', url),
};
