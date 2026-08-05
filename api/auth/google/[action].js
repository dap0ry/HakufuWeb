// /api/auth/google/start + /api/auth/google/callback in one function. Same
// external paths — this is the exact redirect URI registered in Google Cloud
// Console, unaffected by this internal reorganization.
const { sql } = require('../../../lib/db');
const { buildConsentUrl, exchangeCodeForTokens } = require('../../../lib/google');

module.exports = async (req, res) => {
  const { action } = req.query;
  if (action === 'start'    && req.method === 'GET') return start(req, res);
  if (action === 'callback' && req.method === 'GET') return callback(req, res);
  return res.status(404).json({ detail: 'Not found' });
};

// Público a propósito — este endpoint solo redirige a Google. La identidad real
// se resuelve en el callback a partir de `state`, que es un link_code de un solo
// uso ya asociado a un username (ver /api/drive/link-start).
async function start(req, res) {
  const { state } = req.query;
  if (!state) return res.status(400).json({ detail: 'Falta el parámetro state' });

  let url;
  try {
    url = buildConsentUrl(state);
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }

  res.writeHead(302, { Location: url });
  res.end();
}

function page(title, message, ok) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
  body{font-family:'Segoe UI',system-ui,sans-serif;background:#0D0D0D;color:#F0F0F0;
    display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center;padding:24px}
  .card{max-width:360px}
  .icon{font-size:40px;margin-bottom:16px}
  h1{font-size:18px;margin:0 0 8px}
  p{font-size:13px;color:#AAAAAA;line-height:1.5}
</style></head><body>
  <div class="card">
    <div class="icon">${ok ? '✓' : '✕'}</div>
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body></html>`;
}

async function callback(req, res) {
  const { code, state, error } = req.query;

  if (error) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(page('Conexión cancelada', 'No se concedió acceso a Google Drive. Puedes cerrar esta pestaña.', false));
  }
  if (!code || !state) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(400).send(page('Enlace inválido', 'Faltan parámetros en la respuesta de Google.', false));
  }

  try {
    const codes = await sql`select username from link_codes where code = ${state} and expires_at > now()`;
    const linkRow = codes[0];
    if (!linkRow) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(400).send(page('Enlace caducado', 'Vuelve a pulsar "Conectar Google Drive" desde la app.', false));
    }

    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(400).send(page(
        'No se recibió acceso permanente',
        'Revoca el acceso de Hakufu en tu cuenta de Google (myaccount.google.com/permissions) y vuelve a intentarlo.',
        false
      ));
    }

    await sql`
      insert into google_connections (username, refresh_token, connected_at, updated_at)
      values (${linkRow.username}, ${tokens.refresh_token}, now(), now())
      on conflict (username) do update set
        refresh_token = excluded.refresh_token,
        updated_at = now()
    `;
    await sql`delete from link_codes where code = ${state}`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(page('Conectado ✓', 'Tu Google Drive está conectado a Hakufu. Puedes cerrar esta pestaña.', true));
  } catch (err) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(500).send(page('Error', err.message || 'No se pudo completar la conexión.', false));
  }
}
